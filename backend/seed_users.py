import os
import sys

import bcrypt

from app import models
from app.database import Base, SessionLocal, engine

Base.metadata.create_all(bind=engine)
db = SessionLocal()


def get_or_create_technician(full_name, email):
    technician = db.query(models.Technician).filter(models.Technician.full_name == full_name).first()
    if not technician:
        technician = models.Technician(full_name=full_name, email=email, specialty="General")
        db.add(technician)
        db.flush()
        print(f"created technician row: {full_name} (id={technician.id})")
    else:
        print(f"technician row exists: {full_name} (id={technician.id})")
    return technician


def upsert_user(username, password, role, customer_id=None, technician_id=None):
    user = db.query(models.User).filter(models.User.username == username).first()
    if user:
        print(f"user exists: {username} ({role})")
        return
    db.add(
        models.User(
            username=username,
            password=bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
            role=role,
            customer_id=customer_id,
            technician_id=technician_id,
        )
    )
    print(f"created user: {username} ({role})")


if __name__ == "__main__":
    admin_password = os.getenv("ADMIN_PASSWORD")
    tech_password = os.getenv("TECH_PASSWORD")
    if not admin_password or not tech_password:
        print("Set ADMIN_PASSWORD and TECH_PASSWORD env vars to seed the admin and technician accounts.")
        sys.exit(1)

    technician = get_or_create_technician("Jenny Dela Cruz", "jenny.d@precisionrepair.com")

    upsert_user("tech_jenny", tech_password, "technician", technician_id=technician.id)
    upsert_user("admin", admin_password, "admin")

    db.commit()
    db.close()
    print("done")
