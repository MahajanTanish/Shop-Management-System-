# BikeParts Smart AI — Ved Scooter Works
**Production-Ready Spare Parts Inventory, Billing, and Business Intelligence System**

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.3-61dafb.svg)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%2015-3ecf8e.svg)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Vitest-Passed%20(14%2F14)-success.svg)](https://vitest.dev/)

---

## 🛵 About The Project

**BikeParts Smart AI** is built specifically for **Ved Scooter Works**, a two-wheeler spare parts wholesale and retail business transitioning from paper registers and lists to a dependable, audit-grade digital management system.

The application manages actual spare parts products, stock movements, purchases, retail bills, GST invoices, customer credit ledgers, supplier balances, payments, and business analytics.

---

## ⚡ Core Features

- **Product Catalogue Master:** Comprehensive catalogue (500–5,000+ parts) with SKU, barcode, manufacturer part numbers, compatible two-wheeler models (Activa, Jupiter, Pulsar, etc.), purchase cost, retail and wholesale price benchmarks, reorder thresholds, and active/archive status.
- **Two-Leg Stock Accounting:** Immutable `stock_movements` ledger paired with real-time `stock_balances`. Every unit change has an auditable type (`sale`, `purchase_receipt`, `customer_return`, `stock_adjustment`). Concurrency safe with row-level database locking.
- **Retail & Wholesale POS Billing:** Fast part search, retail vs wholesale tier pricing, discount calculation, GST breakdowns (CGST/SGST/IGST), walk-in and credit customer workflows, atomic transaction finalization, and thermal/A4 print layouts.
- **Customer Credit & Ledger Reconciliation:** Full statement of account (Ledger) for mechanics and workshops. Tracks running balances, credit limits, on-account payments, and FIFO invoice settlement.
- **Supplier Purchasing & Stock Receipts:** Vendor management, PO tracking, and atomic goods receipt workflows that synchronize with stock balances.
- **Business Intelligence & Reports:** Real database aggregations for period sales, GST tax collected, inventory valuation (at cost vs at retail), and aged receivables.
- **Tamper-Evident Audit Trail:** Every consequential business action is logged with actor, timestamp, before/after JSON snapshots, and immutable database permissions.
- **Role-Based Access Control:** Strict roles (`owner`, `manager`, `sales_employee`, `inventory_employee`) enforced at both the UI and PostgreSQL Row-Level Security (RLS) layers.

---

## 🛠️ Technology Stack

- **Frontend:** React 19, TypeScript (Strict), Vite, React Router v7, Tailwind CSS v4, Lucide Icons, Recharts.
- **State & Server Management:** TanStack Query v5, React Hook Form, Zod v4 validation.
- **Database & Auth:** Supabase (PostgreSQL 15+), Supabase Auth, Row-Level Security (RLS).
- **Testing:** Vitest, React Testing Library, jsdom.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local` and add your Supabase credentials:
```bash
cp .env.example .env.local
```

### 3. Deploy Database
Open your Supabase SQL editor and execute the complete migration file:
[`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)

### 4. Run Development Server
```bash
pnpm run dev
```

### 5. Run Verification Suite
```bash
# Run unit tests
pnpm run test

# Type-check entire codebase
pnpm run type-check

# Build for production
pnpm run build
```

---

## 📚 Documentation Index

- [Architecture Design](docs/architecture.md)
- [Database Schema Reference](docs/database-schema.md)
- [Business Workflows Guide](docs/business-workflows.md)
- [Permissions & Security Model](docs/permissions.md)
- [GST Compliance Checklist](docs/gst-compliance-checklist.md)
- [Testing & Verification Report](docs/testing.md)
- [Operations Manual & Daily Runbook](docs/operations-manual.md)

---

## ⚖️ Legal & Business Confirmations Needed

Before production deployment, the business owner must confirm:
1. Registered legal entity name (if different from "Ved Scooter Works").
2. Active GSTIN and GST registration scheme (Regular vs Composition).
3. Product-specific HSN codes and GST rates (typically 18% or 28% for vehicle parts).
4. Configured credit limits for workshop accounts.
