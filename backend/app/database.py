import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

_raw_db_url = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/repair_shop",
)

# Normalize URLs from managed hosts (e.g. "postgres://user:pass@host/db")
# into a URL psycopg2 understands.
if _raw_db_url.startswith("postgres://"):
    _raw_db_url = "postgresql://" + _raw_db_url[len("postgres://"):]
if "+psycopg2" not in _raw_db_url.split("://")[0]:
    _scheme, _rest = _raw_db_url.split("://", 1)
    _raw_db_url = f"{_scheme}+psycopg2://{_rest}"

DATABASE_URL = _raw_db_url

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
