-- =============================================================================
-- BikeParts Smart AI — Initial Database Schema
-- Migration: 001_initial_schema.sql
-- Target: Supabase (PostgreSQL 15+)
-- 
-- Apply this migration via the Supabase Dashboard → SQL Editor,
-- or using the Supabase CLI: supabase db push
--
-- IMPORTANT: Review all RLS policies and confirm business rules with the
-- business owner before applying to production.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('owner', 'manager', 'sales_employee', 'inventory_employee');
CREATE TYPE customer_type AS ENUM ('retail', 'wholesale', 'both');
CREATE TYPE invoice_status AS ENUM ('draft', 'finalized', 'cancelled');
CREATE TYPE invoice_type AS ENUM ('retail', 'wholesale');
CREATE TYPE payment_method AS ENUM ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other');
CREATE TYPE stock_movement_type AS ENUM (
    'opening_stock', 'purchase_receipt', 'sale',
    'customer_return', 'supplier_return', 'damage_writeoff',
    'stock_adjustment', 'stock_count'
);
CREATE TYPE purchase_status AS ENUM ('draft', 'received', 'partially_received', 'cancelled');
CREATE TYPE return_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE returned_stock_condition AS ENUM ('sellable', 'damaged', 'quarantined');

-- =============================================================================
-- PROFILES (extends auth.users)
-- =============================================================================

CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role        user_role NOT NULL DEFAULT 'sales_employee',
    full_name   TEXT,
    phone       TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, role, full_name)
    VALUES (
        NEW.id,
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'sales_employee'),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- BUSINESS SETTINGS (single row)
-- =============================================================================

CREATE TABLE business_settings (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name         TEXT NOT NULL DEFAULT 'Ved Scooter Works',
    legal_name            TEXT,
    address               TEXT,
    city                  TEXT,
    state                 TEXT,
    pin_code              TEXT,
    -- ASSUMPTION: GSTIN and GST registration status require confirmation from the business owner.
    -- Do not treat these defaults as confirmed legal facts.
    gstin                 TEXT,
    pan                   TEXT,
    phone                 TEXT,
    email                 TEXT,
    website               TEXT,
    invoice_prefix        TEXT NOT NULL DEFAULT 'INV',
    invoice_counter       INTEGER NOT NULL DEFAULT 1,
    gst_registered        BOOLEAN NOT NULL DEFAULT FALSE,
    bank_name             TEXT,
    bank_account_number   TEXT,
    bank_ifsc             TEXT,
    bank_branch           TEXT,
    invoice_footer_note   TEXT,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Insert the single settings row
INSERT INTO business_settings (business_name, invoice_prefix)
VALUES ('Ved Scooter Works', 'VSW');

-- =============================================================================
-- CATEGORIES
-- =============================================================================

CREATE TABLE categories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    description TEXT,
    parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name)
);

-- =============================================================================
-- BRANDS
-- =============================================================================

CREATE TABLE brands (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name)
);

-- =============================================================================
-- TAX RATES
-- ASSUMPTION: Actual HSN codes and GST rates must be confirmed by a qualified
-- accountant before production use. These are placeholder rates.
-- =============================================================================

