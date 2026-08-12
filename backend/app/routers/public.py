import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/public", tags=["public"])

NOT_FOUND = HTTPException(
    404, "No repair order found for that RO number and phone combination"
)


def _norm_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("63") and len(digits) == 12:
        digits = digits[2:]
    return digits.lstrip("0")


@router.get("/track", response_model=schemas.TrackOrderOut)
def track_order(
    ro_number: str,
    phone: str,
    db: Session = Depends(get_db),
):
    order = (
        db.query(models.RepairOrder)
        .options(
            joinedload(models.RepairOrder.customer),
            joinedload(models.RepairOrder.item),
            joinedload(models.RepairOrder.parts).joinedload(models.RepairOrderPart.part),
        )
        .filter(
            models.RepairOrder.ro_number == ro_number.strip(),
            models.RepairOrder.deleted_at.is_(None),
        )
        .first()
    )
    if not order or not order.customer:
        raise NOT_FOUND
    if _norm_phone(order.customer.phone) != _norm_phone(phone):
        raise NOT_FOUND

    invoice = (
        db.query(models.Invoice)
        .filter(
            models.Invoice.repair_order_id == order.id,
            models.Invoice.deleted_at.is_(None),
        )
        .order_by(models.Invoice.id.desc())
        .first()
    )

    return schemas.TrackOrderOut(
        ro_number=order.ro_number,
        status=order.status.value,
        priority=order.priority.value,
        customer_name=order.customer.full_name,
        item_description=order.item.description if order.item else None,
        item_identifier=order.item.identifier if order.item else None,
        created_at=order.created_at,
        updated_at=order.updated_at,
        released_at=order.released_at,
        completed_at=order.completed_at,
        problem_description=order.problem_description,
        inspection_notes=order.inspection_notes,
        diagnosis=order.diagnosis,
        estimated_cost=float(order.estimated_cost) if order.estimated_cost is not None else None,
        actual_cost=float(order.actual_cost) if order.actual_cost is not None else None,
        labor_cost=float(order.labor_cost or 0),
        parts_total=order.parts_total,
        quote_total=order.quote_total,
        warranty_days=order.warranty_days or 0,
        warranty_notes=order.warranty_notes,
        parts=[
            schemas.TrackPartOut(
                name=p.part.name if p.part else "Unknown",
                sku=p.part.sku if p.part else None,
                quantity=p.quantity,
                unit_price=float(p.unit_price or 0),
                line_total=float((p.unit_price or 0) * (p.quantity or 0)),
            )
            for p in order.parts
        ],
        invoice=(
            schemas.TrackInvoiceOut(
                invoice_number=invoice.invoice_number,
                total=float(invoice.total or 0),
                amount_paid=float(invoice.amount_paid or 0),
                balance=float(invoice.total or 0) - float(invoice.amount_paid or 0),
                status=invoice.status.value,
            )
            if invoice
            else None
        ),
    )
