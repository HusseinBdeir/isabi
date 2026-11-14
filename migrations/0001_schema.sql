-- ============================================================================
-- ISABI Systems — Cloudflare D1 Relational SQLite Schema (0001_schema.sql)
-- Standalone Edge SQL + Multi-Entity RLS + Sync + R2 Attachment Metadata
-- Zero Microsoft Cloud / Dataverse / Power BI dependency.
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  industry TEXT DEFAULT 'Manufacturing',
  currency TEXT DEFAULT 'USD',
  usd_rate REAL DEFAULT 89500,
  min_date TEXT DEFAULT '2024-01-01',
  payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pin_code TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Entry',
  companies TEXT NOT NULL DEFAULT 'WTC',
  pbi_access TEXT DEFAULT 'full',
  statements_access TEXT DEFAULT 'full',
  status TEXT DEFAULT 'Active',
  last_login_at TEXT DEFAULT '',
  face_samples TEXT DEFAULT '[]',
  face_thumbs TEXT DEFAULT '[]',
  face_required INTEGER DEFAULT 0,
  face_updated_at TEXT DEFAULT '',
  seat_updated_at TEXT DEFAULT '',
  custom_perms TEXT DEFAULT '{}',
  auth_mode TEXT DEFAULT '',
  payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT '',
  email TEXT DEFAULT '',
  full_name TEXT DEFAULT '',
  role TEXT DEFAULT '',
  companies TEXT DEFAULT '',
  device TEXT DEFAULT '',
  logged_in_at TEXT DEFAULT '',
  method TEXT DEFAULT 'PIN',
  confidence REAL,
  ip_hash TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_logged ON auth_sessions (logged_in_at DESC);

