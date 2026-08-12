from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_permission

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("", response_model=list[schemas.PaymentOut])
def list_payments(
    invoice_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("invoice.view", "payment.record")),
):
    query = db.query(models.Payment)
    if invoice_id:
        query = query.filter(models.Payment.invoice_id == invoice_id)
    return query.order_by(models.Payment.paid_at.desc()).all()


@router.post("", response_model=schemas.PaymentOut, status_code=201)
def create_payment(
    payload: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("payment.record")),
):
    invoice = db.get(models.Invoice, payload.invoice_id)
    if not invoice or invoice.deleted_at is not None:
        raise HTTPException(404, "Invoice not found")
    if payload.amount <= 0:
        raise HTTPException(400, "Payment amount must be positive")

    payment = models.Payment(
        invoice_id=invoice.id,
        amount=payload.amount,
        method=payload.method or "cash",
        reference=payload.reference,
    )
    invoice.amount_paid = float(invoice.amount_paid or 0) + payload.amount
    invoice.status = (
        models.InvoiceStatus.paid
        if float(invoice.amount_paid) >= float(invoice.total)
        else models.InvoiceStatus.partially_paid
    )
    if invoice.status == models.InvoiceStatus.paid:
        invoice.paid_at = func.now()
    db.add(payment)

    order = db.get(models.RepairOrder, invoice.repair_order_id)
    if order and invoice.status == models.InvoiceStatus.paid and order.status != models.OrderStatus.closed:
        order.status = models.OrderStatus.closed
        order.released_at = func.now()
        db.add(
            models.RepairOrderStatusHistory(
                repair_order_id=order.id,
                from_status=models.OrderStatus.invoiced,
                to_status=models.OrderStatus.closed,
                changed_by=user.id,
                note="Fully paid",
            )
        )

    db.commit()
    db.refresh(payment)
    return payment
