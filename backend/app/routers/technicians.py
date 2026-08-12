import re

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_permission, utcnow

router = APIRouter(prefix="/api/technicians", tags=["technicians"])

DEFAULT_TECH_PASSWORD = "tech123"


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")
    return base[:30] or "tech"


def _unique_username(db: Session, base: str) -> str:
    candidate = base
    suffix = 2
    while db.query(models.User).filter(models.User.username == candidate).first():
        candidate = f"{base}{suffix}"
        suffix += 1
    return candidate


def _visible(db: Session, technician_id: int) -> models.Technician | None:
    return (
        db.query(models.Technician)
        .filter(models.Technician.id == technician_id, models.Technician.deleted_at.is_(None))
        .first()
    )


@router.get("", response_model=list[schemas.TechnicianOut])
def list_technicians(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("technician.view", "technician.manage")),
):
    query = db.query(models.Technician).filter(models.Technician.deleted_at.is_(None))
    if q:
        query = query.filter(models.Technician.full_name.ilike(f"%{q}%"))
    return query.order_by(models.Technician.id).all()


@router.post("", response_model=schemas.TechnicianOut, status_code=201)
def create_technician(
    payload: schemas.TechnicianCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("technician.manage")),
):
    if db.query(models.Technician).filter(models.Technician.email == payload.email).first():
        raise HTTPException(400, "A technician with this email already exists")

    technician = models.Technician(**payload.model_dump(exclude={"username", "password"}))
    db.add(technician)
    db.flush()

    username = _unique_username(db, _slugify(payload.username or payload.full_name))
    password = payload.password or DEFAULT_TECH_PASSWORD
    user = models.User(
        username=username,
        password=_hash_password(password),
        role="technician",
        technician_id=technician.id,
    )
    db.add(user)
    db.commit()
    db.refresh(technician)
    return technician


@router.put("/{technician_id}", response_model=schemas.TechnicianOut)
def update_technician(
    technician_id: int,
    payload: schemas.TechnicianCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("technician.manage")),
):
    technician = _visible(db, technician_id)
    if not technician:
        raise HTTPException(404, "Technician not found")
    if db.query(models.Technician).filter(
        models.Technician.email == payload.email, models.Technician.id != technician_id
    ).first():
        raise HTTPException(400, "A technician with this email already exists")

    for key, value in payload.model_dump(exclude={"username", "password"}).items():
        setattr(technician, key, value)

    user = db.query(models.User).filter(models.User.technician_id == technician.id).first()
    if payload.username is not None or payload.password:
        if not user:
            username = _unique_username(db, _slugify(payload.username or payload.full_name))
            user = models.User(
                username=username,
                password=_hash_password(payload.password or DEFAULT_TECH_PASSWORD),
                role="technician",
                technician_id=technician.id,
            )
            db.add(user)
        else:
            if payload.username:
                if db.query(models.User).filter(
                    models.User.username == payload.username, models.User.id != user.id
                ).first():
                    raise HTTPException(400, "Username already taken")
                user.username = payload.username
            if payload.password:
                user.password = _hash_password(payload.password)

    db.commit()
    db.refresh(technician)
    return technician


@router.delete("/{technician_id}", status_code=204)
def delete_technician(
    technician_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("record.delete")),
):
    technician = _visible(db, technician_id)
    if not technician:
        raise HTTPException(404, "Technician not found")
    if technician.orders:
        raise HTTPException(400, "Cannot delete a technician who has repair orders")
    user = db.query(models.User).filter(models.User.technician_id == technician.id).first()
    if user:
        user.deleted_at = utcnow()
    technician.deleted_at = utcnow()
    db.commit()
