"""Idempotent schema migration for the parts-catalog feature.

Adds available_for_purchase/description to parts and creates the
parts-orders tables. Run from backend/. Reads DATABASE_URL from .env.
"""
import os

from dotenv import load_dotenv
from sqlalchemy import inspect, text
from sqlalchemy.engine import create_engine

load_dotenv()

raw = os.getenv("DATABASE_URL")
if raw.startswith("postgres://"):
    raw = "postgresql://" + raw[len("postgres://"):]
if "+psycopg2" not in raw.split("://")[0]:
    scheme, rest = raw.split("://", 1)
    raw = f"{scheme}+psycopg2://{rest}"

engine = create_engine(raw, pool_pre_ping=True)

# 1. Create parts-order tables + enum via metadata
from app.models import Base  # noqa: E402
Base.metadata.create_all(bind=engine)

# 2. Add columns to repairshop_parts if missing
PART_COLUMNS = {
    "description": "TEXT",
    "available_for_purchase": "BOOLEAN NOT NULL DEFAULT FALSE",
}
insp = inspect(engine)
existing = {c["name"] for c in insp.get_columns("repairshop_parts")}
with engine.begin() as conn:
    for name, ddl in PART_COLUMNS.items():
        if name not in existing:
            conn.execute(text(f'ALTER TABLE repairshop_parts ADD COLUMN "{name}" {ddl}'))
            print(f"[parts] added column {name}")

# 3. Ensure enum type for parts order status exists (created by create_all)

print("Migration complete")
