import secrets

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models, schemas
from ..database import get_db
from ..dependencies import has_permission, require_permission, utcnow

router = APIRouter(prefix="/api/orders", tags=["repair orders"])

# Spec lifecycle (see module brief §6). 'invoiced' and 'closed' are set by
# the system (invoice creation / full payment) and are not manually reachable.
TRANSITIONS = {
    models.OrderStatus.requested: [models.OrderStatus.diagnosed, models.OrderStatus.cancelled],
    models.OrderStatus.diagnosed: [models.OrderStatus.approved, models.OrderStatus.rejected],
    models.OrderStatus.approved: [models.OrderStatus.in_progress],
    models.OrderStatus.in_progress: [models.OrderStatus.on_hold, models.OrderStatus.completed],
    models.OrderStatus.on_hold: [models.OrderStatus.in_progress],
    models.OrderStatus.completed: [],
    models.OrderStatus.invoiced: [],
    models.OrderStatus.closed: [],
    models.OrderStatus.cancelled: [],
    models.OrderStatus.rejected: [],
}

# Technician may advance their own assigned orders through these transitions.
TECH_TRANSITIONS = {
    models.OrderStatus.requested: [models.OrderStatus.diagnosed],
    models.OrderStatus.approved: [models.OrderStatus.in_progress],
    models.OrderStatus.in_progress: [models.OrderStatus.on_hold, models.OrderStatus.completed],
    models.OrderStatus.on_hold: [models.OrderStatus.in_progress],
}

TERMINAL_STATUSES = {models.OrderStatus.closed, models.OrderStatus.cancelled, models.OrderStatus.rejected}

# Spec §4: permission required to move INTO a given status.
TRANSITION_PERMISSION = {
    models.OrderStatus.diagnosed: "repair_order.diagnose",
    models.OrderStatus.approved: "repair_order.approve",
    models.OrderStatus.in_progress: "repair_order.start",
    models.OrderStatus.completed: "repair_order.complete",
    models.OrderStatus.cancelled: "repair_order.cancel",
    models.OrderStatus.rejected: "repair_order.approve",
}

ORDER_OPTIONS = (
    joinedload(models.RepairOrder.customer),
    joinedload(models.RepairOrder.item),
    joinedload(models.RepairOrder.technician),
    selectinload(models.RepairOrder.parts).selectinload(models.RepairOrderPart.part),
    selectinload(models.RepairOrder.status_history),
)


def _record_status_change(
    db: Session,
    order: models.RepairOrder,
    user: models.User,
    to_status: models.OrderStatus,
    note: str | None = None,
    from_status: models.OrderStatus | None = None,
) -> None:
    db.add(
        models.RepairOrderStatusHistory(
            repair_order_id=order.id,
            from_status=from_status,
            to_status=to_status,
            changed_by=user.id,
            note=note,
        )
    )


def _transition_status(
    db: Session,
    order: models.RepairOrder,
    user: models.User,
    to_status: models.OrderStatus,
) -> None:
    current = order.status
    if current == to_status:
        return

    perm = TRANSITION_PERMISSION.get(to_status)
    if perm and not has_permission(user, perm):
        raise HTTPException(403, "Insufficient permissions")

    allowed = TRANSITIONS.get(current, [])
    if user.role == "technician":
        allowed = TECH_TRANSITIONS.get(current, [])

    if to_status not in allowed:
        raise HTTPException(
            409,
            f"Cannot move order from '{current.value}' to '{to_status.value}'",
        )

    if current == models.OrderStatus.diagnosed and to_status == models.OrderStatus.approved:
        order.estimated_cost = order.estimated_cost or order.quote_total or 0
        if float(order.estimated_cost or 0) <= 0:
            raise HTTPException(409, "Cannot approve an order without an estimated cost")

    if current == models.OrderStatus.approved and to_status == models.OrderStatus.in_progress:
        if not order.technician_id:
            raise HTTPException(409, "A technician must be assigned before starting work")
        if user.role == "technician" and order.technician_id != user.technician_id:
            raise HTTPException(403, "Insufficient permissions")

    if to_status == models.OrderStatus.completed:
        order.actual_cost = float(order.labor_cost or 0) + order.parts_total
        order.completed_at = func.now()

    if to_status == models.OrderStatus.closed:
        order.released_at = func.now()

    _record_status_change(db, order, user, to_status, from_status=current)
    order.status = to_status


def _next_ro_number(db: Session) -> str:
    last = db.query(func.max(models.RepairOrder.id)).scalar() or 8900
    return f"RO-{last + 1}"


