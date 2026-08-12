-- Sample data mirroring the original static mockup

-- Admin account (bcrypt hash of "admin123"); roles: admin
INSERT INTO repairshop_users (username, password, role) VALUES
  ('superadmin', '$2b$12$jm0JAGi8zLKg7fQXjsakvOkhwz1U9WXntEmp0ogTwXAitNCsilcxO', 'admin');

INSERT INTO repairshop_customers (full_name, phone, email, address) VALUES
  ('Sarah Jenkins', '+63 917 555 0142', 'sarah.jenkins@email.com', NULL),
  ('Miguel Torres', '+63 918 224 3390', 'm.torres@email.com', NULL),
  ('Angela Reyes',  '+63 906 771 4420', NULL, NULL),
  ('Paolo Cruz',    '+63 920 118 8875', 'paolo.cruz@email.com', NULL),
  ('Bianca Lim',    NULL, NULL, NULL);

INSERT INTO repairshop_technicians (full_name, email, specialty, status) VALUES
  ('David Santos',      'david.s@precisionrepair.com', 'Automotive',  'active'),
  ('Elena Ramos',       'elena.r@precisionrepair.com', 'Electronics', 'active'),
  ('Jomar Villanueva',  'jomar.v@precisionrepair.com', 'Appliances',  'active'),
  ('Rico Fernandez',    'rico.f@precisionrepair.com',  'Automotive',  'inactive');

INSERT INTO repairshop_items (customer_id, description, identifier, item_type) VALUES
  (1, '2021 Honda Civic', 'ABC-1234', 'vehicle'),
  (2, 'iPhone 14 Pro', 'AX992KM', 'electronics'),
  (3, 'LG Refrigerator', 'LG-RF420', 'appliance'),
  (4, '2019 Toyota Vios', NULL, 'vehicle'),
  (5, 'Samsung Washing Machine', NULL, 'appliance');

INSERT INTO repairshop_parts (sku, name, qty_on_hand, reorder_threshold, unit_cost, unit_price) VALUES
  ('BRK-2201', 'Brake Pad Set (Front)', 3, 5, 850.00, 1450.00),
  ('SCR-0044', 'iPhone 14 Pro Screen Assembly', 2, 5, 4200.00, 6800.00),
  ('OIL-1090', 'Synthetic Engine Oil 4L', 18, 10, 620.00, 980.00),
  ('MTR-3312', 'Washing Machine Drain Motor', 42, 10, 980.00, 1650.00);

INSERT INTO repairshop_repair_orders (ro_number, tracking_token, customer_id, item_id, technician_id, problem_description, labor_cost, warranty_days, priority, status) VALUES
  ('RO-8921', 'seed-token-8921-aaaaaaaaaaaaaaaaaaaa', 1, 1, 1, 'Brake noise on braking', 500, 30, 'high', 'invoiced'),
  ('RO-8920', 'seed-token-8920-bbbbbbbbbbbbbbbbbbbb', 2, 2, 2, 'Cracked screen', 0, 30, 'normal', 'in_progress'),
  ('RO-8919', 'seed-token-8919-cccccccccccccccccccc', 3, 3, NULL, 'Not cooling', 0, 0, 'low', 'requested'),
  ('RO-8917', 'seed-token-8917-dddddddddddddddddddd', 4, 4, 1, 'Engine check light', 800, 90, 'urgent', 'closed'),
  ('RO-8912', 'seed-token-8912-eeeeeeeeeeeeeeeeeeee', 5, 5, 2, 'Not draining', 0, 0, 'normal', 'cancelled'),
  ('RO-8916', 'seed-token-8916-ffffffffffffffffffff', 1, 1, 1, 'Brake fluid top-up', 250, 30, 'normal', 'completed'),
  ('RO-8915', 'seed-token-8915-11111111111111111111', 2, 2, 2, 'Battery replacement', 600, 90, 'normal', 'invoiced');

INSERT INTO repairshop_invoices (invoice_number, repair_order_id, customer_id, total, amount_paid, status, issued_at) VALUES
  ('INV-2045', 4, 4, 7300.00, 7300.00, 'paid', '2026-07-15'),
  ('INV-2044', 1, 1, 1950.00, 1500.00, 'partially_paid', '2026-07-12'),
  ('INV-2043', 7, 2, 6800.00, 0.00, 'unpaid', '2026-07-09'),
  ('INV-2038', 6, 1, 1450.00, 0.00, 'void', '2026-07-02');

-- Append-only status history (from_status NULL = order created)
INSERT INTO repairshop_repair_order_status_history (repair_order_id, from_status, to_status, note, created_at) VALUES
  (1, NULL, 'requested', 'Order received', '2026-07-08 09:12:00+08'),
  (1, 'requested', 'diagnosed', NULL, '2026-07-08 11:30:00+08'),
  (1, 'diagnosed', 'approved', NULL, '2026-07-09 10:00:00+08'),
  (1, 'approved', 'in_progress', NULL, '2026-07-10 08:15:00+08'),
  (1, 'in_progress', 'completed', NULL, '2026-07-12 13:40:00+08'),
  (1, 'completed', 'invoiced', 'Invoice issued', '2026-07-12 15:05:00+08'),
  (2, NULL, 'requested', 'Order received', '2026-07-09 09:00:00+08'),
  (2, 'requested', 'diagnosed', NULL, '2026-07-09 10:20:00+08'),
  (2, 'diagnosed', 'approved', NULL, '2026-07-10 09:00:00+08'),
  (2, 'approved', 'in_progress', NULL, '2026-07-10 09:45:00+08'),
  (3, NULL, 'requested', 'Order received', '2026-07-11 08:00:00+08'),
  (4, NULL, 'requested', 'Order received', '2026-07-01 09:00:00+08'),
  (4, 'requested', 'diagnosed', NULL, '2026-07-01 09:30:00+08'),
  (4, 'diagnosed', 'approved', NULL, '2026-07-01 10:00:00+08'),
  (4, 'approved', 'in_progress', NULL, '2026-07-01 10:15:00+08'),
  (4, 'in_progress', 'completed', NULL, '2026-07-02 14:20:00+08'),
  (4, 'completed', 'invoiced', 'Invoice issued', '2026-07-03 09:00:00+08'),
  (4, 'invoiced', 'closed', 'Fully paid', '2026-07-15 11:00:00+08'),
  (5, NULL, 'requested', 'Order received', '2026-07-04 09:00:00+08'),
  (5, 'requested', 'cancelled', NULL, '2026-07-04 16:30:00+08'),
  (6, NULL, 'requested', 'Order received', '2026-07-05 09:00:00+08'),
  (6, 'requested', 'diagnosed', NULL, '2026-07-05 10:00:00+08'),
  (6, 'diagnosed', 'approved', NULL, '2026-07-05 11:00:00+08'),
  (6, 'approved', 'in_progress', NULL, '2026-07-06 08:30:00+08'),
  (6, 'in_progress', 'completed', NULL, '2026-07-07 12:00:00+08'),
  (7, NULL, 'requested', 'Order received', '2026-07-08 09:00:00+08'),
  (7, 'requested', 'diagnosed', NULL, '2026-07-08 10:00:00+08'),
  (7, 'diagnosed', 'approved', NULL, '2026-07-08 11:00:00+08'),
  (7, 'approved', 'in_progress', NULL, '2026-07-09 08:00:00+08'),
  (7, 'in_progress', 'completed', NULL, '2026-07-09 15:30:00+08'),
  (7, 'completed', 'invoiced', 'Invoice issued', '2026-07-09 16:00:00+08');
