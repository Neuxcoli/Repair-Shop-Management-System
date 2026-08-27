import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/public", tags=["public"])

_UNIFIED_MSG = "No repair order found with that information."


def _normalize_phone(value: str) -> str:
    """Strip spaces, dashes, parens so +63 917 123 4567 matches +639171234567."""
    return re.sub(r"[\s\-\(\)]", "", value.strip().lower())


@router.get("/track")
def track_order(
    ro_number: str = Query(..., min_length=1),
    phone: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Public lookup: RO number + phone number. Returns minimal safe fields."""
    order = (
        db.query(models.RepairOrder)
        .options(
            joinedload(models.RepairOrder.customer),
            joinedload(models.RepairOrder.item),
        )
        .filter(
            models.RepairOrder.ro_number.ilike(ro_number.strip()),
            models.RepairOrder.deleted_at.is_(None),
        )
        .first()
    )

    # Always use the same message — don't leak whether the RO# exists
    if not order or not order.customer:
        raise HTTPException(404, _UNIFIED_MSG)

    cust_phone = _normalize_phone(order.customer.phone or "")
    input_phone = _normalize_phone(phone)

    # Also accept email as a second factor
    cust_email = (order.customer.email or "").strip().lower()
    input_email = phone.strip().lower()

    if cust_phone != input_phone and cust_email != input_email:
        raise HTTPException(404, _UNIFIED_MSG)

    return {
        "ro_number": order.ro_number,
        "status": order.status.value,
        "priority": order.priority.value,
        "item_description": order.item.description if order.item else None,
        "item_identifier": order.item.identifier if order.item else None,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "released_at": order.released_at,
        "completed_at": order.completed_at,
    }
