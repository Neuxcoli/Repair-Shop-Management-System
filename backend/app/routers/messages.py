from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from .. import models
from ..dependencies import require_permission
from ..database import get_db

router = APIRouter(prefix="/api/contact", tags=["contact"])


class ContactCreate(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    subject: str | None = None
    message: str


class ContactOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    full_name: str
    email: str
    phone: str | None = None
    subject: str | None = None
    message: str
    is_read: bool
    created_at: str


@router.post("", status_code=201)
def create_message(payload: ContactCreate, db: Session = Depends(get_db)):
    msg = models.ContactMessage(
        full_name=payload.full_name.strip(),
        email=payload.email.strip(),
        phone=(payload.phone or "").strip() or None,
        subject=(payload.subject or "").strip() or None,
        message=payload.message.strip(),
    )
    db.add(msg)
    db.commit()
    return {"ok": True}


@router.get("")
def list_messages(
    db: Session = Depends(get_db),
    _user: models.User = Depends(require_permission("settings.manage")),
):
    rows = (
        db.query(models.ContactMessage)
        .order_by(models.ContactMessage.id.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "full_name": r.full_name,
            "email": r.email,
            "phone": r.phone,
            "subject": r.subject,
            "message": r.message,
            "is_read": r.is_read,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
        for r in rows
    ]


@router.patch("/{msg_id}/read")
def mark_read(
    msg_id: int,
    db: Session = Depends(get_db),
    _user: models.User = Depends(require_permission("settings.manage")),
):
    msg = db.query(models.ContactMessage).filter(models.ContactMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    msg.is_read = True
    db.commit()
    return {"ok": True}


@router.delete("/{msg_id}")
def delete_message(
    msg_id: int,
    db: Session = Depends(get_db),
    _user: models.User = Depends(require_permission("settings.manage")),
):
    msg = db.query(models.ContactMessage).filter(models.ContactMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    db.delete(msg)
    db.commit()
    return {"ok": True}
