from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_permission, utcnow

router = APIRouter(prefix="/api/parts", tags=["parts"])


@router.get("", response_model=list[schemas.PartOut])
def list_parts(
    q: str | None = None,
    low_stock: bool = False,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("parts.view", "parts.manage")),
):
    query = db.query(models.Part).filter(models.Part.deleted_at.is_(None))
    if q:
        query = query.filter(
            (models.Part.name.ilike(f"%{q}%")) | (models.Part.sku.ilike(f"%{q}%"))
        )
    if low_stock:
        query = query.filter(models.Part.qty_on_hand <= models.Part.reorder_threshold)
    return query.order_by(models.Part.id).all()


@router.post("", response_model=schemas.PartOut, status_code=201)
def create_part(
    payload: schemas.PartCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("parts.manage")),
):
    if db.query(models.Part).filter(models.Part.sku == payload.sku).first():
        raise HTTPException(400, "SKU already exists")
    part = models.Part(**payload.model_dump())
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


@router.put("/{part_id}", response_model=schemas.PartOut)
def update_part(
    part_id: int,
    payload: schemas.PartCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("parts.manage")),
):
    part = (
        db.query(models.Part)
        .filter(models.Part.id == part_id, models.Part.deleted_at.is_(None))
        .first()
    )
    if not part:
        raise HTTPException(404, "Part not found")
    for key, value in payload.model_dump().items():
        setattr(part, key, value)
    db.commit()
    db.refresh(part)
    return part


@router.delete("/{part_id}", status_code=204)
def delete_part(
    part_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("record.delete")),
):
    part = (
        db.query(models.Part)
        .filter(models.Part.id == part_id, models.Part.deleted_at.is_(None))
        .first()
    )
    if not part:
        raise HTTPException(404, "Part not found")
    if db.query(models.RepairOrderPart).filter(models.RepairOrderPart.part_id == part_id).first():
        raise HTTPException(400, "Cannot delete a part that is used in repair orders")
    part.deleted_at = utcnow()
    db.commit()
