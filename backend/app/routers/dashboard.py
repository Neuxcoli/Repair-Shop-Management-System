from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..dependencies import require_permission
from ..schemas import DashboardSummary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_permission("dashboard.view"))])

CLOSED_STATUSES = (models.OrderStatus.closed, models.OrderStatus.cancelled, models.OrderStatus.rejected)


@router.get("/summary", response_model=DashboardSummary)
def summary(db: Session = Depends(get_db)):
    open_orders = (
        db.query(models.RepairOrder)
        .filter(
            models.RepairOrder.deleted_at.is_(None),
            models.RepairOrder.status.notin_(
                CLOSED_STATUSES + (models.OrderStatus.completed, models.OrderStatus.invoiced)
            ),
        )
        .count()
    )

    completed = (
        db.query(models.RepairOrder)
        .filter(
            models.RepairOrder.deleted_at.is_(None),
            models.RepairOrder.status.in_(
                [models.OrderStatus.completed, models.OrderStatus.invoiced, models.OrderStatus.closed]
            ),
        )
        .all()
    )
    if completed:
        def done_at(o):
            return o.completed_at or o.released_at or o.updated_at or o.created_at
        avg_turnaround = sum(
            (done_at(o) - o.created_at).total_seconds() for o in completed
        ) / len(completed) / 86400
    else:
        avg_turnaround = 0.0

    low_stock_threshold = 5
    settings = db.query(models.ShopSettings).first()
    if settings and settings.low_stock_threshold is not None:
        low_stock_threshold = settings.low_stock_threshold

    low_stock_parts = (
        db.query(models.Part)
        .filter(
            models.Part.deleted_at.is_(None),
            models.Part.qty_on_hand <= func.coalesce(models.Part.reorder_threshold, low_stock_threshold),
        )
        .count()
    )

    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue_this_month = (
        db.query(func.coalesce(func.sum(models.Invoice.amount_paid), 0))
        .filter(
            models.Invoice.deleted_at.is_(None),
            models.Invoice.issued_at >= month_start,
        )
        .scalar()
    )

    status_counts = (
        db.query(models.RepairOrder.status, func.count(models.RepairOrder.id))
        .filter(models.RepairOrder.deleted_at.is_(None))
        .group_by(models.RepairOrder.status)
        .all()
    )
    orders_by_status = {status.value: count for status, count in status_counts}

    return DashboardSummary(
        open_orders=open_orders,
        avg_turnaround_days=round(avg_turnaround, 1),
        low_stock_parts=low_stock_parts,
        revenue_this_month=float(revenue_this_month),
        orders_by_status=orders_by_status,
    )