-- ============================================================================
-- 1. Operational & Financial Ledger Tables (Manufacturing + Shared Spine)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_tickets (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', ticket_no TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '',
  company TEXT DEFAULT '', sale_type TEXT DEFAULT '', transport_by TEXT DEFAULT '', customer TEXT DEFAULT '', product TEXT DEFAULT '',
  site TEXT DEFAULT '', truck_owner TEXT DEFAULT '', truck TEXT DEFAULT '', driver TEXT DEFAULT '', uom TEXT DEFAULT '',
  qty REAL DEFAULT 0, unit_price REAL DEFAULT 0, price REAL DEFAULT 0,
  trans_unit_price REAL DEFAULT 0, trans_price REAL DEFAULT 0,
  discount REAL DEFAULT 0, total REAL DEFAULT 0, vat REAL DEFAULT 0, total_ttc REAL DEFAULT 0,
  method TEXT DEFAULT '', vat_invoice TEXT DEFAULT '', time TEXT DEFAULT '', overtime INTEGER DEFAULT 0,
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_sales_tickets_co_date ON sales_tickets (company, date DESC);

CREATE TABLE IF NOT EXISTS raw_purchases (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', ticket_no TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '',
  company TEXT DEFAULT '', product TEXT DEFAULT '', site TEXT DEFAULT '', site_owner TEXT DEFAULT '', transport_by TEXT DEFAULT '',
  truck_owner TEXT DEFAULT '', truck TEXT DEFAULT '', driver TEXT DEFAULT '', uom TEXT DEFAULT '',
  qty REAL DEFAULT 0, unit_cost REAL DEFAULT 0, cost REAL DEFAULT 0,
  trans_unit_cost REAL DEFAULT 0, trans_cost REAL DEFAULT 0,
  total REAL DEFAULT 0, method TEXT DEFAULT '', time TEXT DEFAULT '', overtime INTEGER DEFAULT 0,
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_raw_purchases_co_date ON raw_purchases (company, date DESC);

CREATE TABLE IF NOT EXISTS fuel_intakes (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', ticket_no TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '',
  company TEXT DEFAULT '', fuel_type TEXT DEFAULT '', item TEXT DEFAULT '', equipment TEXT DEFAULT '', driver TEXT DEFAULT '',
  litres REAL DEFAULT 0, odometer REAL, hours REAL, location TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_fuel_intakes_co_date ON fuel_intakes (company, date DESC);

CREATE TABLE IF NOT EXISTS fuel_malfunctions (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', ticket_no TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '',
  company TEXT DEFAULT '', item TEXT DEFAULT 'Diesel', discrepancy_type TEXT DEFAULT 'Malfunction',
  litres REAL DEFAULT 0, equipment TEXT DEFAULT '', driver TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_by_email TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_fuel_malfunctions_co_date ON fuel_malfunctions (company, date DESC);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', company TEXT DEFAULT '',
  category TEXT DEFAULT '', subcategory TEXT DEFAULT '', supplier TEXT DEFAULT '', equipment TEXT DEFAULT '', method TEXT DEFAULT '',
  qty REAL DEFAULT 0, amount REAL DEFAULT 0, reference TEXT DEFAULT '',
  for_equipment INTEGER DEFAULT 0, item_summary TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_expenses_co_date ON expenses (company, date DESC);

CREATE TABLE IF NOT EXISTS expense_items (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', expense_id TEXT DEFAULT '', expense_ref TEXT DEFAULT '',
  date TEXT DEFAULT '', rep_date TEXT DEFAULT '', company TEXT DEFAULT '', supplier TEXT DEFAULT '',
  category TEXT DEFAULT '', subcategory TEXT DEFAULT '', item_name TEXT DEFAULT '',
  qty REAL DEFAULT 1, uom TEXT DEFAULT '', unit_cost REAL DEFAULT 0, line_total REAL DEFAULT 0,
  allocation_mode TEXT DEFAULT '', target_equipment TEXT DEFAULT '', warehouse_location TEXT DEFAULT '',
  historical_consumed INTEGER DEFAULT 0,
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_expense_items_co_date ON expense_items (company, date DESC);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '',
  company TEXT DEFAULT '', supplier TEXT DEFAULT '', category TEXT DEFAULT '', subcategory TEXT DEFAULT '',
  item TEXT DEFAULT '', frequency TEXT DEFAULT 'Monthly', currency TEXT DEFAULT 'USD',
  amount REAL DEFAULT 0, usd_amount REAL DEFAULT 0, lbp_amount REAL DEFAULT 0,
  method TEXT DEFAULT 'Credit', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
  equipment TEXT DEFAULT '', status TEXT DEFAULT 'In Force', wb_index INTEGER,
  source TEXT DEFAULT 'workbook', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS customer_receipts (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', company TEXT DEFAULT '',
  customer TEXT DEFAULT '', method TEXT DEFAULT '', amount REAL DEFAULT 0, discount REAL DEFAULT 0, reference TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_co_date ON customer_receipts (company, date DESC);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', company TEXT DEFAULT '',
  supplier TEXT DEFAULT '', method TEXT DEFAULT '', amount REAL DEFAULT 0, discount REAL DEFAULT 0, reference TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_co_date ON supplier_payments (company, date DESC);

CREATE TABLE IF NOT EXISTS salary_payments (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', payroll_month TEXT DEFAULT '',
  company TEXT DEFAULT '', staff TEXT DEFAULT '', method TEXT DEFAULT '', amount REAL DEFAULT 0,
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_salary_payments_co_date ON salary_payments (company, date DESC);

CREATE TABLE IF NOT EXISTS price_rules (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', rule_type TEXT DEFAULT '',
  customer TEXT DEFAULT '', supplier TEXT DEFAULT '', product TEXT DEFAULT '', site TEXT DEFAULT '', unit TEXT DEFAULT '',
  unit_price REAL DEFAULT 0, trans_unit_price REAL DEFAULT 0, indiff_price REAL, trans_indiff_price REAL,
  start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_price_rules_co_start ON price_rules (company, start_date DESC);

CREATE TABLE IF NOT EXISTS equipment_defects (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '',
  equipment TEXT DEFAULT '', equipment_category TEXT DEFAULT '', subsystem TEXT DEFAULT '', part_name TEXT DEFAULT '',
  severity TEXT DEFAULT '', status TEXT DEFAULT '', reported_by TEXT DEFAULT '', meter_reading REAL DEFAULT 0,
  description TEXT DEFAULT '', resolved_date TEXT DEFAULT '', linked_part_log TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS equipment_repairs (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', company TEXT DEFAULT '',
  equipment TEXT DEFAULT '', meter_reading REAL, subsystem TEXT DEFAULT '', repair_source TEXT DEFAULT '',
  status TEXT DEFAULT '', defect_ref TEXT DEFAULT '', supplier TEXT DEFAULT '', external_labor_usd REAL DEFAULT 0,
  outside_parts_usd REAL DEFAULT 0, warehouse_parts_usd REAL DEFAULT 0, total_cost_usd REAL DEFAULT 0,
  items_summary TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS repair_items (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', repair_id TEXT DEFAULT '', repair_ref TEXT DEFAULT '',
  date TEXT DEFAULT '', rep_date TEXT DEFAULT '', company TEXT DEFAULT '', equipment TEXT DEFAULT '', item_name TEXT DEFAULT '',
  source TEXT DEFAULT '', qty REAL DEFAULT 1, uom TEXT DEFAULT '', unit_cost REAL DEFAULT 0,
  line_total REAL DEFAULT 0, supplier TEXT DEFAULT '', warehouse_location TEXT DEFAULT '',
  entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS equipment_oil_logs (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', company TEXT DEFAULT '',
  equipment TEXT DEFAULT '', oil_type TEXT DEFAULT '', service_action TEXT DEFAULT '', qty REAL DEFAULT 1,
  uom TEXT DEFAULT '', source TEXT DEFAULT '', hours_reading REAL, odometer_km REAL,
  interval_hours REAL, interval_km REAL, interval_days REAL, cost_usd REAL DEFAULT 0,
  entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS part_movements (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '',
  equipment TEXT DEFAULT '', action_type TEXT DEFAULT '', part_name TEXT DEFAULT '', part_serial TEXT DEFAULT '',
  subsystem TEXT DEFAULT '', qty REAL DEFAULT 1, condition TEXT DEFAULT '', removed_disposition TEXT DEFAULT '',
  storage_location TEXT DEFAULT '', vendor_or_buyer TEXT DEFAULT '', new_part_cost REAL DEFAULT 0,
  repair_cost REAL DEFAULT 0, sale_proceeds REAL DEFAULT 0, defect_ref TEXT DEFAULT '',
  prior_defect_notified INTEGER DEFAULT 0, approved_by TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS warehouse_movements (
  id TEXT PRIMARY KEY, name TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', company TEXT DEFAULT '',
  item_name TEXT DEFAULT '', category TEXT DEFAULT '', uom TEXT DEFAULT '', direction TEXT DEFAULT '', movement_type TEXT DEFAULT '',
  qty REAL DEFAULT 1, unit_cost REAL DEFAULT 0, total_cost REAL DEFAULT 0, warehouse_location TEXT DEFAULT '',
  min_stock REAL DEFAULT 0, equipment TEXT DEFAULT '', ref_type TEXT DEFAULT '', ref_id TEXT DEFAULT '',
  source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '',
  voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '',
  modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}'
);

-- Generic Operational & Universal Tables (shared canonical column envelope + payload_json)
CREATE TABLE IF NOT EXISTS salaries (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', staff TEXT DEFAULT '', amount REAL DEFAULT 0, total REAL DEFAULT 0, status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS vat_invoices (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', customer TEXT DEFAULT '', amount REAL DEFAULT 0, vat REAL DEFAULT 0, total_ttc REAL DEFAULT 0, status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS credit_terms (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', customer TEXT DEFAULT '', credit_days INTEGER DEFAULT 30, credit_limit REAL DEFAULT 0, start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS company_equipment (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', equipment TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS company_drivers (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', driver TEXT DEFAULT '', equipment TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS employments (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', staff TEXT DEFAULT '', role TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', amount REAL DEFAULT 0, status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', staff TEXT DEFAULT '', status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS work_shifts (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS staff_assignments (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', staff TEXT DEFAULT '', role TEXT DEFAULT '', equipment TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS freelance_entries (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', staff TEXT DEFAULT '', amount REAL DEFAULT 0, status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS logistics_allowances (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', staff TEXT DEFAULT '', site TEXT DEFAULT '', amount REAL DEFAULT 0, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS overtime_rates (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', amount REAL DEFAULT 0, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS external_movements (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', type TEXT DEFAULT '', method TEXT DEFAULT '', amount REAL DEFAULT 0, usd_amount REAL DEFAULT 0, lbp_amount REAL DEFAULT 0, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS loans (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', amount REAL DEFAULT 0, status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS loan_settlements (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', amount REAL DEFAULT 0, status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS conversions (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', usd_amount REAL DEFAULT 0, lbp_amount REAL DEFAULT 0, amount REAL DEFAULT 0, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS jv_partnerships (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', site TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS jv_distributions (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', site TEXT DEFAULT '', amount REAL DEFAULT 0, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS daily_totals (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', total REAL DEFAULT 0, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', date TEXT DEFAULT '', rep_date TEXT DEFAULT '', category TEXT DEFAULT '', parent_table TEXT DEFAULT '', parent_id TEXT DEFAULT '', amount REAL DEFAULT 0, status TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');

-- Composite (company, date/start_date DESC) indexes across remaining operational tables for O(limit) B-tree seeks
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_co_date ON recurring_expenses (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_defects_co_date ON equipment_defects (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_repairs_co_date ON equipment_repairs (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_repair_items_co_date ON repair_items (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_oil_logs_co_date ON equipment_oil_logs (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_part_movements_co_date ON part_movements (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_movements_co_date ON warehouse_movements (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_salaries_co_date ON salaries (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_vat_invoices_co_date ON vat_invoices (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_terms_co_start ON credit_terms (company, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_company_equipment_co_start ON company_equipment (company, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_company_drivers_co_start ON company_drivers (company, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_employments_co_start ON employments (company, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_co_date ON attendance (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_shifts_co_start ON work_shifts (company, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_co_start ON staff_assignments (company, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_freelance_entries_co_date ON freelance_entries (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_logistics_allowances_co_date ON logistics_allowances (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_overtime_rates_co_start ON overtime_rates (company, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_external_movements_co_date ON external_movements (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_loans_co_date ON loans (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_loan_settlements_co_date ON loan_settlements (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_conversions_co_date ON conversions (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_jv_partnerships_co_start ON jv_partnerships (company, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_jv_distributions_co_date ON jv_distributions (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_totals_co_date ON daily_totals (company, date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_co_date ON documents (company, date DESC);

-- Universal Registries (All BUs)
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT DEFAULT '', official_name TEXT DEFAULT '', company TEXT DEFAULT '', phone TEXT DEFAULT '', contact TEXT DEFAULT '', email TEXT DEFAULT '', address TEXT DEFAULT '', region TEXT DEFAULT '', mof_no TEXT DEFAULT '', vat_registered INTEGER DEFAULT 0, credit_days INTEGER DEFAULT 30, credit_limit REAL DEFAULT 0, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, name TEXT DEFAULT '', official_name TEXT DEFAULT '', company TEXT DEFAULT '', category TEXT DEFAULT '', phone TEXT DEFAULT '', contact TEXT DEFAULT '', email TEXT DEFAULT '', address TEXT DEFAULT '', region TEXT DEFAULT '', mof_no TEXT DEFAULT '', vat_registered INTEGER DEFAULT 0, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, official_name TEXT DEFAULT '', type TEXT DEFAULT '', uom TEXT DEFAULT '', ton_factor REAL DEFAULT 1.0, list_price REAL DEFAULT 0, input_product TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT DEFAULT '', category TEXT DEFAULT '', subcategory TEXT DEFAULT '', uom TEXT DEFAULT '', unit_cost REAL DEFAULT 0, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS product_types (id TEXT PRIMARY KEY, name TEXT DEFAULT '', uom TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS uoms (id TEXT PRIMARY KEY, name TEXT DEFAULT '', code TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, name TEXT NOT NULL, is_jv INTEGER DEFAULT 0, region TEXT DEFAULT '', supplier TEXT DEFAULT '', customer TEXT DEFAULT '', address TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS regions (id TEXT PRIMARY KEY, name TEXT DEFAULT '', code TEXT DEFAULT '', governorate TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS equipment (id TEXT PRIMARY KEY, name TEXT NOT NULL, plate_no TEXT DEFAULT '', type TEXT DEFAULT '', ownership TEXT DEFAULT '', capacity REAL DEFAULT 0, supplier TEXT DEFAULT '', customer TEXT DEFAULT '', default_driver TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS drivers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', truck_owner TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS staff_members (id TEXT PRIMARY KEY, name TEXT DEFAULT '', father_name TEXT DEFAULT '', company TEXT DEFAULT '', role TEXT DEFAULT '', phone TEXT DEFAULT '', status TEXT DEFAULT 'Active', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS staff_roles (id TEXT PRIMARY KEY, name TEXT DEFAULT '', category TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS expense_categories (id TEXT PRIMARY KEY, name TEXT DEFAULT '', gl_code TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS expense_subcategories (id TEXT PRIMARY KEY, name TEXT DEFAULT '', category TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS fx_rates (id TEXT PRIMARY KEY, name TEXT DEFAULT '', currency TEXT DEFAULT 'LBP', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', amount REAL DEFAULT 89500, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS vat_rates (id TEXT PRIMARY KEY, name TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', amount REAL DEFAULT 11, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS currencies (id TEXT PRIMARY KEY, name TEXT DEFAULT '', code TEXT DEFAULT '', symbol TEXT DEFAULT '', source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS gl_accounts (id TEXT PRIMARY KEY, name TEXT DEFAULT '', code TEXT DEFAULT '', class_no INTEGER DEFAULT 1, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0, voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '', rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');

-- ============================================================================
-- 2. Multi-Industry Domain, Biometric, Kiosk, Sync & R2 Metadata Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS edge_kv_store (
  doc_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT DEFAULT '',
  rev INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sentinel_reviews (
  id TEXT PRIMARY KEY,
  rule_id TEXT DEFAULT '',
  company TEXT DEFAULT '',
  baseline_metric REAL DEFAULT 0,
  baseline_secondary REAL DEFAULT 0,
  baseline_badge TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  checked_by TEXT DEFAULT '',
  checked_by_email TEXT DEFAULT '',
  checked_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY,
  kind TEXT DEFAULT 'override',
  payload_json TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS staff_biometrics (
  staff_key TEXT PRIMARY KEY,
  company TEXT DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS kiosk_punches (
  id TEXT PRIMARY KEY,
  company TEXT DEFAULT '',
  staff_name TEXT DEFAULT '',
  punch_type TEXT DEFAULT '',
  punched_at TEXT DEFAULT '',
  rev INTEGER DEFAULT 1,
  voided INTEGER DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_kiosk_punches_co_at ON kiosk_punches (company, punched_at DESC);

CREATE TABLE IF NOT EXISTS industry_custom_rows (
  bucket TEXT NOT NULL,
  row_id TEXT NOT NULL,
  company TEXT DEFAULT '',
  rev INTEGER DEFAULT 1,
  voided INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT '',
  payload_json TEXT DEFAULT '{}',
  PRIMARY KEY (bucket, row_id)
);
CREATE INDEX IF NOT EXISTS idx_industry_custom_rows_bucket ON industry_custom_rows (bucket, updated_at DESC);

CREATE TABLE IF NOT EXISTS industry_row_edits (
  edit_key TEXT PRIMARY KEY,
  rev INTEGER DEFAULT 1,
  voided INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT '',
  payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS phone_scan_sessions (
  sid TEXT PRIMARY KEY,
  tok TEXT NOT NULL,
  status TEXT DEFAULT 'waiting',
  pages_json TEXT DEFAULT '[]',
  rtc_offer TEXT DEFAULT '',
  rtc_answer TEXT DEFAULT '',
  updated_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_phone_scan_updated ON phone_scan_sessions (updated_ms);

CREATE TABLE IF NOT EXISTS document_blobs (
  blob_id TEXT PRIMARY KEY,
  mime_type TEXT DEFAULT 'image/jpeg',
  company TEXT DEFAULT '',
  size_bytes INTEGER DEFAULT 0,
  r2_key TEXT DEFAULT '',
  data_b64 TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ask_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surface TEXT DEFAULT 'showcase',
  lang TEXT DEFAULT 'en',
  industry TEXT DEFAULT '',
  query TEXT DEFAULT '',
  reply_title TEXT DEFAULT '',
  ip_hash TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS isabi_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT DEFAULT '',
  company_name TEXT DEFAULT '',
  industry TEXT DEFAULT '',
  scale TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  lang TEXT DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS override_audit (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT '',
  caller_user_id TEXT DEFAULT '',
  caller_email TEXT DEFAULT '',
  caller_role TEXT DEFAULT '',
  supervisor_user_id TEXT DEFAULT '',
  supervisor_email TEXT DEFAULT '',
  supervisor_name TEXT DEFAULT '',
  supervisor_role TEXT DEFAULT '',
  company TEXT DEFAULT '',
  form_key TEXT DEFAULT '',
  field_id TEXT DEFAULT '',
  field_label TEXT DEFAULT '',
  unlock_all INTEGER DEFAULT 0,
  record_id TEXT DEFAULT '',
  ip_hash TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_override_audit_co_created ON override_audit (company, created_at DESC);
