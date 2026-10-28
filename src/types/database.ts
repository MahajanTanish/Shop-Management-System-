// src/types/database.ts
// TypeScript types mirroring the PostgreSQL schema.
// Generated manually — keep in sync with supabase/migrations.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'manager' | 'sales_employee' | 'inventory_employee'
export type CustomerType = 'retail' | 'wholesale' | 'both'
export type InvoiceStatus = 'draft' | 'finalized' | 'cancelled'
export type InvoiceType = 'retail' | 'wholesale'
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'cheque' | 'other'
export type StockMovementType =
  | 'opening_stock'
  | 'purchase_receipt'
  | 'sale'
  | 'customer_return'
  | 'supplier_return'
  | 'damage_writeoff'
  | 'stock_adjustment'
  | 'stock_count'
export type PurchaseStatus = 'draft' | 'received' | 'partially_received' | 'cancelled'
export type ReturnStatus = 'pending' | 'approved' | 'rejected'
export type ReturnedStockCondition = 'sellable' | 'damaged' | 'quarantined'

// ─── Tables ───────────────────────────────────────────────────────────────────

export interface Profile {
  id: string               // references auth.users.id
  role: UserRole
  full_name: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BusinessSettings {
  id: string
  business_name: string
  legal_name: string | null
  address: string | null
  city: string | null
  state: string | null
  pin_code: string | null
  gstin: string | null
  pan: string | null
  phone: string | null
  email: string | null
  website: string | null
  invoice_prefix: string
  invoice_counter: number
  gst_registered: boolean
  bank_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  bank_branch: string | null
  invoice_footer_note: string | null
  updated_at: string
  updated_by: string | null
}

export interface Category {
  id: string
  name: string
  description: string | null
  parent_id: string | null
  is_active: boolean
  created_at: string
}

export interface Brand {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface TaxRate {
  id: string
  name: string            // e.g. "GST 18%"
  rate: number            // e.g. 18.00
  hsn_code: string | null
  effective_from: string  // date
  effective_to: string | null
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  sku: string
  name: string
  description: string | null
  brand_id: string | null
  category_id: string | null
  manufacturer_part_number: string | null
  barcode: string | null
  compatible_vehicles: string | null  // free text or JSON
  unit_of_measurement: string         // e.g. "piece", "set", "pair"
  purchase_cost: number               // last/avg purchase cost
  retail_price: number
  wholesale_price: number
  tax_rate_id: string | null
  reorder_threshold: number
  preferred_supplier_id: string | null
  is_active: boolean
  image_url: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  // joined
  brand?: Brand
  category?: Category
  tax_rate?: TaxRate
}

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  gstin: string | null
  pan: string | null
  payment_terms: string | null
  outstanding_balance: number  // amount we owe them (positive = payable)
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  billing_address: string | null
  city: string | null
  state: string | null
  gstin: string | null
  customer_type: CustomerType
  credit_limit: number | null
  payment_terms: string | null
  outstanding_balance: number   // positive = they owe us
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface StockBalance {
  id: string
  product_id: string
  quantity: number
  last_updated: string
  product?: Product
}

export interface StockMovement {
  id: string
  product_id: string
  movement_type: StockMovementType
  quantity_change: number   // positive = increase, negative = decrease
  quantity_before: number
  quantity_after: number
  reference_type: string | null  // 'invoice', 'purchase', 'adjustment', etc.
  reference_id: string | null
  reason: string | null
  notes: string | null
  actor_id: string | null
  created_at: string
  product?: Product
}

export interface Invoice {
  id: string
  invoice_number: string
  invoice_type: InvoiceType
  status: InvoiceStatus
  customer_id: string | null   // null for walk-in
  customer_name_snapshot: string | null
  customer_phone_snapshot: string | null
  customer_gstin_snapshot: string | null
  customer_address_snapshot: string | null
  billing_date: string
  due_date: string | null
  subtotal: number
  total_discount: number
  taxable_amount: number
  total_cgst: number
  total_sgst: number
  total_igst: number
  total_tax: number
  grand_total: number
  amount_paid: number
  outstanding_amount: number
  notes: string | null
  is_inter_state: boolean
  created_by: string | null
  finalized_by: string | null
  cancelled_by: string | null
  created_at: string
  updated_at: string
  finalized_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  customer?: Customer
  items?: InvoiceItem[]
  payments?: Payment[]
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  product_id: string | null
  // Snapshot fields — preserved even if product is changed/deleted
  product_name: string
  product_sku: string
  hsn_code: string | null
  unit_of_measurement: string
  quantity: number
  unit_price: number
  discount_percent: number
  discount_amount: number
  taxable_amount: number
  tax_rate: number
  cgst_rate: number
  sgst_rate: number
  igst_rate: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  total_tax: number
  line_total: number
  sort_order: number
}

export interface Payment {
  id: string
  customer_id: string | null
  invoice_id: string | null
  amount: number
  payment_method: PaymentMethod
  payment_date: string
  reference_number: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  customer?: Customer
  invoice?: Invoice
}

export interface Purchase {
  id: string
  purchase_number: string
  supplier_id: string | null
  supplier_name_snapshot: string | null
  status: PurchaseStatus
  purchase_date: string
  supplier_invoice_ref: string | null
  subtotal: number
  total_tax: number
  grand_total: number
  amount_paid: number
  outstanding_amount: number
  notes: string | null
  received_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  supplier?: Supplier
  items?: PurchaseItem[]
}

export interface PurchaseItem {
  id: string
  purchase_id: string
  product_id: string | null
  product_name: string
  product_sku: string
  quantity: number
  unit_cost: number
  tax_rate: number
  tax_amount: number
  line_total: number
  received_quantity: number
}

export interface SaleReturn {
  id: string
  return_number: string
  invoice_id: string | null
  customer_id: string | null
  return_date: string
  status: ReturnStatus
  reason: string | null
  refund_amount: number
  refund_method: PaymentMethod | null
  notes: string | null
  approved_by: string | null
  created_by: string | null
  created_at: string
  items?: SaleReturnItem[]
}

export interface SaleReturnItem {
  id: string
  return_id: string
  invoice_item_id: string | null
  product_id: string | null
  product_name: string
  product_sku: string
  quantity: number
  unit_price: number
  stock_condition: ReturnedStockCondition
  return_to_stock: boolean
}

export interface AuditLog {
  id: string
  actor_id: string | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_values: Json | null
  new_values: Json | null
  ip_address: string | null
  created_at: string
}

export interface ImportBatch {
  id: string
  import_type: string   // 'products', 'customers', 'opening_stock', etc.
  file_name: string
  total_rows: number
  imported_rows: number
  error_rows: number
  status: 'pending' | 'approved' | 'completed' | 'failed'
  summary: Json | null
  created_by: string | null
  approved_by: string | null
  created_at: string
  completed_at: string | null
}

// ─── Supabase Database type (used by createClient<Database>) ─────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      business_settings: {
        Row: BusinessSettings
        Insert: Omit<BusinessSettings, 'id' | 'updated_at'>
        Update: Partial<Omit<BusinessSettings, 'id'>>
      }
      categories: {
        Row: Category
        Insert: Omit<Category, 'id' | 'created_at'>
        Update: Partial<Omit<Category, 'id' | 'created_at'>>
      }
      brands: {
        Row: Brand
        Insert: Omit<Brand, 'id' | 'created_at'>
        Update: Partial<Omit<Brand, 'id' | 'created_at'>>
      }
      tax_rates: {
        Row: TaxRate
        Insert: Omit<TaxRate, 'id' | 'created_at'>
        Update: Partial<Omit<TaxRate, 'id' | 'created_at'>>
      }
      products: {
        Row: Product
        Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Product, 'id' | 'created_at'>>
      }
      suppliers: {
        Row: Supplier
        Insert: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Supplier, 'id' | 'created_at'>>
      }
      customers: {
        Row: Customer
        Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Customer, 'id' | 'created_at'>>
      }
      stock_balances: {
        Row: StockBalance
        Insert: Omit<StockBalance, 'id' | 'last_updated'>
        Update: Partial<Omit<StockBalance, 'id'>>
      }
      stock_movements: {
        Row: StockMovement
        Insert: Omit<StockMovement, 'id' | 'created_at'>
        Update: never  // stock movements are immutable
      }
      invoices: {
        Row: Invoice
        Insert: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Invoice, 'id' | 'created_at'>>
      }
      invoice_items: {
        Row: InvoiceItem
        Insert: Omit<InvoiceItem, 'id'>
        Update: Partial<Omit<InvoiceItem, 'id'>>
      }
      payments: {
        Row: Payment
        Insert: Omit<Payment, 'id' | 'created_at'>
        Update: Partial<Omit<Payment, 'id' | 'created_at'>>
      }
      purchases: {
        Row: Purchase
        Insert: Omit<Purchase, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Purchase, 'id' | 'created_at'>>
      }
      purchase_items: {
        Row: PurchaseItem
        Insert: Omit<PurchaseItem, 'id'>
        Update: Partial<Omit<PurchaseItem, 'id'>>
      }
      sale_returns: {
        Row: SaleReturn
        Insert: Omit<SaleReturn, 'id' | 'created_at'>
        Update: Partial<Omit<SaleReturn, 'id' | 'created_at'>>
      }
      sale_return_items: {
        Row: SaleReturnItem
        Insert: Omit<SaleReturnItem, 'id'>
        Update: Partial<Omit<SaleReturnItem, 'id'>>
      }
      audit_logs: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'created_at'>
        Update: never   // audit logs are immutable
      }
      import_batches: {
        Row: ImportBatch
        Insert: Omit<ImportBatch, 'id' | 'created_at'>
        Update: Partial<Omit<ImportBatch, 'id' | 'created_at'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      customer_type: CustomerType
      invoice_status: InvoiceStatus
      invoice_type: InvoiceType
      payment_method: PaymentMethod
      stock_movement_type: StockMovementType
      purchase_status: PurchaseStatus
    }
  }
}
