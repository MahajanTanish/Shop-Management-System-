# Operations Manual & Deployment Guide
**Application:** BikeParts Smart AI  
**Shop:** Ved Scooter Works  

---

## 1. Prerequisites

- **Node.js:** v18+ or v20+ LTS (Tested on v24.13.0)
- **Package Manager:** `pnpm` (v9+)
- **Database:** Supabase project (Free tier or Pro tier PostgreSQL 15+)

---

## 2. Environment Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Populate the Supabase credentials from your Supabase Dashboard (**Settings → API**):
   ```ini
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-actual-anon-key-here
   ```
   > [!CAUTION]
   > Never insert the `service_role` key into `.env.local` or client-accessible files. The `anon` key is strictly protected by Row-Level Security (RLS).

---

## 3. Database Deployment

1. Open your Supabase Dashboard.
2. Navigate to the **SQL Editor**.
3. Open `supabase/migrations/001_initial_schema.sql` from this repository.
4. Paste the entire SQL script and click **Run**.
5. This automatically creates:
   - All 17 tables and custom ENUM types.
   - Row-Level Security policies on all tables.
   - User creation triggers.
   - Atomic functions: `finalize_invoice`, `receive_purchase`, `record_stock_adjustment`, `get_next_invoice_number`.
   - Seed data for default GST tax rates (0%, 5%, 12%, 18%, 28%) and default business profile for Ved Scooter Works.

---

## 4. Local Development

Start the development server:
```bash
pnpm run dev
```
Open your browser at `http://localhost:5173`.

---

## 5. Testing & Verification

Run the test suite:
```bash
pnpm run test
```

Check TypeScript types across the entire project:
```bash
pnpm run type-check
```

Build for production:
```bash
pnpm run build
```

---

## 6. Daily Operations Checklist for Shop Staff

### Morning Opening (Shop Manager):
1. Log into BikeParts Smart AI.
2. Check the **Dashboard** for low-stock alerts.
3. Review any pending draft purchase orders from suppliers.

### Daily Billing (Sales Counter):
1. For walk-in customers: Click **Sales & Billing → New Invoice**, search parts by name/SKU, take cash/UPI, and print bill.
2. For workshop/mechanic accounts: Select customer name to verify credit balance before issuing parts on credit.

### Stock Inward (Inventory Employee):
1. When parts delivery arrives from a distributor, open **Purchases → New Purchase Entry**.
2. Verify physical box quantities match the supplier bill, then click **Receive & Add to Stock**.

### Evening Close:
1. Open **Payments & Credit**.
2. Verify total cash collected matches physical cash in the shop drawer.
3. Verify total UPI receipts match bank/QR settlement notifications.
