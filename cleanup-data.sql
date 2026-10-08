-- =====================================================================
-- FlotaTrack — Limpieza de data de negocio (pre-presentación cliente)
-- Conserva: companies, users
-- Elimina: payments, invoice_cuotas, work_order_costs, work_orders,
--          invoices, quote_items, quotes, maintenance_records,
--          maintenance_sessions, maintenance_plans, odometer_logs,
--          operators, clients, equipment
-- =====================================================================

BEGIN;

TRUNCATE TABLE
  payments,
  invoice_cuotas,
  work_order_costs,
  work_orders,
  invoices,
  quote_items,
  quotes,
  maintenance_records,
  maintenance_sessions,
  maintenance_plans,
  odometer_logs,
  operators,
  clients,
  equipment
CASCADE;

COMMIT;

-- Verificación post-limpieza
SELECT 'companies' AS tabla, COUNT(*) AS registros FROM companies
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'equipment', COUNT(*) FROM equipment
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'work_orders', COUNT(*) FROM work_orders
UNION ALL SELECT 'quotes', COUNT(*) FROM quotes
UNION ALL SELECT 'operators', COUNT(*) FROM operators;