def _get_order_or_404(order_id: int, db: Session) -> models.RepairOrder:
    order = (
        db.query(models.RepairOrder)
        .filter(models.RepairOrder.id == order_id, models.RepairOrder.deleted_at.is_(None))
        .first()
    )
    if not order:
        raise HTTPException(404, "Repair order not found")
    return order


def _check_technician_access(order: models.RepairOrder, user: models.User) -> None:
    if user.role == "technician" and order.technician_id != user.technician_id:
        raise HTTPException(403, "Insufficient permissions")


@router.get("", response_model=list[schemas.RepairOrderOut])
def list_orders(
    status: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.view", "repair_order.view.all")),
):
    query = (
        db.query(models.RepairOrder)
        .options(*ORDER_OPTIONS)
        .filter(models.RepairOrder.deleted_at.is_(None))
    )
    if not has_permission(user, "repair_order.view.all"):
        query = query.filter(models.RepairOrder.technician_id == user.technician_id)
    if status:
        query = query.filter(models.RepairOrder.status == status)
    if q:
        query = query.join(models.Customer).filter(
            (models.RepairOrder.ro_number.ilike(f"%{q}%"))
            | (models.Customer.full_name.ilike(f"%{q}%"))
        )
    return query.order_by(models.RepairOrder.id.desc()).all()


@router.get("/{order_id}", response_model=schemas.RepairOrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.view", "repair_order.view.all")),
):
    order = _get_order_or_404(order_id, db)
    _check_technician_access(order, user)
    return order


@router.post("", response_model=schemas.RepairOrderOut, status_code=201)
def create_order(
    payload: schemas.RepairOrderCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.create")),
):
    if not db.query(models.Customer).filter(
        models.Customer.id == payload.customer_id, models.Customer.deleted_at.is_(None)
    ).first():
        raise HTTPException(400, "Customer does not exist")
    if not db.query(models.Item).filter(
        models.Item.id == payload.item_id, models.Item.deleted_at.is_(None)
    ).first():
        raise HTTPException(400, "Item does not exist")

    order = models.RepairOrder(
        ro_number=_next_ro_number(db),
        tracking_token=secrets.token_urlsafe(16),
        **payload.model_dump(),
    )
    db.add(order)
    db.flush()
    _record_status_change(db, order, user, order.status, note="Order received", from_status=None)
    db.commit()
    db.refresh(order)
    return order


@router.patch("/{order_id}", response_model=schemas.RepairOrderOut)
def update_order(
    order_id: int,
    payload: schemas.RepairOrderUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(
        require_permission(
            "repair_order.create",
            "repair_order.diagnose",
            "repair_order.approve",
            "repair_order.assign",
            "repair_order.start",
            "repair_order.complete",
            "repair_order.cancel",
        )
    ),
):
    order = _get_order_or_404(order_id, db)
    _check_technician_access(order, user)

    data = payload.model_dump(exclude_unset=True)

    if user.role == "technician":
        allowed = {"status", "inspection_notes", "diagnosis"}
        forbidden = set(data) - allowed
        if forbidden:
            raise HTTPException(403, "Insufficient permissions")

    status = data.pop("status", None)
    if status is not None:
        _transition_status(db, order, user, models.OrderStatus(status))

    for key, value in data.items():
        setattr(order, key, value)
    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}", status_code=204)
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("record.delete")),
):
    order = _get_order_or_404(order_id, db)
    if db.query(models.Invoice).filter(models.Invoice.repair_order_id == order.id).first():
        raise HTTPException(400, "Cannot delete an order that has an invoice")
    order.deleted_at = utcnow()
    db.commit()


# ---------- Parts used ----------
@router.get("/{order_id}/parts", response_model=list[schemas.RepairOrderPartOut])
def list_order_parts(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.view", "repair_order.parts.add")),
):
    order = _get_order_or_404(order_id, db)
    _check_technician_access(order, user)
    return (
        db.query(models.RepairOrderPart)
        .options(joinedload(models.RepairOrderPart.part))
        .filter(models.RepairOrderPart.repair_order_id == order_id)
        .all()
    )


@router.post("/{order_id}/parts", response_model=schemas.RepairOrderPartOut, status_code=201)
def add_order_part(
    order_id: int,
    payload: schemas.RepairOrderPartCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.parts.add")),
):
    order = _get_order_or_404(order_id, db)
    _check_technician_access(order, user)
    part = (
        db.query(models.Part)
        .filter(models.Part.id == payload.part_id, models.Part.deleted_at.is_(None))
        .first()
    )
    if not part:
        raise HTTPException(404, "Part not found")
    if payload.quantity <= 0:
        raise HTTPException(400, "Quantity must be positive")
    if part.qty_on_hand < payload.quantity:
        raise HTTPException(400, f"Only {part.qty_on_hand} in stock")

    line = (
        db.query(models.RepairOrderPart)
        .filter(
            models.RepairOrderPart.repair_order_id == order.id,
            models.RepairOrderPart.part_id == part.id,
        )
        .first()
    )
    if line:
        line.quantity += payload.quantity
    else:
        line = models.RepairOrderPart(
            repair_order_id=order.id,
            part_id=part.id,
            quantity=payload.quantity,
            unit_price=part.unit_price,
        )
        db.add(line)
    part.qty_on_hand -= payload.quantity
    db.commit()
    db.refresh(line)
    return line


