import os
from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models
from .database import get_db

bearer_scheme = HTTPBearer(auto_error=False)

ALL_PERMISSIONS = {
    "repair_order.view",
    "repair_order.view.all",
    "repair_order.create",
    "repair_order.diagnose",
    "repair_order.approve",
    "repair_order.assign",
    "repair_order.start",
    "repair_order.complete",
    "repair_order.cancel",
    "repair_order.parts.add",
    "customer.view",
    "customer.manage",
    "customer.create",
    "parts.view",
    "parts.manage",
    "invoice.view",
    "invoice.create",
    "invoice.edit",
    "invoice.void",
    "payment.record",
    "technician.view",
    "technician.manage",
    "user.manage",
    "dashboard.view",
    "record.delete",
    "settings.manage",
    "settings.view",
    "superadmin.view",
    "portal.view",
    "portal.manage",
}

# Spec §4 role-and-permission matrix.
ROLE_PERMISSIONS = {
    "customer": {
        "portal.view",
        "portal.manage",
        "settings.view",
    },
    "technician": {
        "repair_order.view",
        "repair_order.create",
        "repair_order.diagnose",
        "repair_order.start",
        "repair_order.complete",
        "repair_order.parts.add",
        "customer.view",
        "customer.create",
        "parts.view",
        "dashboard.view",
        "settings.view",
    },
    "admin": ALL_PERMISSIONS - {"superadmin.view"},
    "superadmin": ALL_PERMISSIONS,
}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials,
            os.getenv("JWT_SECRET", "change-me"),
            algorithms=["HS256"],
        )
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(models.User, int(payload.get("sub")))
    if not user or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def has_permission(user: models.User, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(user.role, set())


def require_permission(*permissions: str):
    def dependency(user: models.User = Depends(get_current_user)) -> models.User:
        allowed = ROLE_PERMISSIONS.get(user.role, set())
        if not any(p in allowed for p in permissions):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return dependency


def require_roles(*roles: str):
    def dependency(user: models.User = Depends(get_current_user)) -> models.User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return dependency


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
