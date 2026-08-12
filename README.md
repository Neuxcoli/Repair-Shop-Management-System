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

The system ships with the ARGO spec role-and-permission matrix (see
`backend/app/dependencies.py`), but is currently configured **admin-only**:
only an `admin` account can log in. The other roles (Front Desk,
Technician, Parts Staff, Manager) are wired up in the code and can be
re-enabled later simply by creating users with those roles.

Customer tracking is public but access-controlled by a **random tracking
token** per order — no login needed. The shop sends the customer their
link (visible in the order detail: `Copy` next to "Customer Tracking
Link"), and the customer opens `/track.html` with that code. Tokens are
unguessable and unique, so orders can't be enumerated; the old
RO-number + phone lookup was removed.

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

Login account: `superadmin`/`admin123`.

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
| Public tracking    | `GET /api/public/track?token=…` |

Repair order numbers (`RO-xxxx`) and invoice numbers (`INV-xxxx`) are
generated server-side on creation.

## 5. Deploying (Vercel)

Vercel deploys the FastAPI app as a single serverless Function using its
FastAPI preset, and the built frontend (`frontend/dist`, served by the
app's `StaticFiles` mount) is promoted to the CDN at build time:

- `pyproject.toml` — Python 3.12 + runtime deps + `[tool.vercel]`
  entrypoint pointing at `backend.app.main:app`, and a build hook that
  runs `npm run build` before deploy
- `package.json` — root build script that builds the Vite frontend
- `vercel.json` — function `maxDuration` (no routing needed; FastAPI
  handles it)

### One-time setup

1. Push the repo to GitHub.
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the
   GitHub repo → Framework Preset **FastAPI** → Root Directory `./` →
   Deploy.
3. **Create the database**: Vercel → **Storage → Create Database →
   Postgres** (Neon). When the app is linked, Vercel auto-injects
   `DATABASE_URL` (and friends) into your functions.
4. **Load data into the hosted DB** (run the SQL in the Vercel Postgres
   → **Query** tab, or via `psql` with the connection string):
   ```bash
   # Option A — sample data:
   psql "<hosted DATABASE_URL>" -f db/schema.sql
   psql "<hosted DATABASE_URL>" -f db/seed.sql

   # Option B — your real data from local:
   pg_dump -U postgres -h localhost repair_shop --no-owner --no-privileges > repair_shop.sql
   psql "<hosted DATABASE_URL>" -f repair_shop.sql
   ```
5. **Environment variables** (Vercel → Project → Settings → Environment
   Variables): `DATABASE_URL` (usually auto-set), plus a fresh
   `JWT_SECRET` (e.g. `python -c "import secrets;print(secrets.token_hex(32))"`)
   and `CORS_ORIGINS` = `https://<your-project>.vercel.app`.
6. Redeploy; verify `GET /api/health`, then log in and open a
   `/track.html?token=…` link. On each future `git push` Vercel redeploys.

The older Dockerfile path (Railway / Render / Fly.io) still works the same
way: build one image that serves the built UI and API from one origin.

Local verification of the production path:
```bash
cd frontend && npm run build        # dist/ must exist
cd backend && uvicorn app.main:app --port 8000
# open http://localhost:8000  ->  UI + API on one origin
```
