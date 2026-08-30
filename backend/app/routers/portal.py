import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..availability import validate_slot
from ..database import get_db
from ..dependencies import get_current_user
from .orders import ORDER_OPTIONS, _next_ro_number, _record_status_change

router = APIRouter(prefix="/api/portal", tags=["portal"])


def _customer_user(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "customer" or not user.customer_id:
        raise HTTPException(403, "A customer account is required")
    return user


def _get_customer_order(order_id: int, user: models.User, db: Session) -> models.RepairOrder:
    order = (
        db.query(models.RepairOrder)
        .filter(
            models.RepairOrder.id == order_id,
            models.RepairOrder.customer_id == user.customer_id,
            models.RepairOrder.deleted_at.is_(None),
        )
        .first()
    )
    if not order:
        raise HTTPException(404, "Repair order not found")
    return order


def _with_order_data(db: Session, order: models.RepairOrder) -> models.RepairOrder:
    return (
        db.query(models.RepairOrder)
        .options(*ORDER_OPTIONS)
        .filter(models.RepairOrder.id == order.id)
        .first()
    )


def _apply_photo_url(photo: models.OrderPhoto) -> str:
    # Local disk fallback serves uploaded files at /uploads/... path.
    key = photo.object_key or ""
    if key.startswith("http://") or key.startswith("https://"):
        return key
    return f"/api/uploads/{key.lstrip('/')}"


def _photo_out(photo: models.OrderPhoto) -> schemas.OrderPhotoOut:
    return schemas.OrderPhotoOut(
        id=photo.id,
        repair_order_id=photo.repair_order_id,
        object_key=photo.object_key,
        caption=photo.caption,
        created_at=photo.created_at,
        url=_apply_photo_url(photo),
    )


@router.get("/me", response_model=schemas.UserOut)
def my_profile(user: models.User = Depends(_customer_user)):
    return schemas.UserOut.model_validate(user)


@router.get("/items", response_model=list[schemas.ItemOut])
def my_items(db: Session = Depends(get_db), user: models.User = Depends(_customer_user)):
    return (
        db.query(models.Item)
        .filter(models.Item.customer_id == user.customer_id, models.Item.deleted_at.is_(None))
        .order_by(models.Item.id.desc())
        .all()
    )


@router.post("/items", response_model=schemas.ItemOut, status_code=201)
def create_item(
    payload: schemas.PortalItemCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    item = models.Item(customer_id=user.customer_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _order_list_out(o: models.RepairOrder) -> schemas.PortalOrderListOut:
    return schemas.PortalOrderListOut(
        id=o.id,
        ro_number=o.ro_number,
        status=o.status.value if isinstance(o.status, models.OrderStatus) else o.status,
        priority=o.priority.value if isinstance(o.priority, models.PriorityLevel) else o.priority,
        tracking_token=o.tracking_token,
        created_at=o.created_at,
        updated_at=o.updated_at,
        released_at=o.released_at,
        completed_at=o.completed_at,
        appointment_datetime=o.appointment_datetime,
        item_description=o.item.description if o.item else None,
        item_identifier=o.item.identifier if o.item else None,
    )


def _order_detail_out(db: Session, o: models.RepairOrder) -> schemas.PortalOrderDetailOut:
    photos = (
        db.query(models.OrderPhoto)
        .filter(models.OrderPhoto.repair_order_id == o.id)
        .order_by(models.OrderPhoto.id.desc())
        .all()
    )
    history = sorted(o.status_history or [], key=lambda h: h.id)
    history_out = [
        schemas.StatusHistoryOut(
            id=h.id,
            from_status=h.from_status.value if h.from_status else None,
            to_status=h.to_status.value,
            changed_by=h.changed_by,
            note=h.note,
            created_at=h.created_at,
        )
        for h in history
    ]
    parts_out = [
        schemas.PortalLineOut(
            name=p.part.name if p.part else "Part",
            quantity=p.quantity,
            unit_price=float(p.unit_price or 0),
            line_total=float(p.unit_price or 0) * (p.quantity or 1),
        )
        for p in (o.parts or [])
    ]
    return schemas.PortalOrderDetailOut(
        id=o.id,
        ro_number=o.ro_number,
        status=o.status.value if isinstance(o.status, models.OrderStatus) else o.status,
        priority=o.priority.value if isinstance(o.priority, models.PriorityLevel) else o.priority,
        tracking_token=o.tracking_token,
        created_at=o.created_at,
        updated_at=o.updated_at,
        completed_at=o.completed_at,
        appointment_datetime=o.appointment_datetime,
        item_description=o.item.description if o.item else None,
        item_identifier=o.item.identifier if o.item else None,
        problem_description=o.problem_description,
        diagnosis=o.diagnosis,
        warranty_days=o.warranty_days or 0,
        warranty_notes=o.warranty_notes,
        labor_cost=float(o.labor_cost or 0),
        parts_total=float(sum((p.unit_price or 0) * (p.quantity or 0) for p in (o.parts or []))),
        quote_total=float((o.labor_cost or 0) + sum((p.unit_price or 0) * (p.quantity or 0) for p in (o.parts or []))),
        parts=parts_out,
        status_history=history_out,
        photos=[_photo_out(p) for p in photos],
    )


@router.get("/orders", response_model=list[schemas.PortalOrderListOut])
def my_orders(db: Session = Depends(get_db), user: models.User = Depends(_customer_user)):
    orders = (
        db.query(models.RepairOrder)
        .options(joinedload(models.RepairOrder.item))
        .filter(
            models.RepairOrder.customer_id == user.customer_id,
            models.RepairOrder.deleted_at.is_(None),
        )
        .order_by(models.RepairOrder.created_at.desc())
        .all()
    )
    return [_order_list_out(o) for o in orders]


@router.get("/orders/{order_id}", response_model=schemas.PortalOrderDetailOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    order = _get_customer_order(order_id, user, db)
    full = _with_order_data(db, order)
    return _order_detail_out(db, full)


@router.post("/orders", response_model=schemas.PortalOrderDetailOut, status_code=201)
def create_order(
    payload: schemas.PortalOrderCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    # Validate the chosen appointment slot before creating anything.
    if payload.appointment_datetime is not None:
        try:
            validate_slot(db, payload.appointment_datetime)
        except ValueError as exc:
            raise HTTPException(400, str(exc))

    # Support both an existing item and a brand-new item in one request.
    if payload.type == "new":
        item = models.Item(
            customer_id=user.customer_id,
            description=payload.item_description or "New item",
            identifier=payload.item_identifier,
        )
        db.add(item)
        db.flush()
        item_id = item.id
    else:
        if not payload.item_id:
            raise HTTPException(400, "Please select an item")
        item = (
            db.query(models.Item)
            .filter(
                models.Item.id == payload.item_id,
                models.Item.customer_id == user.customer_id,
                models.Item.deleted_at.is_(None),
            )
            .first()
        )
        if not item:
            raise HTTPException(400, "Item does not exist for this account")
        item_id = item.id

    order = models.RepairOrder(
        ro_number=_next_ro_number(db),
        tracking_token=secrets.token_urlsafe(16),
        customer_id=user.customer_id,
        item_id=item_id,
        problem_description=payload.problem_description,
        status=models.OrderStatus.requested,
        appointment_datetime=payload.appointment_datetime,
    )
    db.add(order)
    db.flush()
    _record_status_change(db, order, user, order.status, note="Order received", from_status=None)
    db.commit()
    db.refresh(order)
    full = _with_order_data(db, order)
    return _order_detail_out(db, full)


@router.post("/orders/{order_id}/cancel", response_model=schemas.PortalOrderDetailOut)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    order = _get_customer_order(order_id, user, db)
    if order.status != models.OrderStatus.requested:
        raise HTTPException(409, "Only new orders can be cancelled")
    _record_status_change(
        db,
        order,
        user,
        models.OrderStatus.cancelled,
        note="Cancelled by customer",
        from_status=order.status,
    )
    order.status = models.OrderStatus.cancelled
    db.commit()
    db.refresh(order)
    full = _with_order_data(db, order)
    return _order_detail_out(db, full)


# ---------- Order photos (customer can view photos on their own orders) ----------
@router.get("/orders/{order_id}/photos", response_model=list[schemas.OrderPhotoOut])
def order_photos(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    _get_customer_order(order_id, user, db)
    photos = (
        db.query(models.OrderPhoto)
        .filter(models.OrderPhoto.repair_order_id == order_id)
        .order_by(models.OrderPhoto.id.desc())
        .all()
    )
    return [_photo_out(p) for p in photos]


# ---------- Additional-cost / quote approval ----------
@router.get("/additional-costs", response_model=list[schemas.AdditionalCostRequestOut])
def my_additional_costs(db: Session = Depends(get_db), user: models.User = Depends(_customer_user)):
    order_ids = [
        o.id
        for o in db.query(models.RepairOrder)
        .filter(models.RepairOrder.customer_id == user.customer_id, models.RepairOrder.deleted_at.is_(None))
        .all()
    ]
    if not order_ids:
        return []
    return (
        db.query(models.AdditionalCostRequest)
        .filter(models.AdditionalCostRequest.repair_order_id.in_(order_ids))
        .order_by(models.AdditionalCostRequest.repair_order_id.desc(), models.AdditionalCostRequest.id.desc())
        .all()
    )


@router.post("/additional-costs/{req_id}/respond", response_model=schemas.AdditionalCostRequestOut)
def respond_additional_cost(
    req_id: int,
    payload: schemas.AdditionalCostRespond,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    req = db.get(models.AdditionalCostRequest, req_id)
    if not req:
        raise HTTPException(404, "Request not found")
    if req.status != models.AdditionalCostRequestStatus.pending:
        raise HTTPException(409, "This request has already been responded to")

    order = (
        db.query(models.RepairOrder)
        .filter(
            models.RepairOrder.id == req.repair_order_id,
            models.RepairOrder.customer_id == user.customer_id,
            models.RepairOrder.deleted_at.is_(None),
        )
        .first()
    )
    if not order:
        raise HTTPException(404, "Repair order not found")

    new_status = payload.status
    if new_status == "approved":
        req.status = models.AdditionalCostRequestStatus.approved
    elif new_status == "declined":
        req.status = models.AdditionalCostRequestStatus.declined
    else:
        raise HTTPException(400, "Status must be 'approved' or 'declined'")
    req.responded_at = datetime.now(timezone.utc)
    _record_status_change(
        db,
        order,
        user,
        order.status,
        note=(
            f"Customer approved additional cost of {req.amount}"
            if new_status == "approved"
            else f"Customer declined additional cost of {req.amount}"
        ),
        from_status=order.status,
    )
    db.commit()
    db.refresh(req)
    return req


# ---------- Invoices (customer's own) ----------
@router.get("/invoices", response_model=list[schemas.PortalInvoiceOut])
def my_invoices(db: Session = Depends(get_db), user: models.User = Depends(_customer_user)):
    invoices = (
        db.query(models.Invoice)
        .options(
            joinedload(models.Invoice.repair_order)
        )
        .filter(
            models.Invoice.customer_id == user.customer_id,
            models.Invoice.deleted_at.is_(None),
        )
        .order_by(models.Invoice.id.desc())
        .all()
    )
    result = []
    for inv in invoices:
        result.append(_invoice_out(inv))
    return result


def _invoice_out(inv: models.Invoice) -> schemas.PortalInvoiceOut:
    total = float(inv.total or 0)
    paid = float(inv.amount_paid or 0)
    return schemas.PortalInvoiceOut(
        id=inv.id,
        invoice_number=inv.invoice_number,
        repair_order_id=inv.repair_order_id,
        total=total,
        amount_paid=paid,
        balance=total - paid,
        status=inv.status.value if isinstance(inv.status, models.InvoiceStatus) else inv.status,
        issued_at=inv.issued_at,
        paid_at=inv.paid_at,
        ro_number=inv.repair_order.ro_number if inv.repair_order else None,
        order_date=inv.repair_order.created_at if inv.repair_order else None,
    )


@router.get("/invoices/{invoice_id}", response_model=schemas.PortalInvoiceDetailOut)
def invoice_detail(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    inv = (
        db.query(models.Invoice)
        .options(
            joinedload(models.Invoice.repair_order)
        )
        .filter(
            models.Invoice.id == invoice_id,
            models.Invoice.customer_id == user.customer_id,
            models.Invoice.deleted_at.is_(None),
        )
        .first()
    )
    if not inv:
        raise HTTPException(404, "Invoice not found")

    order = inv.repair_order
    line_items: list[schemas.PortalInvoiceLineOut] = []
    if order:
        if float(order.labor_cost or 0) > 0:
            line_items.append(
                schemas.PortalInvoiceLineOut(
                    description="Labor",
                    quantity=1,
                    unit_price=float(order.labor_cost or 0),
                    line_total=float(order.labor_cost or 0),
                )
            )
        for p in order.parts:
            line_items.append(
                schemas.PortalInvoiceLineOut(
                    description=p.part.name if p.part else "Part",
                    quantity=p.quantity,
                    unit_price=float(p.unit_price or 0),
                    line_total=float(p.unit_price or 0) * (p.quantity or 1),
                )
            )
        # Include any approved additional-cost requests so the invoice reflects them.
        approved = [
            r for r in order.additional_cost_requests
            if r.status == models.AdditionalCostRequestStatus.approved
        ]
        for r in approved:
            line_items.append(
                schemas.PortalInvoiceLineOut(
                    description=f"Additional work: {r.reason or 'extra repair'}",
                    quantity=1,
                    unit_price=float(r.amount or 0),
                    line_total=float(r.amount or 0),
                )
            )

    total = float(inv.total or 0)
    paid = float(inv.amount_paid or 0)
    return schemas.PortalInvoiceDetailOut(
        id=inv.id,
        invoice_number=inv.invoice_number,
        repair_order_id=inv.repair_order_id,
        total=total,
        amount_paid=paid,
        balance=total - paid,
        status=inv.status.value if isinstance(inv.status, models.InvoiceStatus) else inv.status,
        issued_at=inv.issued_at,
        paid_at=inv.paid_at,
        ro_number=order.ro_number if order else None,
        order_date=order.created_at if order else None,
        line_items=line_items,
        order_item_description=order.item.description if order and order.item else None,
    )
