# BikeParts Smart AI — Architecture Documentation
**Client:** Ved Scooter Works  
**System:** BikeParts Smart AI  
**Version:** 1.0.0 (Production Release Architecture)

---

## 1. System Overview

BikeParts Smart AI is a business management and inventory accounting system designed for two-wheeler spare parts wholesale and retail shops. The system is engineered around strict transactional data integrity, auditable stock accounting, and Indian tax compliance.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER                            │
│  React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query v5    │
│  - Responsive Desktop POS & Mobile Tablet interface                    │
│  - Optimistic client updates with authoritative server validation      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          APPLICATION LAYER                             │
│  - Route Protection & Role Hierarchy (Owner / Manager / Sales / Inv)   │
│  - Client-side Form Validation with Zod v4 schemas                     │
│  - Offline PWA Service Worker caching (Read-only reference caching)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BUSINESS LOGIC LAYER                            │
│  - Double-precision financial decimal math (roundMoney / calculateGST) │
│  - Transactional stock validation (Lock before mutate, FIFO balancing) │
│  - Customer credit aging and automatic receipt reconciliation          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           DATABASE LAYER                               │
│  PostgreSQL 15+ (Supabase)                                             │
│  - Row-Level Security (RLS) on 100% of tables                          │
│  - Atomic Stored Procedures:                                           │
│      • finalize_invoice()           • receive_purchase()               │
│      • record_stock_adjustment()    • get_next_invoice_number()        │
│  - Immutable append-only ledgers: stock_movements & audit_logs         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Architecture Pillars

### 2.1 The Two-Leg Stock Accounting Principle
Stock balances are **never** directly edited by end users without an accompanying ledger entry:
1. Every stock change creates an immutable row in `stock_movements`.
2. The current balance in `stock_balances` is checked via row-level locking (`FOR UPDATE`) to prevent concurrent overselling.
3. Quantities are validated so that no transaction can silently drop stock into negative numbers unless explicitly authorized.

### 2.2 Financial Snapshot Preservation
When a product's price or description changes in the product catalogue, historical sales documents **must not mutate**.
Every finalized invoice item stores:
- `product_name`
- `product_sku`
- `hsn_code`
- `unit_of_measurement`
- `unit_price`
- `discount_percent` & `discount_amount`
- `tax_rate`, `cgst_rate`, `sgst_rate`, `igst_rate`
- `taxable_amount` & `line_total`

### 2.3 Role-Based Security Matrix

| Role | Catalogue | POS Billing | Purchases | Customer Credit | Reports | Settings & Roles |
|---|---|---|---|---|---|---|
| **Owner** | Full | Full | Full | Full | Full | Full |
| **Manager** | Full | Full | Full | Full | Full | None |
| **Sales Employee** | Read | Full | None | Record Payment | Restricted | None |
| **Inventory Employee**| Full | None | Full | None | Restricted | None |
