from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_permission, utcnow

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


def _next_invoice_number(db: Session) -> str:
    last = db.query(func.max(models.Invoice.id)).scalar() or 2037
    return f"INV-{last + 1}"


@router.get("", response_model=list[schemas.InvoiceOut])
def list_invoices(
    status: str | None = None,
    repair_order_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("invoice.view")),
):
    query = db.query(models.Invoice).options(
        joinedload(models.Invoice.customer), joinedload(models.Invoice.repair_order)
    ).filter(models.Invoice.deleted_at.is_(None))
    if repair_order_id:
        query = query.filter(models.Invoice.repair_order_id == repair_order_id)
    if status:
        query = query.filter(models.Invoice.status == status)
    return query.order_by(models.Invoice.id.desc()).all()


@router.post("", response_model=schemas.InvoiceOut, status_code=201)
def create_invoice(
    payload: schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("invoice.create")),
):
    order = db.get(models.RepairOrder, payload.repair_order_id)
    if not order:
        raise HTTPException(400, "Repair order does not exist")

    if order.status != models.OrderStatus.completed:
        raise HTTPException(409, "Only completed orders can be invoiced")
    if (
        db.query(models.Invoice)
        .filter(models.Invoice.repair_order_id == order.id)
        .first()
    ):
        raise HTTPException(409, "Order already has an invoice")

    invoice = models.Invoice(invoice_number=_next_invoice_number(db), **payload.model_dump())
    db.add(invoice)
    order.status = models.OrderStatus.invoiced
    db.add(
        models.RepairOrderStatusHistory(
            repair_order_id=order.id,
            from_status=models.OrderStatus.completed,
            to_status=models.OrderStatus.invoiced,
            changed_by=user.id,
            note="Invoice issued",
        )
    )
    db.commit()
    db.refresh(invoice)
    return invoice


@router.put("/{invoice_id}", response_model=schemas.InvoiceOut)
def update_invoice(
    invoice_id: int,
    payload: schemas.InvoiceUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("invoice.edit")),
):
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == invoice_id, models.Invoice.deleted_at.is_(None))
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(invoice, key, value)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.put("/{invoice_id}/void", response_model=schemas.InvoiceOut)
def void_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("invoice.void")),
):
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == invoice_id, models.Invoice.deleted_at.is_(None))
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status == models.InvoiceStatus.void:
        raise HTTPException(409, "Invoice is already void")
    invoice.status = models.InvoiceStatus.void
    db.commit()
    db.refresh(invoice)
    return invoice


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("invoice.edit")),
):
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == invoice_id, models.Invoice.deleted_at.is_(None))
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    invoice.deleted_at = utcnow()
    db.commit()
