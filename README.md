# Repair Shop Management System

Converted from the static HTML mockup into a real stack:

- **Backend:** Python (FastAPI + SQLAlchemy)
- **Frontend build:** Node.js (Vite, vanilla JS/HTML/CSS — same UI as the mockup)
- **Database:** PostgreSQL (local)
- **Version control:** Git

## Project layout

```
repair-shop/
  backend/            FastAPI app
    app/
      main.py          entrypoint, CORS, router registration
      database.py       SQLAlchemy engine/session
      models.py          ORM models
      schemas.py          Pydantic request/response models
      routers/            one router per resource (customers, technicians,
                           items, parts, orders, invoices, dashboard)
    requirements.txt
    .env.example
  frontend/           Vite project (vanilla JS, same design as the mockup)
    index.html
    src/
      main.js          page routing, rendering, form handling
      api.js            fetch wrapper around the FastAPI endpoints
      style.css          styles extracted from the original mockup
    package.json
  db/
    schema.sql          table definitions
    seed.sql              sample data matching the original mockup
  docker-compose.yml   optional: spins up local Postgres with the schema
                        + seed data pre-loaded
```

## 1. Database (PostgreSQL)

Option A — Docker (simplest):
```bash
docker compose up -d
```
This starts Postgres on `localhost:5432` with the schema and seed data
already loaded (db `repair_shop`, user/pass `postgres`/`postgres`).

Option B — local Postgres install:
```bash
createdb repair_shop
psql repair_shop -f db/schema.sql
psql repair_shop -f db/seed.sql
```

## 2. Backend (Python)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # adjust DATABASE_URL if needed
uvicorn app.main:app --reload --port 8000
```
API docs available at `http://localhost:8000/docs`.

## 3. Frontend (Node.js / Vite)

```bash
cd frontend
npm install
npm run dev
```
Opens at `http://localhost:5173`. API calls to `/api/*` are proxied to the
backend on port 8000 (see `vite.config.js`).

For a production build:
```bash
npm run build      # outputs static files to frontend/dist
```

## 4. Git

```bash
git init
git add .
git commit -m "Initial commit: Repair Shop Management System (FastAPI + Vite + Postgres)"
```

## Roles & permissions

Five roles map to the ARGO spec role-and-permission matrix (see
`backend/app/dependencies.py` for the authoritative mapping):

| Role         | Can do |
|--------------|--------|
| Front Desk   | Create/view repair orders, manage customers, view parts, issue invoices for completed orders |
| Technician   | View own work orders, diagnose, start, complete, add parts to assigned orders |
| Parts Staff  | Manage parts inventory (stock levels, pricing) |
| Manager      | Everything except user administration |
| Administrator| Everything |

Lifecycle: `requested → diagnosed → approved → in_progress → on_hold →
completed → invoiced → closed` (plus `cancelled`/`rejected`). Approval
requires an estimated cost; completion records the actual cost and
`completed_at`; full payment closes the order and stamps `paid_at`.
Orders with an invoice cannot be deleted. Deleting a record is a soft
delete (`deleted_at`) — it disappears from lists but is kept in the DB.

Sample login accounts (seeded users in the live DB):
`superadmin`/`admin123`, `tech_jenny`/`jenny123`, `manager1`/`manager123`,
`frontdesk1`/`front123`, `parts1`/`parts123`.

## API overview

| Resource        | Endpoints |
|------------------|-----------|
| Customers        | `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/{id}` |
| Technicians       | `GET/POST /api/technicians`, `PUT/DELETE /api/technicians/{id}` |
| Items (vehicles/devices) | `GET/POST /api/items` |
| Parts (inventory)  | `GET/POST /api/parts`, `PUT/DELETE /api/parts/{id}` |
| Repair Orders     | `GET/POST /api/orders`, `PATCH/DELETE /api/orders/{id}` |
| Invoices           | `GET/POST /api/invoices` |
| Dashboard KPIs     | `GET /api/dashboard/summary` |
| Public tracking    | `GET /api/public/track` |

Repair order numbers (`RO-xxxx`) and invoice numbers (`INV-xxxx`) are
generated server-side on creation.

## 5. Deploying (Railway / Render / Fly.io)

The repo-level `Dockerfile` builds the whole app into **one image**: it
compiles the frontend (`npm run build`) and then runs the FastAPI backend,
which also serves the built UI from the same origin. No CORS or API-base
URL configuration is needed in production — `/api/*` and the HTML pages
come from one domain.

1. Push the repo to GitHub.
2. Create a **managed Postgres** first (Railway Postgres plugin, Render
   Postgres, Fly Postgres). It gives you a `DATABASE_URL`.
3. **Load your existing data** into the hosted DB before first start
   (the app creates missing tables on boot, so restore into a fresh DB):
   ```bash
   pg_dump -U postgres -h localhost repair_shop > repair_shop.sql
   psql "<hosted DATABASE_URL>" < repair_shop.sql
   ```
4. Create a **Web Service** from the repo (Railway/Render auto-detect the
   `Dockerfile`). Set these environment variables on the service:
   - `DATABASE_URL` — from step 2 (the app auto-converts `postgres://`
     and `postgresql://` into the psycopg2 URL it needs)
   - `JWT_SECRET` — a long random string (generate one; never reuse the
     `.env` dev secret)
   - `CORS_ORIGINS` — optional; default `http://localhost:5173` is fine
     since the UI is served same-origin
5. Deploy. The service listens on port `8000`; the platform exposes it.
   Health check: `GET /api/health`.

Local verification of the production path:
```bash
cd frontend && npm run build        # dist/ must exist
cd backend && uvicorn app.main:app --port 8000
# open http://localhost:8000  ->  UI + API on one origin
```
