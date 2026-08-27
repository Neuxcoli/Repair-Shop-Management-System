from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_permission, utcnow

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _visible(db: Session, customer_id: int) -> models.Customer | None:
    return (
        db.query(models.Customer)
        .filter(models.Customer.id == customer_id, models.Customer.deleted_at.is_(None))
        .first()
    )


@router.get("", response_model=list[schemas.CustomerOut])
def list_customers(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("customer.view", "customer.manage")),
):
    query = db.query(models.Customer).filter(models.Customer.deleted_at.is_(None))
    if q:
        query = query.filter(models.Customer.full_name.ilike(f"%{q}%"))
    return query.order_by(models.Customer.id.desc()).all()


@router.post("", response_model=schemas.CustomerOut, status_code=201)
def create_customer(
    payload: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("customer.manage", "customer.create")),
):
    customer = models.Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=schemas.CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("customer.view", "customer.manage")),
):
    customer = _visible(db, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    return customer


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(
    customer_id: int,
    payload: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("customer.manage")),
):
    customer = _visible(db, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    for key, value in payload.model_dump().items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}/orders", response_model=list[schemas.CustomerOrderOut])
def customer_orders(
    customer_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("customer.view", "customer.manage")),
):
    customer = _visible(db, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    orders = (
        db.query(models.RepairOrder)
        .filter(models.RepairOrder.customer_id == customer_id, models.RepairOrder.deleted_at.is_(None))
        .order_by(models.RepairOrder.id.desc())
        .all()
    )
    result = []
    for o in orders:
        result.append(schemas.CustomerOrderOut(
            id=o.id,
            ro_number=o.ro_number,
            status=o.status.value if isinstance(o.status, models.OrderStatus) else o.status,
            priority=o.priority.value if isinstance(o.priority, models.PriorityLevel) else o.priority,
            item_description=o.item.description if o.item else None,
            item_identifier=o.item.identifier if o.item else None,
            technician_name=o.technician.full_name if o.technician else None,
            created_at=o.created_at,
            completed_at=o.completed_at,
        ))
    return result


@router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("record.delete")),
):
    customer = _visible(db, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    if customer.orders:
        raise HTTPException(400, "Cannot delete a customer who has repair orders")
    if db.query(models.Invoice).filter(models.Invoice.customer_id == customer_id).first():
        raise HTTPException(400, "Cannot delete a customer who has invoices")
    customer.deleted_at = utcnow()
    db.commit()
