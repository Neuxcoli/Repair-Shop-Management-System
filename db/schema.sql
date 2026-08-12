-- Repair Shop Management System — PostgreSQL schema

CREATE TYPE priority_level AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TYPE order_status AS ENUM (
  'requested', 'diagnosed', 'approved', 'in_progress',
  'on_hold', 'completed', 'invoiced', 'closed', 'cancelled', 'rejected'
);

CREATE TYPE technician_status AS ENUM ('active', 'inactive');

CREATE TYPE invoice_status AS ENUM ('unpaid', 'partially_paid', 'paid', 'void');

CREATE TABLE repairshop_customers (
  id              SERIAL PRIMARY KEY,
  full_name       VARCHAR(150) NOT NULL,
  phone           VARCHAR(30),
  email           VARCHAR(150),
  address         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE repairshop_technicians (
  id              SERIAL PRIMARY KEY,
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(150) UNIQUE NOT NULL,
  phone           VARCHAR(30),
  specialty       VARCHAR(50) NOT NULL DEFAULT 'General',
  status          technician_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- Vehicle / device / appliance brought in for repair
CREATE TABLE repairshop_items (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES repairshop_customers(id) ON DELETE CASCADE,
  description     VARCHAR(200) NOT NULL,      -- e.g. "2021 Honda Civic"
  identifier      VARCHAR(100),                -- plate no / serial no / model no
  item_type       VARCHAR(50),                 -- vehicle / electronics / appliance
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE repairshop_parts (
  id                  SERIAL PRIMARY KEY,
  sku                 VARCHAR(50) UNIQUE NOT NULL,
  name                VARCHAR(150) NOT NULL,
  qty_on_hand         INTEGER NOT NULL DEFAULT 0,
  reorder_threshold   INTEGER NOT NULL DEFAULT 5,
  unit_cost           NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE repairshop_users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password      VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL,
  customer_id   INTEGER REFERENCES repairshop_customers(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES repairshop_technicians(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE repairshop_repair_orders (
  id                  SERIAL PRIMARY KEY,
  ro_number           VARCHAR(20) UNIQUE NOT NULL,   -- e.g. RO-8921
  customer_id         INTEGER NOT NULL REFERENCES repairshop_customers(id) ON DELETE RESTRICT,
  item_id             INTEGER NOT NULL REFERENCES repairshop_items(id) ON DELETE RESTRICT,
  technician_id       INTEGER REFERENCES repairshop_technicians(id) ON DELETE SET NULL,
  problem_description TEXT,
  inspection_notes    TEXT,
  diagnosis           TEXT,
  labor_cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
  warranty_days       INTEGER NOT NULL DEFAULT 0,
  warranty_notes      TEXT,
  priority            priority_level NOT NULL DEFAULT 'normal',
  status              order_status NOT NULL DEFAULT 'requested',
  estimated_cost      NUMERIC(12,2),
  actual_cost         NUMERIC(12,2),
  released_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE repairshop_repair_order_status_history (
  id              SERIAL PRIMARY KEY,
  repair_order_id INTEGER NOT NULL REFERENCES repairshop_repair_orders(id) ON DELETE CASCADE,
  from_status     order_status,
  to_status       order_status NOT NULL,
  changed_by      INTEGER REFERENCES repairshop_users(id) ON DELETE SET NULL,
  note            VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_history_order ON repairshop_repair_order_status_history(repair_order_id);

CREATE TABLE repairshop_repair_order_parts (
  id              SERIAL PRIMARY KEY,
  repair_order_id INTEGER NOT NULL REFERENCES repairshop_repair_orders(id) ON DELETE CASCADE,
  part_id         INTEGER NOT NULL REFERENCES repairshop_parts(id) ON DELETE RESTRICT,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price      NUMERIC(12,2) NOT NULL
);

CREATE TABLE repairshop_invoices (
  id              SERIAL PRIMARY KEY,
  invoice_number  VARCHAR(20) UNIQUE NOT NULL,   -- e.g. INV-2045
  repair_order_id INTEGER NOT NULL REFERENCES repairshop_repair_orders(id) ON DELETE RESTRICT,
  customer_id     INTEGER NOT NULL REFERENCES repairshop_customers(id) ON DELETE RESTRICT,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          invoice_status NOT NULL DEFAULT 'unpaid',
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT uniq_invoice_per_order UNIQUE (repair_order_id)
);

CREATE INDEX idx_orders_status ON repairshop_repair_orders(status);
CREATE INDEX idx_orders_customer ON repairshop_repair_orders(customer_id);
CREATE INDEX idx_invoices_status ON repairshop_invoices(status);
CREATE INDEX idx_parts_low_stock ON repairshop_parts(qty_on_hand);
