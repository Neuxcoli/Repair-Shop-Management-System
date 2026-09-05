"""Idempotent schema migration for the on-site service feature.

Adds service_location/service_address to repair orders.
Run from backend/. Reads DATABASE_URL from .env.
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

ORDER_COLUMNS = {
    "service_location": "VARCHAR(20) NOT NULL DEFAULT 'in_shop'",
    "service_address": "TEXT",
}
insp = inspect(engine)
existing = {c["name"] for c in insp.get_columns("repairshop_repair_orders")}
with engine.begin() as conn:
    for name, ddl in ORDER_COLUMNS.items():
        if name not in existing:
            conn.execute(text(f'ALTER TABLE repairshop_repair_orders ADD COLUMN "{name}" {ddl}'))
            print(f"[repair_orders] added column {name}")

print("Migration complete")