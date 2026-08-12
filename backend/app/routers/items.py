from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_permission

router = APIRouter(prefix="/api/items", tags=["items"])


@router.get("", response_model=list[schemas.ItemOut])
def list_items(
    customer_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.view.all", "repair_order.create", "customer.view")),
):
    query = db.query(models.Item).filter(models.Item.deleted_at.is_(None))
    if customer_id:
        query = query.filter(models.Item.customer_id == customer_id)
    return query.order_by(models.Item.id).all()


@router.post("", response_model=schemas.ItemOut, status_code=201)
def create_item(
    payload: schemas.ItemCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("repair_order.create", "customer.manage")),
):
    if not db.query(models.Customer).filter(
        models.Customer.id == payload.customer_id, models.Customer.deleted_at.is_(None)
    ).first():
        raise HTTPException(400, "Customer does not exist")
    item = models.Item(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
