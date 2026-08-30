import re
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_permission

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"], dependencies=[Depends(require_permission("superadmin.view"))])


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@router.get("/overview", response_model=schemas.SuperadminOverview)
def overview(db: Session = Depends(get_db)):
    month_start = _month_start()

    admins = (
        db.query(func.count(models.User.id))
        .filter(models.User.role.in_(["admin", "superadmin"]), models.User.deleted_at.is_(None))
        .scalar()
    )
    technicians = (
        db.query(func.count(models.Technician.id))
        .filter(models.Technician.deleted_at.is_(None))
        .scalar()
    )
    customers = (
        db.query(func.count(models.Customer.id))
        .filter(models.Customer.deleted_at.is_(None))
        .scalar()
    )

    orders_total = (
        db.query(func.count(models.RepairOrder.id))
        .filter(models.RepairOrder.deleted_at.is_(None))
        .scalar()
    )
    orders_this_month = (
        db.query(func.count(models.RepairOrder.id))
        .filter(
            models.RepairOrder.deleted_at.is_(None),
            models.RepairOrder.created_at >= month_start,
        )
        .scalar()
    )

    paid_statuses = (models.InvoiceStatus.paid, models.InvoiceStatus.partially_paid)
    revenue_total = (
        db.query(func.coalesce(func.sum(models.Invoice.amount_paid), 0))
        .filter(
            models.Invoice.deleted_at.is_(None),
            models.Invoice.status.in_(paid_statuses),
        )
        .scalar()
    )
    revenue_this_month = (
        db.query(func.coalesce(func.sum(models.Invoice.amount_paid), 0))
        .filter(
            models.Invoice.deleted_at.is_(None),
            models.Invoice.status.in_(paid_statuses),
            models.Invoice.paid_at >= month_start,
        )
        .scalar()
    )

    new_customers_this_month = (
        db.query(func.count(models.Customer.id))
        .filter(
            models.Customer.deleted_at.is_(None),
            models.Customer.created_at >= month_start,
        )
        .scalar()
    )
    new_orders_this_month = (
        db.query(func.count(models.RepairOrder.id))
        .filter(
            models.RepairOrder.deleted_at.is_(None),
            models.RepairOrder.created_at >= month_start,
        )
        .scalar()
    )

    return schemas.SuperadminOverview(
        admins=admins,
        technicians=technicians,
        customers=customers,
        orders_total=orders_total,
        orders_this_month=orders_this_month,
        revenue_total=float(revenue_total),
        revenue_this_month=float(revenue_this_month),
        new_customers_this_month=new_customers_this_month,
        new_orders_this_month=new_orders_this_month,
    )


# ============ Account management (superadmin only) ============

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")
    return base[:30] or "user"


def _unique_username(db: Session, base: str) -> str:
    candidate = base
    suffix = 2
    while db.query(models.User).filter(models.User.username == candidate).first():
        candidate = f"{base}{suffix}"
        suffix += 1
    return candidate


def _to_account_out(user: models.User) -> schemas.AccountOut:
    name = None
    email = None
    phone = None
    if user.technician_id:
        t = user.technician
        name = t.full_name if t else None
        email = t.email if t else None
        phone = t.phone if t else None
    elif user.customer_id:
        c = user.customer
        name = c.full_name if c else None
        email = c.email if c else None
        phone = c.phone if c else None
    else:
        name = user.username
    return schemas.AccountOut(
        user_id=user.id,
        username=user.username,
        role=user.role,
        name=name,
        email=email,
        phone=phone,
        is_active=user.is_active if user.is_active is not None else True,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


@router.get("/accounts", response_model=list[schemas.AccountOut])
def list_accounts(
    role: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.User)
        .options(
            joinedload(models.User.technician),
            joinedload(models.User.customer),
        )
        .filter(models.User.deleted_at.is_(None))
    )
    if role and role != "all":
        query = query.filter(models.User.role == role)
    if q:
        like = f"%{q}%"
        query = query.outerjoin(models.Technician, models.Technician.id == models.User.technician_id)
        query = query.outerjoin(models.Customer, models.Customer.id == models.User.customer_id)
        query = query.filter(
            or_(
                models.User.username.ilike(like),
                models.Technician.full_name.ilike(like),
                models.Technician.email.ilike(like),
                models.Customer.full_name.ilike(like),
                models.Customer.email.ilike(like),
            )
        )
    users = query.order_by(models.User.id).all()
    return [_to_account_out(u) for u in users]


