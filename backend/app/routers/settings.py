from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_permission

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _get_or_create_settings(db: Session) -> models.ShopSettings:
    settings = db.query(models.ShopSettings).first()
    if not settings:
        settings = models.ShopSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=schemas.ShopSettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("settings.view")),
):
    return _get_or_create_settings(db)


@router.put("", response_model=schemas.ShopSettingsOut)
def update_settings(
    payload: schemas.ShopSettingsUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_permission("settings.manage")),
):
    settings = _get_or_create_settings(db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings
