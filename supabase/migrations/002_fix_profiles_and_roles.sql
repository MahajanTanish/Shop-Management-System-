-- =============================================================================
-- Migration 002: Fix Profiles, Stock Balances Trigger, and Permissions
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- =============================================================================

-- 1. Fix stock_balances trigger to run as SECURITY DEFINER so product inserts succeed
CREATE OR REPLACE FUNCTION initialize_stock_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.stock_balances (product_id, quantity)
    VALUES (NEW.id, 0)
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- 2. Allow inserting and updating stock_balances for authenticated users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'stock_balances' AND policyname = 'stock_balances_insert'
    ) THEN
        CREATE POLICY "stock_balances_insert" 
            ON public.stock_balances FOR INSERT 
            WITH CHECK (is_authenticated());
    END IF;
END $$;

-- 3. Allow authenticated users to insert and read their own profile
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'profiles_insert_own'
    ) THEN
        CREATE POLICY "profiles_insert_own" 
            ON public.profiles FOR INSERT 
            WITH CHECK (id = auth.uid());
    END IF;
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS "profiles_select_staff" ON public.profiles;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'profiles_select_authenticated'
    ) THEN
        CREATE POLICY "profiles_select_authenticated" 
            ON public.profiles FOR SELECT 
            USING (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- 4. Allow owners or users updating their own role/profile
DO $$
BEGIN
    DROP POLICY IF EXISTS "profiles_update_owner" ON public.profiles;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'profiles_update_role'
    ) THEN
        CREATE POLICY "profiles_update_role" 
            ON public.profiles FOR UPDATE 
            USING (
                current_user_role() = 'owner' 
                OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'owner')
                OR id = auth.uid()
            );
    END IF;
END $$;

-- 5. Allow category and brand auto-creation during catalogue import
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
CREATE POLICY "categories_insert" ON public.categories FOR INSERT 
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'inventory_employee') OR is_authenticated());

DROP POLICY IF EXISTS "brands_insert" ON public.brands;
CREATE POLICY "brands_insert" ON public.brands FOR INSERT 
    WITH CHECK (current_user_role() IN ('owner', 'manager', 'inventory_employee') OR is_authenticated());

-- 6. Backfill any auth.users that are missing from public.profiles
INSERT INTO public.profiles (id, role, full_name)
SELECT 
    id, 
    'owner'::user_role, 
    COALESCE(raw_user_meta_data->>'full_name', email, 'Store Owner')
FROM auth.users
ON CONFLICT (id) DO UPDATE 
SET role = 'owner';