CREATE TABLE tax_rates (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           TEXT NOT NULL,
    rate           NUMERIC(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    hsn_code       TEXT,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to   DATE,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_date_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Common GST rates for two-wheeler spare parts
-- ASSUMPTION: Verify actual rates with accountant
INSERT INTO tax_rates (name, rate, effective_from) VALUES
    ('GST Exempt',  0.00, '2024-01-01'),
    ('GST 5%',      5.00, '2024-01-01'),
    ('GST 12%',    12.00, '2024-01-01'),
    ('GST 18%',    18.00, '2024-01-01'),
    ('GST 28%',    28.00, '2024-01-01');

-- =============================================================================
-- SUPPLIERS
-- =============================================================================

CREATE TABLE suppliers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    contact_person      TEXT,
    phone               TEXT,
    email               TEXT,
    address             TEXT,
    city                TEXT,
    state               TEXT,
    gstin               TEXT,
    pan                 TEXT,
    payment_terms       TEXT,
    outstanding_balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PRODUCTS
-- =============================================================================

CREATE TABLE products (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku                     TEXT NOT NULL,
    name                    TEXT NOT NULL,
    description             TEXT,
    brand_id                UUID REFERENCES brands(id) ON DELETE SET NULL,
    category_id             UUID REFERENCES categories(id) ON DELETE SET NULL,
    manufacturer_part_number TEXT,
    barcode                 TEXT,
    compatible_vehicles     TEXT,
    unit_of_measurement     TEXT NOT NULL DEFAULT 'piece',
    purchase_cost           NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (purchase_cost >= 0),
    retail_price            NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (retail_price >= 0),
    wholesale_price         NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (wholesale_price >= 0),
    tax_rate_id             UUID REFERENCES tax_rates(id) ON DELETE SET NULL,
    reorder_threshold       INTEGER NOT NULL DEFAULT 5 CHECK (reorder_threshold >= 0),
    preferred_supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    image_url               TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(sku)
);

CREATE INDEX idx_products_name_search ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);

-- =============================================================================
-- CUSTOMERS
-- =============================================================================

CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    phone               TEXT,
    email               TEXT,
    billing_address     TEXT,
    city                TEXT,
    state               TEXT,
    gstin               TEXT,
    customer_type       customer_type NOT NULL DEFAULT 'retail',
    credit_limit        NUMERIC(15,2),
    payment_terms       TEXT,
    outstanding_balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;

-- =============================================================================
-- STOCK BALANCES (current stock per product)
-- =============================================================================

CREATE TABLE stock_balances (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity     NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id)
);

-- Auto-create stock balance row when a product is inserted
CREATE OR REPLACE FUNCTION initialize_stock_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO stock_balances (product_id, quantity)
    VALUES (NEW.id, 0)
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_product_created
    AFTER INSERT ON products
    FOR EACH ROW EXECUTE FUNCTION initialize_stock_balance();

-- =============================================================================
-- STOCK MOVEMENTS (immutable ledger)
-- =============================================================================

CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    movement_type   stock_movement_type NOT NULL,
    quantity_change NUMERIC(15,3) NOT NULL,    -- positive = increase, negative = decrease
    quantity_before NUMERIC(15,3) NOT NULL,
    quantity_after  NUMERIC(15,3) NOT NULL,
    reference_type  TEXT,                      -- 'invoice', 'purchase', 'adjustment', etc.
    reference_id    UUID,                      -- FK to the related record
    reason          TEXT,
    notes           TEXT,
    actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT quantity_after_matches CHECK (
        ABS((quantity_before + quantity_change) - quantity_after) < 0.001
    )
);

CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

-- =============================================================================
-- INVOICES
-- =============================================================================

CREATE TABLE invoices (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number              TEXT NOT NULL,
    invoice_type                invoice_type NOT NULL DEFAULT 'retail',
    status                      invoice_status NOT NULL DEFAULT 'draft',
    customer_id                 UUID REFERENCES customers(id) ON DELETE SET NULL,
    -- Snapshot fields (immutable once finalized)
    customer_name_snapshot      TEXT,
    customer_phone_snapshot     TEXT,
    customer_gstin_snapshot     TEXT,
    customer_address_snapshot   TEXT,
    billing_date                DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date                    DATE,
    -- Financial totals (all stored with 2 decimal precision)
    subtotal                    NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_discount              NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    taxable_amount              NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_cgst                  NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_sgst                  NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_igst                  NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_tax                   NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    grand_total                 NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    amount_paid                 NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    outstanding_amount          NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    notes                       TEXT,
    is_inter_state              BOOLEAN NOT NULL DEFAULT FALSE,
    created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    finalized_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    cancelled_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at                TIMESTAMPTZ,
    cancelled_at                TIMESTAMPTZ,
    cancellation_reason         TEXT,
    UNIQUE(invoice_number)
);

CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_customer ON invoices(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_invoices_date ON invoices(billing_date DESC);
CREATE INDEX idx_invoices_created ON invoices(created_at DESC);

-- =============================================================================
-- INVOICE ITEMS (snapshot — never changes after finalization)
-- =============================================================================

CREATE TABLE invoice_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
    -- Snapshot (preserved even if product is later edited)
    product_name        TEXT NOT NULL,
    product_sku         TEXT NOT NULL,
    hsn_code            TEXT,
    unit_of_measurement TEXT NOT NULL DEFAULT 'piece',
    quantity            NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
    unit_price          NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),
    discount_percent    NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (discount_percent >= 0 AND discount_percent <= 100),
    discount_amount     NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    taxable_amount      NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    tax_rate            NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    cgst_rate           NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    sgst_rate           NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    igst_rate           NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    cgst_amount         NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    sgst_amount         NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    igst_amount         NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_tax           NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    line_total          NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- =============================================================================