@router.post("/accounts", response_model=schemas.AccountOut, status_code=201)
def create_account(
    payload: schemas.AccountCreate,
    db: Session = Depends(get_db),
):
    allowed_roles = {"admin", "superadmin", "technician", "customer"}
    if payload.role not in allowed_roles:
        raise HTTPException(400, f"Invalid role. Choose from {', '.join(sorted(allowed_roles))}")

    username = payload.username.strip()
    if not username:
        raise HTTPException(400, "Username is required")
    if len(payload.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(400, "Username already taken")

    technician = None
    customer = None

    if payload.role == "technician":
        if db.query(models.Technician).filter(models.Technician.email == payload.email).first():
            raise HTTPException(400, "A technician with this email already exists")
        technician = models.Technician(
            full_name=payload.name or username,
            email=payload.email or "",
            phone=payload.phone,
            specialty=payload.specialty or "General",
        )
        db.add(technician)
        db.flush()
    elif payload.role == "customer":
        customer = models.Customer(
            full_name=payload.name or username,
            email=payload.email,
            phone=payload.phone,
        )
        db.add(customer)
        db.flush()

    user = models.User(
        username=username or _unique_username(db, _slugify(payload.name or "user")),
        password=_hash_password(payload.password),
        role=payload.role,
        technician_id=technician.id if technician else None,
        customer_id=customer.id if customer else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_account_out(user)


@router.patch("/accounts/{user_id}/status", response_model=schemas.AccountOut)
def update_account_status(
    user_id: int,
    payload: schemas.AccountStatusUpdate,
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(404, "Account not found")
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return _to_account_out(user)


@router.post("/accounts/{user_id}/password", response_model=schemas.AccountOut)
def reset_account_password(
    user_id: int,
    payload: schemas.AccountPasswordUpdate,
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(404, "Account not found")
    if len(payload.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    user.password = _hash_password(payload.new_password)
    db.commit()
    db.refresh(user)
    return _to_account_out(user)


# ============ Technician performance (shop-wide) ============

CLOSED_OR_DONE = {
    models.OrderStatus.completed,
    models.OrderStatus.invoiced,
    models.OrderStatus.closed,
    models.OrderStatus.cancelled,
    models.OrderStatus.rejected,
}
OPEN_STATUSES = {
    models.OrderStatus.requested,
    models.OrderStatus.diagnosed,
    models.OrderStatus.approved,
    models.OrderStatus.in_progress,
    models.OrderStatus.on_hold,
}
DONE_STATUSES = {
    models.OrderStatus.completed,
    models.OrderStatus.invoiced,
    models.OrderStatus.closed,
}


@router.get("/technician-performance", response_model=list[schemas.TechnicianPerformanceOut])
def technician_performance(db: Session = Depends(get_db)):
    settings = db.query(models.ShopSettings).first()
    overload = {
        models.PriorityLevel.urgent: settings.overdue_urgent_hours if settings else 4,
        models.PriorityLevel.high: settings.overdue_high_hours if settings else 24,
        models.PriorityLevel.normal: settings.overdue_normal_hours if settings else 72,
        models.PriorityLevel.low: settings.overdue_low_hours if settings else 168,
    }
    now = datetime.now(timezone.utc)

    technicians = db.query(models.Technician).filter(models.Technician.deleted_at.is_(None)).all()
    result = []
    for t in technicians:
        orders = [o for o in t.orders if o.deleted_at is None]
        total = len(orders)
        open_orders = sum(1 for o in orders if _order_status(o) in OPEN_STATUSES)
        completed = sum(1 for o in orders if _order_status(o) in DONE_STATUSES)

        overdue = 0
        for o in orders:
            if _order_status(o) in CLOSED_OR_DONE:
                continue
            threshold_h = overload.get(o.priority, 72)
            created = o.created_at.replace(tzinfo=timezone.utc) if o.created_at and o.created_at.tzinfo is None else o.created_at
            if created is None:
                continue
            age_h = max(0.0, (now - created).total_seconds() / 3600)
            if age_h > threshold_h:
                overdue += 1

        overdue_rate = round((overdue / total * 100) if total else 0.0, 1)

        result.append(schemas.TechnicianPerformanceOut(
            id=t.id,
            full_name=t.full_name,
            email=t.email,
            specialty=t.specialty,
            status=t.status.value if isinstance(t.status, models.TechnicianStatus) else t.status,
            total_orders=total,
            open_orders=open_orders,
            completed_orders=completed,
            overdue_orders=overdue,
            overdue_rate=overdue_rate,
        ))
    return result


# ============ Customer insights (shop-wide) ============

@router.get("/customer-insights", response_model=schemas.CustomerInsightsOverview)
def customer_insights(db: Session = Depends(get_db)):
    customers = db.query(models.Customer).filter(models.Customer.deleted_at.is_(None)).all()
    dates = _customer_order_dates(db)
    spent_by_customer = dict(
        db.query(
            models.Invoice.customer_id,
            func.coalesce(func.sum(models.Invoice.amount_paid), 0),
        )
        .filter(models.Invoice.deleted_at.is_(None))
        .group_by(models.Invoice.customer_id)
        .all()
    )

    breakdown = {"in_progress": 0, "completed": 0, "no_orders": 0}
    result = []
    for c in customers:
        orders = [o for o in c.orders if o.deleted_at is None]
        total = len(orders)

        if any(_order_status(o) in OPEN_STATUSES for o in orders):
            status = "in_progress"
        elif total > 0:
            status = "completed"
        else:
            status = "no_orders"
        breakdown[status] += 1

        result.append(schemas.CustomerInsightOut(
            id=c.id,
            full_name=c.full_name,
            email=c.email,
            phone=c.phone,
            total_orders=total,
            total_spent=round(float(spent_by_customer.get(c.id, 0)), 2),
            last_order_at=dates.get(c.id),
            status=status,
        ))

    return schemas.CustomerInsightsOverview(status_breakdown=breakdown, customers=result)


def _customer_order_dates(db: Session) -> dict[int, datetime]:
    """Latest non-deleted order created_at per customer."""
    rows = (
        db.query(models.RepairOrder.customer_id, func.max(models.RepairOrder.created_at))
        .filter(models.RepairOrder.deleted_at.is_(None))
        .group_by(models.RepairOrder.customer_id)
        .all()
    )
    return {cid: dt for cid, dt in rows if dt is not None}


def _order_status(o: models.RepairOrder) -> models.OrderStatus:
    return o.status if isinstance(o.status, models.OrderStatus) else models.OrderStatus(o.status)
