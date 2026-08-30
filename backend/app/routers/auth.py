import os
import re
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user, ROLE_PERMISSIONS

router = APIRouter(prefix="/api/auth", tags=["auth"])


def to_user_out(user: models.User) -> schemas.UserOut:
    out = schemas.UserOut.model_validate(user)
    out.permissions = sorted(ROLE_PERMISSIONS.get(user.role, set()))
    return out


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(user: models.User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "customer_id": user.customer_id,
        "technician_id": user.technician_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    return jwt.encode(payload, os.getenv("JWT_SECRET", "change-me"), algorithm="HS256")


@router.post("/login", response_model=schemas.LoginResponse)
def login(
    payload: schemas.LoginRequest,
    db: Session = Depends(get_db),
    login_as: str | None = Query(default=None),
):
    user = (
        db.query(models.User)
        .filter(models.User.username == payload.username, models.User.deleted_at.is_(None))
        .first()
    )
    if not user or not verify_password(payload.password, user.password):
        raise HTTPException(401, "Invalid username or password")
    if user.is_active is False:
        raise HTTPException(403, "This account has been deactivated. Contact your administrator.")

    if login_as == "technician" and user.role != "technician":
        raise HTTPException(403, "This login is for technicians only.")
    if login_as == "admin" and user.role != "admin":
        raise HTTPException(403, "This login is for administrators only.")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return schemas.LoginResponse(
        access_token=create_access_token(user),
        user=to_user_out(user),
    )


@router.post("/register", response_model=schemas.LoginResponse, status_code=201)
def register(payload: schemas.RegisterRequest, db: Session = Depends(get_db)):
    if not payload.full_name or not payload.email:
        raise HTTPException(400, "Full name and email are required")
    if len(payload.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    email_key = payload.email.strip().lower()
    existing = db.query(models.Customer).filter(
        func.lower(models.Customer.email) == email_key,
        models.Customer.deleted_at.is_(None),
    ).first()
    if existing:
        raise HTTPException(400, "An account with this email already exists")

    customer = models.Customer(
        full_name=payload.full_name.strip(),
        email=email_key or None,
        phone=payload.phone,
        address=payload.address,
    )
    db.add(customer)
    db.flush()

    base = re.sub(r"[^a-z0-9]+", "_", email_key.split("@")[0].strip("_")[:30]) or "customer"
    username = base
    suffix = 2
    while db.query(models.User).filter(models.User.username == username).first():
        username = f"{base}{suffix}"
        suffix += 1

    user = models.User(
        username=username,
        password=hash_password(payload.password),
        role="customer",
        customer_id=customer.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return schemas.LoginResponse(access_token=create_access_token(user), user=to_user_out(user))


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return to_user_out(user)


@router.put("/password", response_model=schemas.UserOut)
def change_password(
    payload: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.password):
        raise HTTPException(400, "Current password is incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    user.password = hash_password(payload.new_password)
    db.commit()
    db.refresh(user)
    return to_user_out(user)