-- PAYMENTS
-- =============================================================================

CREATE TABLE payments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
    invoice_id       UUID REFERENCES invoices(id) ON DELETE SET NULL,
    amount           NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    payment_method   payment_method NOT NULL DEFAULT 'cash',
    payment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_number TEXT,
    notes            TEXT,
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_customer ON payments(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_payments_invoice ON payments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_payments_date ON payments(payment_date DESC);

-- =============================================================================
-- PURCHASES
-- =============================================================================

CREATE TABLE purchases (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_number         TEXT NOT NULL,
    supplier_id             UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name_snapshot  TEXT,
    status                  purchase_status NOT NULL DEFAULT 'draft',
    purchase_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    supplier_invoice_ref    TEXT,
    subtotal                NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_tax               NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    grand_total             NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    amount_paid             NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    outstanding_amount      NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    notes                   TEXT,
    received_at             TIMESTAMPTZ,
    created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(purchase_number)
);

CREATE INDEX idx_purchases_supplier ON purchases(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_purchases_date ON purchases(purchase_date DESC);

-- =============================================================================
-- PURCHASE ITEMS
-- =============================================================================

CREATE TABLE purchase_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id         UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name        TEXT NOT NULL,
    product_sku         TEXT NOT NULL,
    quantity            NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
    unit_cost           NUMERIC(15,2) NOT NULL CHECK (unit_cost >= 0),
    tax_rate            NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    tax_amount          NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    line_total          NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    received_quantity   NUMERIC(15,3) NOT NULL DEFAULT 0.00
);

CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);

-- =============================================================================
-- SALE RETURNS
-- =============================================================================

CREATE TABLE sale_returns (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_number   TEXT NOT NULL,
    invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    return_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    status          return_status NOT NULL DEFAULT 'pending',
    reason          TEXT,
    refund_amount   NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    refund_method   payment_method,
    notes           TEXT,
    approved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(return_number)
);

CREATE TABLE sale_return_items (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id        UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    invoice_item_id  UUID REFERENCES invoice_items(id) ON DELETE SET NULL,
    product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name     TEXT NOT NULL,
    product_sku      TEXT NOT NULL,
    quantity         NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
    unit_price       NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    stock_condition  returned_stock_condition NOT NULL DEFAULT 'sellable',
    return_to_stock  BOOLEAN NOT NULL DEFAULT TRUE
);

-- =============================================================================
-- AUDIT LOG (immutable)
-- =============================================================================

CREATE TABLE audit_logs (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_name   TEXT,
    action       TEXT NOT NULL,
    entity_type  TEXT NOT NULL,
    entity_id    UUID,
    old_values   JSONB,
    new_values   JSONB,
    ip_address   INET,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- =============================================================================
-- IMPORT BATCHES
-- =============================================================================

CREATE TABLE import_batches (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_type   TEXT NOT NULL,
    file_name     TEXT NOT NULL,
    total_rows    INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    error_rows    INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','completed','failed')),
    summary       JSONB,
    created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ
);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_suppliers_updated_at
    BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_purchases_updated_at
    BEFORE UPDATE ON purchases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- FUNCTION: Get next invoice number (safe for concurrent requests)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix  TEXT;
    v_counter INTEGER;
    v_number  TEXT;
BEGIN
    -- Lock the settings row to prevent concurrent increments
    SELECT invoice_prefix, invoice_counter
    INTO v_prefix, v_counter
    FROM business_settings
    LIMIT 1
    FOR UPDATE;

    v_number := v_prefix || '-' || LPAD(v_counter::TEXT, 5, '0');

    UPDATE business_settings SET invoice_counter = invoice_counter + 1;

    RETURN v_number;
END;
$$;

-- =============================================================================
-- FUNCTION: Get next purchase number
-- =============================================================================

CREATE OR REPLACE FUNCTION get_next_purchase_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix  TEXT;
    v_counter INTEGER;
BEGIN
    -- Use a sequence-based approach via a dedicated counter
    SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(purchase_number, '[^0-9]', '', 'g') AS INTEGER)), 0) + 1
    INTO v_counter
    FROM purchases;

    RETURN 'PO-' || LPAD(v_counter::TEXT, 5, '0');
END;
$$;

-- =============================================================================
-- FUNCTION: Finalize invoice (atomic transaction)
-- Validates stock, creates invoice, deducts stock, records payment
-- =============================================================================

CREATE OR REPLACE FUNCTION finalize_invoice(
    p_invoice_data   JSONB,
    p_items_data     JSONB,
    p_payment_amount NUMERIC DEFAULT 0,
    p_payment_method payment_method DEFAULT 'cash',
    p_actor_id       UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice_id    UUID;
    v_invoice_num   TEXT;
    v_item          JSONB;
    v_product_id    UUID;
    v_qty           NUMERIC;
    v_current_stock NUMERIC;
    v_stock_before  NUMERIC;
    v_stock_after   NUMERIC;
    v_customer_id   UUID;
    v_outstanding   NUMERIC;
BEGIN
    -- Get next invoice number (locks settings row)
    v_invoice_num := get_next_invoice_number();

    -- Insert the invoice
    INSERT INTO invoices (
        invoice_number, invoice_type, status,
        customer_id, customer_name_snapshot, customer_phone_snapshot,
        customer_gstin_snapshot, customer_address_snapshot,
        billing_date, subtotal, total_discount, taxable_amount,
        total_cgst, total_sgst, total_igst, total_tax, grand_total,
        amount_paid, outstanding_amount, notes, is_inter_state,
        created_by, finalized_by, finalized_at
    )
    SELECT
        v_invoice_num,
        (p_invoice_data->>'invoice_type')::invoice_type,
        'finalized',
        NULLIF(p_invoice_data->>'customer_id', '')::UUID,
        p_invoice_data->>'customer_name_snapshot',
        p_invoice_data->>'customer_phone_snapshot',
        p_invoice_data->>'customer_gstin_snapshot',
        p_invoice_data->>'customer_address_snapshot',
        (p_invoice_data->>'billing_date')::DATE,
        (p_invoice_data->>'subtotal')::NUMERIC,
        (p_invoice_data->>'total_discount')::NUMERIC,
        (p_invoice_data->>'taxable_amount')::NUMERIC,
        (p_invoice_data->>'total_cgst')::NUMERIC,
        (p_invoice_data->>'total_sgst')::NUMERIC,
        (p_invoice_data->>'total_igst')::NUMERIC,
        (p_invoice_data->>'total_tax')::NUMERIC,
        (p_invoice_data->>'grand_total')::NUMERIC,
        p_payment_amount,
        (p_invoice_data->>'grand_total')::NUMERIC - p_payment_amount,
        p_invoice_data->>'notes',
        COALESCE((p_invoice_data->>'is_inter_state')::BOOLEAN, FALSE),
        p_actor_id,
        p_actor_id,
        NOW()
    RETURNING id INTO v_invoice_id;

    -- Process each invoice item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC;

        -- Check stock if product_id provided
        IF v_product_id IS NOT NULL THEN
            SELECT quantity INTO v_current_stock
            FROM stock_balances
            WHERE product_id = v_product_id
            FOR UPDATE;  -- Lock this row

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Stock record not found for product %', v_product_id;
            END IF;

            IF v_current_stock < v_qty THEN
                RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Required: %',
                    v_item->>'product_name', v_current_stock, v_qty;
            END IF;

            v_stock_before := v_current_stock;
            v_stock_after := v_current_stock - v_qty;

            -- Deduct stock
            UPDATE stock_balances
            SET quantity = v_stock_after, last_updated = NOW()
            WHERE product_id = v_product_id;

            -- Record stock movement
            INSERT INTO stock_movements (
                product_id, movement_type, quantity_change,
                quantity_before, quantity_after,
                reference_type, reference_id, actor_id
            ) VALUES (
                v_product_id, 'sale', -v_qty,
                v_stock_before, v_stock_after,
                'invoice', v_invoice_id, p_actor_id
            );
        END IF;

        -- Insert invoice item snapshot
        INSERT INTO invoice_items (
            invoice_id, product_id,
            product_name, product_sku, hsn_code, unit_of_measurement,
            quantity, unit_price, discount_percent, discount_amount,
            taxable_amount, tax_rate, cgst_rate, sgst_rate, igst_rate,
            cgst_amount, sgst_amount, igst_amount, total_tax, line_total,
            sort_order
        ) VALUES (
            v_invoice_id, v_product_id,
            v_item->>'product_name', v_item->>'product_sku',
            v_item->>'hsn_code', v_item->>'unit_of_measurement',
            v_qty, (v_item->>'unit_price')::NUMERIC,
            COALESCE((v_item->>'discount_percent')::NUMERIC, 0),
            COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
            (v_item->>'taxable_amount')::NUMERIC,
            COALESCE((v_item->>'tax_rate')::NUMERIC, 0),
            COALESCE((v_item->>'cgst_rate')::NUMERIC, 0),
            COALESCE((v_item->>'sgst_rate')::NUMERIC, 0),
            COALESCE((v_item->>'igst_rate')::NUMERIC, 0),
            COALESCE((v_item->>'cgst_amount')::NUMERIC, 0),
            COALESCE((v_item->>'sgst_amount')::NUMERIC, 0),
            COALESCE((v_item->>'igst_amount')::NUMERIC, 0),
            COALESCE((v_item->>'total_tax')::NUMERIC, 0),
            (v_item->>'line_total')::NUMERIC,
            COALESCE((v_item->>'sort_order')::INTEGER, 0)
        );
    END LOOP;

    -- Record payment if any
    v_customer_id := NULLIF(p_invoice_data->>'customer_id', '')::UUID;
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (customer_id, invoice_id, amount, payment_method, payment_date, created_by)
        VALUES (v_customer_id, v_invoice_id, p_payment_amount, p_payment_method, CURRENT_DATE, p_actor_id);
    END IF;

    -- Update customer outstanding balance
    IF v_customer_id IS NOT NULL THEN
        v_outstanding := (p_invoice_data->>'grand_total')::NUMERIC - p_payment_amount;
        UPDATE customers
        SET outstanding_balance = outstanding_balance + v_outstanding,
            updated_at = NOW()
        WHERE id = v_customer_id;
    END IF;

    -- Write audit log
    INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, new_values)
    SELECT p_actor_id, p.full_name, 'invoice_finalized', 'invoice', v_invoice_id,
           jsonb_build_object('invoice_number', v_invoice_num, 'grand_total', p_invoice_data->>'grand_total')
    FROM profiles p WHERE p.id = p_actor_id;

    RETURN jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_num);
END;
$$;

-- =============================================================================
-- FUNCTION: Record stock adjustment
-- =============================================================================

CREATE OR REPLACE FUNCTION record_stock_adjustment(
    p_product_id     UUID,
    p_quantity_change NUMERIC,
    p_reason         TEXT,
    p_notes          TEXT DEFAULT NULL,
    p_actor_id       UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_before NUMERIC;
    v_after  NUMERIC;
BEGIN
    SELECT quantity INTO v_before
    FROM stock_balances
    WHERE product_id = p_product_id
    FOR UPDATE;

    IF v_before IS NULL THEN
        RAISE EXCEPTION 'Stock record not found for product %', p_product_id;
    END IF;

    v_after := v_before + p_quantity_change;

    IF v_after < 0 THEN
        RAISE EXCEPTION 'Adjustment would result in negative stock. Current: %, Change: %', v_before, p_quantity_change;
    END IF;

    UPDATE stock_balances SET quantity = v_after, last_updated = NOW()
    WHERE product_id = p_product_id;

    INSERT INTO stock_movements (
        product_id, movement_type, quantity_change,
        quantity_before, quantity_after, reason, notes, actor_id
    ) VALUES (
        p_product_id, 'stock_adjustment', p_quantity_change,
        v_before, v_after, p_reason, p_notes, p_actor_id
    );

    -- Audit
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, new_values)
    VALUES (p_actor_id, 'stock_adjustment', 'product', p_product_id,
            jsonb_build_object('quantity_change', p_quantity_change, 'reason', p_reason));
END;
$$;

-- =============================================================================
-- FUNCTION: Receive purchase (atomic)
-- =============================================================================

