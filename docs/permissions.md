# Permissions & Security Controls
**Application:** BikeParts Smart AI  
**Shop:** Ved Scooter Works  

---

## 1. Security Architecture

BikeParts Smart AI enforces security at three distinct layers:
1. **Frontend Navigation & Component Guards:** Protected routes (`ProtectedRoute.tsx`) redirect unauthorized sessions and hide restricted UI actions.
2. **Backend API Authorization:** Public anon key is strictly sandboxed; all mutations pass through PostgreSQL Row-Level Security (RLS).
3. **Database Security Invariants:** Critical transactions (stock deduction, invoice numbering, payment adjustments) are executed inside `SECURITY DEFINER` functions with rigorous transactional validation.

---

## 2. Granular Permissions Matrix

| Resource | Operation | Owner | Manager | Sales Employee | Inventory Employee |
|---|---|:---:|:---:|:---:|:---:|
| **Products Master** | Read | ✅ | ✅ | ✅ | ✅ |
| | Create / Edit | ✅ | ✅ | ❌ | ✅ |
| | Delete / Archive | ✅ | ❌ | ❌ | ❌ |
| **Inventory Stock** | View Balances | ✅ | ✅ | ✅ | ✅ |
| | Stock Adjustment | ✅ | ✅ | ❌ | ✅ |
| | Physical Write-off | ✅ | ✅ | ❌ | ❌ |
| **Invoices** | Create & Finalize | ✅ | ✅ | ✅ | ❌ |
| | Cancel / Void | ✅ | ✅ | ❌ | ❌ |
| **Customer Credit** | Create Customer | ✅ | ✅ | ✅ | ❌ |
| | Record Payment | ✅ | ✅ | ✅ | ❌ |
| | Adjust Balance | ✅ | ❌ | ❌ | ❌ |
| **Purchases** | Create / Receive | ✅ | ✅ | ❌ | ✅ |
| **Business Reports**| Financial & Tax | ✅ | ✅ | ❌ | ❌ |
| **System Settings** | Tax & Bank Profile| ✅ | ❌ | ❌ | ❌ |
| | User Role Assign | ✅ | ❌ | ❌ | ❌ |
| **Audit Logs** | View Log Trail | ✅ | ✅ | ❌ | ❌ |

---

## 3. Row-Level Security (RLS) Policy Implementation

All 17 PostgreSQL tables have RLS explicitly enabled:
```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- (See supabase/migrations/001_initial_schema.sql for the complete policy definitions)
```
Direct client modification of `audit_logs` and `stock_movements` is prohibited by RLS policies; inserts can only be created by approved stored procedures.
