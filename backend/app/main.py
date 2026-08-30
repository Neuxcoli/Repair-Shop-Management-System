import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .routers import auth, customers, technicians, items, parts, orders, invoices, payments, dashboard, public, settings, messages

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Repair Shop Management API", version="1.0.0")

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(technicians.router)
app.include_router(items.router)
app.include_router(parts.router)
app.include_router(orders.router)
app.include_router(invoices.router)
app.include_router(payments.router)
app.include_router(dashboard.router)
app.include_router(public.router)
app.include_router(settings.router)
app.include_router(messages.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve the built frontend (frontend/dist) from the same origin as the API,
# so the deployed app needs no CORS / API base URL configuration.
_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