@router.delete("/{order_id}/parts/{line_id}", status_code=204)
def remove_order_part(
    order_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.parts.add")),
):
    order = _get_order_or_404(order_id, db)
    _check_technician_access(order, user)
    line = (
        db.query(models.RepairOrderPart)
        .filter(
            models.RepairOrderPart.id == line_id,
            models.RepairOrderPart.repair_order_id == order_id,
        )
        .first()
    )
    if not line:
        raise HTTPException(404, "Part line not found")
    part = db.get(models.Part, line.part_id)
    if part:
        part.qty_on_hand += line.quantity
    db.delete(line)
    db.commit()


# ---------- Additional-cost / quote approval (staff submits) ----------
@router.get("/{order_id}/additional-costs", response_model=list[schemas.AdditionalCostRequestOut])
def list_additional_costs(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.view", "repair_order.view.all")),
):
    order = _get_order_or_404(order_id, db)
    _check_technician_access(order, user)
    return (
        db.query(models.AdditionalCostRequest)
        .filter(models.AdditionalCostRequest.repair_order_id == order_id)
        .order_by(models.AdditionalCostRequest.id.desc())
        .all()
    )


@router.post(
    "/{order_id}/additional-costs",
    response_model=schemas.AdditionalCostRequestOut,
    status_code=201,
)
def create_additional_cost(
    order_id: int,
    payload: schemas.AdditionalCostRequestCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.diagnose", "repair_order.approve")),
):
    order = _get_order_or_404(order_id, db)
    _check_technician_access(order, user)
    if payload.amount is None or float(payload.amount) <= 0:
        raise HTTPException(400, "Amount must be positive")
    pending = (
        db.query(models.AdditionalCostRequest)
        .filter(
            models.AdditionalCostRequest.repair_order_id == order_id,
            models.AdditionalCostRequest.status == models.AdditionalCostRequestStatus.pending,
        )
        .first()
    )
    if pending:
        raise HTTPException(409, "There is already a pending approval for this order")
    req = models.AdditionalCostRequest(
        repair_order_id=order_id, amount=payload.amount, reason=payload.reason, created_by=user.id
    )
    db.add(req)
    _record_status_change(
        db, order, user, order.status, note=f"Additional cost of {payload.amount} requested for approval",
        from_status=order.status,
    )
    db.commit()
    db.refresh(req)
    return req


# ---------- Order photos (staff uploads) ----------
@router.get("/{order_id}/photos", response_model=list[schemas.OrderPhotoOut])
def list_photos(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.view", "repair_order.view.all")),
):
    order = _get_order_or_404(order_id, db)
    _check_technician_access(order, user)
    from ..storage import is_configured

    photos = (
        db.query(models.OrderPhoto)
        .filter(models.OrderPhoto.repair_order_id == order_id)
        .order_by(models.OrderPhoto.id.desc())
        .all()
    )
    result = []
    for p in photos:
        key = p.object_key or ""
        url = key if key.startswith("http") else f"/api/uploads/{key.lstrip('/')}"
        result.append(schemas.OrderPhotoOut(
            id=p.id,
            repair_order_id=p.repair_order_id,
            object_key=p.object_key,
            caption=p.caption,
            created_at=p.created_at,
            url=url,
        ))
    return result


@router.post(
    "/{order_id}/photos",
    response_model=schemas.OrderPhotoOut,
    status_code=201,
)
async def upload_photo(
    order_id: int,
    file: UploadFile = File(...),
    caption: str = Form(default=""),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.diagnose", "repair_order.parts.add")),
):
    order = _get_order_or_404(order_id, db)
    _check_technician_access(order, user)
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 8MB)")
    from ..storage import build_key, store

    key = build_key(order_id, file.filename or "photo.jpg")
    stored = store(key, data)
    photo = models.OrderPhoto(
        repair_order_id=order_id,
        object_key=stored,
        caption=caption or None,
        uploaded_by=user.id,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return schemas.OrderPhotoOut(
        id=photo.id,
        repair_order_id=photo.repair_order_id,
        object_key=photo.object_key,
        caption=photo.caption,
        created_at=photo.created_at,
        url=f"/api/uploads/{key.lstrip('/')}",
    )
