# Database Schema Reference
**Database:** PostgreSQL 15+ (Hosted on Supabase)  
**Schema Migration File:** `supabase/migrations/001_initial_schema.sql`

---

## 1. Core Tables

### `profiles`
Extends `auth.users` with application-specific RBAC.
- `id` (UUID, PK, references `auth.users.id`)
- `role` (ENUM: `owner`, `manager`, `sales_employee`, `inventory_employee`)
- `full_name` (TEXT)
- `phone` (TEXT)
- `is_active` (BOOLEAN, default TRUE)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `business_settings`
Singleton table storing shop identity, tax registration, and numbering sequences.
- `id` (UUID, PK)
- `business_name` (TEXT, default 'Ved Scooter Works')
- `legal_name` (TEXT)
- `gstin`, `pan` (TEXT)
- `address`, `city`, `state`, `pin_code` (TEXT)
- `invoice_prefix` (TEXT, default 'VSW')
- `invoice_counter` (INTEGER, sequence counter)
- `gst_registered` (BOOLEAN)
- `bank_name`, `bank_account_number`, `bank_ifsc`, `bank_branch` (TEXT)

### `products`
The master catalogue of two-wheeler spare parts.
- `id` (UUID, PK)
- `sku` (TEXT, UNIQUE)
- `name` (TEXT)
- `brand_id` (FK `brands`)
- `category_id` (FK `categories`)
- `manufacturer_part_number` (TEXT)
- `barcode` (TEXT)
- `compatible_vehicles` (TEXT)
- `unit_of_measurement` (TEXT, e.g., 'piece', 'set', 'litre')
- `purchase_cost` (NUMERIC(15,2))
- `retail_price` (NUMERIC(15,2))
- `wholesale_price` (NUMERIC(15,2))
- `tax_rate_id` (FK `tax_rates`)
- `reorder_threshold` (INTEGER)
- `preferred_supplier_id` (FK `suppliers`)
- `is_active` (BOOLEAN)

### `stock_balances` & `stock_movements`
Auditable stock ledger.
- `stock_balances`: Current quantity snapshot per product (`product_id`, `quantity`, `last_updated`).
- `stock_movements`: Immutable log of every unit change (`product_id`, `movement_type`, `quantity_change`, `quantity_before`, `quantity_after`, `reference_type`, `reference_id`, `reason`, `actor_id`, `created_at`).

### `invoices` & `invoice_items`
Sales records with financial snapshots.
- `invoices`: `invoice_number`, `invoice_type` (`retail` / `wholesale`), `status` (`draft`, `finalized`, `cancelled`), `customer_id`, customer snapshots, date, subtotal, discount, taxable, CGST, SGST, IGST, grand total, amount paid, outstanding amount.
- `invoice_items`: snapshot of item particulars, quantity, price, tax rates, line total.

### `payments`
Customer cash and digital receipt records.
- `id` (UUID, PK)
- `customer_id` (FK `customers`)
- `invoice_id` (FK `invoices`, nullable for on-account payments)
- `amount` (NUMERIC(15,2))
- `payment_method` (`cash`, `upi`, `bank_transfer`, `card`, `cheque`)
- `payment_date` (DATE)
- `reference_number` (TEXT, UTR / Cheque #)

### `purchases` & `purchase_items`
Supplier intake documents and PO receipts.
- Statuses: `draft`, `received`, `partially_received`, `cancelled`.

### `audit_logs`
Immutable system audit trail written by triggers and atomic procedures.

---

## 2. PostgreSQL Functions

- `get_next_invoice_number()`: Atomic counter increment with table locking to prevent duplicate invoice numbers under concurrent requests.
- `finalize_invoice(p_invoice_data, p_items_data, p_payment_amount, p_payment_method, p_actor_id)`: Atomic transaction that validates stock availability, deducts stock, creates movement entries, issues the invoice number, records upfront payment, and updates customer credit.
- `record_stock_adjustment(p_product_id, p_quantity_change, p_reason, p_notes, p_actor_id)`: Validates positive stock invariant and writes adjustment movement.
- `receive_purchase(p_purchase_id, p_actor_id)`: Increments product stock upon physical arrival of supplier orders.
