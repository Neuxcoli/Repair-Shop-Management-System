from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_permission, require_roles, utcnow

router = APIRouter(prefix="/api/parts-orders", tags=["parts-orders"])
store = APIRouter(prefix="/api/store", tags=["store"])


def _customer_user(user: models.User = Depends(require_permission("portal.manage"))):
    if user.role != "customer" or not user.customer_id:
        raise HTTPException(403, "A customer account is required")
    return user


def _stock_status(part: models.Part) -> str:
    if part.qty_on_hand <= 0:
        return "out_of_stock"
    if part.reorder_threshold and part.qty_on_hand <= part.reorder_threshold:
        return "low_stock"
    return "in_stock"


def _next_parts_order_number(db: Session) -> str:
    last = db.query(models.PartsOrder.id).order_by(models.PartsOrder.id.desc()).first()
    return f"PO-{1000 + (last[0] if last else 0)}"


# ---------------- Customer store endpoint ----------------
@store.get("/catalog", response_model=list[schemas.CatalogPartOut])
def list_catalog(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    query = db.query(models.Part).filter(
        models.Part.deleted_at.is_(None),
        models.Part.available_for_purchase.is_(True),
    )
    if q:
        query = query.filter(
            (models.Part.name.ilike(f"%{q}%"))
            | (models.Part.description.ilike(f"%{q}%"))
            | (models.Part.sku.ilike(f"%{q}%"))
        )
    parts = query.order_by(models.Part.name).all()
    return [
        {
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "description": p.description,
            "unit_price": float(p.unit_price or 0),
            "stock_status": _stock_status(p),
        }
        for p in parts
    ]


def _serialize_parts_order(order: models.PartsOrder) -> dict:
    return {
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status.value if hasattr(order.status, "value") else order.status,
        "total": float(order.total or 0),
        "notes": order.notes,
        "created_at": order.created_at,
        "fulfilled_at": order.fulfilled_at,
        "customer": {"id": order.customer.id, "full_name": order.customer.full_name or ""}
        if order.customer
        else None,
        "items": [
            {
                "id": it.id,
                "part_id": it.part_id,
                "quantity": it.quantity,
                "unit_price": float(it.unit_price or 0),
                "name": it.part.name if it.part else "",
                "sku": it.part.sku if it.part else None,
                "line_total": float((it.unit_price or 0) * (it.quantity or 1)),
            }
            for it in order.items
        ],
    }


@store.get("/orders", response_model=list[schemas.PartsOrderOut])
def my_parts_orders(
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    orders = (
        db.query(models.PartsOrder)
        .filter(
            models.PartsOrder.customer_id == user.customer_id,
            models.PartsOrder.deleted_at.is_(None),
        )
        .order_by(models.PartsOrder.id.desc())
        .all()
    )
    return [_serialize_parts_order(o) for o in orders]


@store.post("/orders", response_model=schemas.PartsOrderOut, status_code=201)
def create_parts_order(
    payload: schemas.PartsOrderCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    if not payload.items:
        raise HTTPException(400, "Cart is empty")
    item_ids = list({i.part_id for i in payload.items})
    parts = (
        db.query(models.Part)
        .filter(
            models.Part.id.in_(item_ids),
            models.Part.deleted_at.is_(None),
            models.Part.available_for_purchase.is_(True),
        )
        .all()
    )
    parts_map = {p.id: p for p in parts}
    order = models.PartsOrder(
        order_number=_next_parts_order_number(db),
        customer_id=user.customer_id,
        status=models.PartsOrderStatus.pending,
        notes=payload.notes,
    )
    db.add(order)
    db.flush()
    total = 0
    for line in payload.items:
        part = parts_map.get(line.part_id)
        if not part:
            raise HTTPException(404, f"Part {line.part_id} not available for purchase")
        if part.qty_on_hand < line.quantity:
            raise HTTPException(400, f"Insufficient stock for {part.name}")
        unit_price = float(part.unit_price or 0)
        part.qty_on_hand -= line.quantity
        db.add(
            models.PartsOrderItem(
                parts_order_id=order.id,
                part_id=part.id,
                quantity=line.quantity,
                unit_price=unit_price,
            )
        )
        total += unit_price * line.quantity
    order.total = round(total, 2)
    db.commit()
    db.refresh(order)
    return _serialize_parts_order(order)


# ---------------- Admin fulfillment endpoints ----------------
@router.get("", response_model=list[schemas.PartsOrderOut])
def list_all_parts_orders(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("parts.manage", "invoice.view")),
):
    query = db.query(models.PartsOrder).filter(models.PartsOrder.deleted_at.is_(None))
    if status:
        query = query.filter(models.PartsOrder.status == status)
    orders = query.order_by(models.PartsOrder.id.desc()).all()
    return [_serialize_parts_order(o) for o in orders]


@router.post("/{order_id}/fulfill", response_model=schemas.PartsOrderOut)
def fulfill_parts_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("parts.manage", "invoice.view")),
):
    order = (
        db.query(models.PartsOrder)
        .filter(
            models.PartsOrder.id == order_id,
            models.PartsOrder.deleted_at.is_(None),
        )
        .first()
    )
    if not order:
        raise HTTPException(404, "Parts order not found")
    if order.status != models.PartsOrderStatus.pending:
        raise HTTPException(400, "Only pending orders can be fulfilled")
    order.status = models.PartsOrderStatus.fulfilled
    order.fulfilled_at = utcnow()
    db.commit()
    db.refresh(order)
    return _serialize_parts_order(order)