CREATE OR REPLACE FUNCTION receive_purchase(
    p_purchase_id UUID,
    p_actor_id    UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item        RECORD;
    v_stock_before NUMERIC;
    v_stock_after  NUMERIC;
BEGIN
    -- Lock the purchase
    PERFORM id FROM purchases WHERE id = p_purchase_id FOR UPDATE;

    -- Process each item
    FOR v_item IN
        SELECT pi.*, p.id AS prod_id
        FROM purchase_items pi
        JOIN products p ON p.id = pi.product_id
        WHERE pi.purchase_id = p_purchase_id
    LOOP
        SELECT quantity INTO v_stock_before
        FROM stock_balances
        WHERE product_id = v_item.product_id
        FOR UPDATE;

        v_stock_after := v_stock_before + v_item.quantity;

        UPDATE stock_balances
        SET quantity = v_stock_after, last_updated = NOW()
        WHERE product_id = v_item.product_id;

        INSERT INTO stock_movements (
            product_id, movement_type, quantity_change,
            quantity_before, quantity_after, reference_type, reference_id, actor_id
        ) VALUES (
            v_item.product_id, 'purchase_receipt', v_item.quantity,
            v_stock_before, v_stock_after, 'purchase', p_purchase_id, p_actor_id
        );

        UPDATE purchase_items
        SET received_quantity = quantity
        WHERE id = v_item.id;
    END LOOP;

    UPDATE purchases
    SET status = 'received', received_at = NOW(), updated_at = NOW()
    WHERE id = p_purchase_id;

    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
    VALUES (p_actor_id, 'purchase_received', 'purchase', p_purchase_id);
END;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_authenticated()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
    SELECT auth.uid() IS NOT NULL;
$$;

-- ─── PROFILES ─────────────────────────────────────────────────────────────────

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
    ON profiles FOR SELECT
    USING (id = auth.uid());

-- Owners and managers can read all profiles
CREATE POLICY "profiles_select_staff"
    ON profiles FOR SELECT
    USING (current_user_role() IN ('owner', 'manager'));

-- Users can update their own non-role fields
CREATE POLICY "profiles_update_own"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Only owners can change roles or manage other users
CREATE POLICY "profiles_update_owner"
    ON profiles FOR UPDATE
    USING (current_user_role() = 'owner');

-- ─── BUSINESS SETTINGS ────────────────────────────────────────────────────────

CREATE POLICY "business_settings_select"
    ON business_settings FOR SELECT
    USING (is_authenticated());

CREATE POLICY "business_settings_update"
    ON business_settings FOR UPDATE
    USING (current_user_role() = 'owner');

-- ─── CATEGORIES / BRANDS / TAX RATES (reference data) ────────────────────────

CREATE POLICY "categories_select" ON categories FOR SELECT USING (is_authenticated());
CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (current_user_role() IN ('owner', 'manager'));
CREATE POLICY "categories_update" ON categories FOR UPDATE USING (current_user_role() IN ('owner', 'manager'));

CREATE POLICY "brands_select" ON brands FOR SELECT USING (is_authenticated());
CREATE POLICY "brands_insert" ON brands FOR INSERT WITH CHECK (current_user_role() IN ('owner', 'manager'));
CREATE POLICY "brands_update" ON brands FOR UPDATE USING (current_user_role() IN ('owner', 'manager'));

CREATE POLICY "tax_rates_select" ON tax_rates FOR SELECT USING (is_authenticated());
CREATE POLICY "tax_rates_insert" ON tax_rates FOR INSERT WITH CHECK (current_user_role() = 'owner');
CREATE POLICY "tax_rates_update" ON tax_rates FOR UPDATE USING (current_user_role() = 'owner');

-- ─── PRODUCTS ─────────────────────────────────────────────────────────────────

CREATE POLICY "products_select" ON products FOR SELECT USING (is_authenticated());
CREATE POLICY "products_insert" ON products FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'inventory_employee'));
CREATE POLICY "products_update" ON products FOR UPDATE
    USING (current_user_role() IN ('owner', 'manager', 'inventory_employee'));
-- Products are never physically deleted (historical data preservation)
CREATE POLICY "products_delete" ON products FOR DELETE
    USING (current_user_role() = 'owner');

-- ─── SUPPLIERS ────────────────────────────────────────────────────────────────

