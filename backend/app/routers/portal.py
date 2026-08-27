import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
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


@router.get("/orders", response_model=list[schemas.RepairOrderOut])
def my_orders(db: Session = Depends(get_db), user: models.User = Depends(_customer_user)):
    return (
        db.query(models.RepairOrder)
        .options(*ORDER_OPTIONS)
        .filter(
            models.RepairOrder.customer_id == user.customer_id,
            models.RepairOrder.deleted_at.is_(None),
        )
        .order_by(models.RepairOrder.created_at.desc())
        .all()
    )


@router.get("/orders/{order_id}", response_model=schemas.RepairOrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
    order = _get_customer_order(order_id, user, db)
    return (
        db.query(models.RepairOrder)
        .options(*ORDER_OPTIONS)
        .filter(models.RepairOrder.id == order.id)
        .first()
    )


@router.post("/orders", response_model=schemas.RepairOrderOut, status_code=201)
def create_order(
    payload: schemas.PortalOrderCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(_customer_user),
):
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

    order = models.RepairOrder(
        ro_number=_next_ro_number(db),
        tracking_token=secrets.token_urlsafe(16),
        customer_id=user.customer_id,
        item_id=item.id,
        problem_description=payload.problem_description,
        status=models.OrderStatus.requested,
    )
    db.add(order)
    db.flush()
    _record_status_change(db, order, user, order.status, note="Order received", from_status=None)
    db.commit()
    db.refresh(order)
    return order


@router.post("/orders/{order_id}/cancel", response_model=schemas.RepairOrderOut)
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
    return order