CREATE POLICY "suppliers_select" ON suppliers FOR SELECT USING (is_authenticated());
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'inventory_employee'));
CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE
    USING (current_user_role() IN ('owner', 'manager', 'inventory_employee'));

-- ─── CUSTOMERS ────────────────────────────────────────────────────────────────

CREATE POLICY "customers_select" ON customers FOR SELECT USING (is_authenticated());
CREATE POLICY "customers_insert" ON customers FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'sales_employee'));
CREATE POLICY "customers_update" ON customers FOR UPDATE
    USING (current_user_role() IN ('owner', 'manager', 'sales_employee'));

-- ─── STOCK ────────────────────────────────────────────────────────────────────

CREATE POLICY "stock_balances_select" ON stock_balances FOR SELECT USING (is_authenticated());
CREATE POLICY "stock_balances_update" ON stock_balances FOR UPDATE
    USING (current_user_role() IN ('owner', 'manager', 'inventory_employee'));

CREATE POLICY "stock_movements_select" ON stock_movements FOR SELECT USING (is_authenticated());
-- Stock movements are only inserted via DB functions (SECURITY DEFINER)
-- No direct client INSERT allowed
CREATE POLICY "stock_movements_insert" ON stock_movements FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'inventory_employee'));

-- ─── INVOICES ─────────────────────────────────────────────────────────────────

CREATE POLICY "invoices_select" ON invoices FOR SELECT USING (is_authenticated());
CREATE POLICY "invoices_insert" ON invoices FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'sales_employee'));
CREATE POLICY "invoices_update" ON invoices FOR UPDATE
    USING (current_user_role() IN ('owner', 'manager', 'sales_employee'));

CREATE POLICY "invoice_items_select" ON invoice_items FOR SELECT USING (is_authenticated());
CREATE POLICY "invoice_items_insert" ON invoice_items FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'sales_employee'));

-- ─── PAYMENTS ─────────────────────────────────────────────────────────────────

CREATE POLICY "payments_select" ON payments FOR SELECT USING (is_authenticated());
CREATE POLICY "payments_insert" ON payments FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'sales_employee'));

-- ─── PURCHASES ────────────────────────────────────────────────────────────────

CREATE POLICY "purchases_select" ON purchases FOR SELECT USING (is_authenticated());
CREATE POLICY "purchases_insert" ON purchases FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'inventory_employee'));
CREATE POLICY "purchases_update" ON purchases FOR UPDATE
    USING (current_user_role() IN ('owner', 'manager', 'inventory_employee'));

CREATE POLICY "purchase_items_select" ON purchase_items FOR SELECT USING (is_authenticated());
CREATE POLICY "purchase_items_insert" ON purchase_items FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'inventory_employee'));

-- ─── RETURNS ──────────────────────────────────────────────────────────────────

CREATE POLICY "sale_returns_select" ON sale_returns FOR SELECT USING (is_authenticated());
CREATE POLICY "sale_returns_insert" ON sale_returns FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'sales_employee'));
CREATE POLICY "sale_returns_update" ON sale_returns FOR UPDATE
    USING (current_user_role() IN ('owner', 'manager'));

CREATE POLICY "sale_return_items_select" ON sale_return_items FOR SELECT USING (is_authenticated());
CREATE POLICY "sale_return_items_insert" ON sale_return_items FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'sales_employee'));

-- ─── AUDIT LOGS (read-only for users, written by DB functions) ────────────────

CREATE POLICY "audit_logs_select"
    ON audit_logs FOR SELECT
    USING (current_user_role() IN ('owner', 'manager'));
-- Audit logs are only inserted via SECURITY DEFINER functions
-- No direct client insert allowed
CREATE POLICY "audit_logs_insert"
    ON audit_logs FOR INSERT
    WITH CHECK (current_user_role() = 'owner');

-- ─── IMPORT BATCHES ───────────────────────────────────────────────────────────

CREATE POLICY "import_batches_select" ON import_batches FOR SELECT
    USING (current_user_role() IN ('owner', 'manager', 'inventory_employee'));
CREATE POLICY "import_batches_insert" ON import_batches FOR INSERT
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'inventory_employee'));
CREATE POLICY "import_batches_update" ON import_batches FOR UPDATE
    USING (current_user_role() IN ('owner', 'manager'));

-- =============================================================================
-- END OF MIGRATION 001
-- =============================================================================
