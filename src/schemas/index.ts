// src/schemas/index.ts
// Zod validation schemas for all forms and imports

import { z } from 'zod'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const signupSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  role: z.enum(['owner', 'manager', 'sales_employee', 'inventory_employee']),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string().min(1, 'Please confirm your password'),
}).refine((d) => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export const changePasswordSchema = z.object({
  current_password: z.string().min(6, 'Required'),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string().min(1, 'Required'),
}).refine((d) => d.new_password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

// ─── Product ──────────────────────────────────────────────────────────────────

export const productSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(100),
  name: z.string().min(1, 'Product name is required').max(255),
  description: z.string().max(1000).optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  manufacturer_part_number: z.string().max(100).optional().nullable(),
  barcode: z.string().max(100).optional().nullable(),
  compatible_vehicles: z.string().max(500).optional().nullable(),
  unit_of_measurement: z.string().min(1, 'Unit is required').max(50),
  purchase_cost: z.coerce.number().min(0, 'Cost must be 0 or more'),
  retail_price: z.coerce.number().min(0, 'Price must be 0 or more'),
  wholesale_price: z.coerce.number().min(0, 'Price must be 0 or more'),
  tax_rate_id: z.string().uuid().optional().nullable(),
  reorder_threshold: z.coerce.number().int().min(0).default(5),
  preferred_supplier_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
})

export type ProductFormData = z.infer<typeof productSchema>

// ─── Category / Brand ─────────────────────────────────────────────────────────

export const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  parent_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
})

export const brandSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  is_active: z.boolean().default(true),
})

// ─── Supplier ─────────────────────────────────────────────────────────────────

export const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required').max(255),
  contact_person: z.string().max(100).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  gstin: z.string().max(15).regex(/^[0-9A-Z]{15}$|^$/, 'Invalid GSTIN format').optional().nullable(),
  pan: z.string().max(10).regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$|^$/, 'Invalid PAN format').optional().nullable(),
  payment_terms: z.string().max(200).optional().nullable(),
  is_active: z.boolean().default(true),
})

export type SupplierFormData = z.infer<typeof supplierSchema>

// ─── Customer ─────────────────────────────────────────────────────────────────

export const customerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(255),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  billing_address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  gstin: z.string().max(15).regex(/^[0-9A-Z]{15}$|^$/, 'Invalid GSTIN format').optional().nullable(),
  customer_type: z.enum(['retail', 'wholesale', 'both']),
  credit_limit: z.coerce.number().min(0).optional().nullable(),
  payment_terms: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().default(true),
})

export type CustomerFormData = z.infer<typeof customerSchema>

// ─── Invoice / Billing ────────────────────────────────────────────────────────

export const invoiceItemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  product_name: z.string().min(1, 'Product name required'),
  product_sku: z.string().min(1),
  hsn_code: z.string().max(20).optional().nullable(),
  unit_of_measurement: z.string().min(1),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unit_price: z.coerce.number().min(0, 'Price must be 0 or more'),
  discount_percent: z.coerce.number().min(0).max(100).default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
})

export const invoiceSchema = z.object({
  invoice_type: z.enum(['retail', 'wholesale']),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name_snapshot: z.string().max(255).optional().nullable(),
  customer_phone_snapshot: z.string().max(20).optional().nullable(),
  customer_gstin_snapshot: z.string().max(15).optional().nullable(),
  customer_address_snapshot: z.string().max(500).optional().nullable(),
  billing_date: z.string().min(1, 'Billing date is required'),
  is_inter_state: z.boolean().default(false),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
})

export type InvoiceFormData = z.infer<typeof invoiceSchema>
export type InvoiceItemFormData = z.infer<typeof invoiceItemSchema>

// ─── Payment ──────────────────────────────────────────────────────────────────

export const paymentSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  invoice_id: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  payment_method: z.enum(['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other']),
  payment_date: z.string().min(1, 'Payment date is required'),
  reference_number: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

export type PaymentFormData = z.infer<typeof paymentSchema>

// ─── Purchase ─────────────────────────────────────────────────────────────────

export const purchaseItemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  product_name: z.string().min(1, 'Product name required'),
  product_sku: z.string().min(1),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unit_cost: z.coerce.number().min(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
})

export const purchaseSchema = z.object({
  supplier_id: z.string().uuid().optional().nullable(),
  purchase_date: z.string().min(1, 'Purchase date is required'),
  supplier_invoice_ref: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(purchaseItemSchema).min(1, 'At least one item is required'),
})

export type PurchaseFormData = z.infer<typeof purchaseSchema>

// ─── Stock Adjustment ─────────────────────────────────────────────────────────

export const stockAdjustmentSchema = z.object({
  product_id: z.string().uuid('Select a product'),
  quantity_change: z.coerce.number().int('Must be a whole number'),
  reason: z.string().min(1, 'Reason is required').max(500),
  notes: z.string().max(1000).optional().nullable(),
})

export type StockAdjustmentFormData = z.infer<typeof stockAdjustmentSchema>

// ─── Business Settings ────────────────────────────────────────────────────────

export const businessSettingsSchema = z.object({
  business_name: z.string().min(1, 'Business name is required').max(255),
  legal_name: z.string().max(255).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  pin_code: z.string().max(10).optional().nullable(),
  gstin: z.string().max(15).regex(/^[0-9A-Z]{15}$|^$/, 'Invalid GSTIN format').optional().nullable(),
  pan: z.string().max(10).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  website: z.string().max(255).optional().nullable(),
  invoice_prefix: z.string().min(1).max(10),
  gst_registered: z.boolean(),
  bank_name: z.string().max(100).optional().nullable(),
  bank_account_number: z.string().max(50).optional().nullable(),
  bank_ifsc: z.string().max(20).optional().nullable(),
  bank_branch: z.string().max(100).optional().nullable(),
  invoice_footer_note: z.string().max(500).optional().nullable(),
})

export type BusinessSettingsFormData = z.infer<typeof businessSettingsSchema>

// ─── Sale Return ──────────────────────────────────────────────────────────────

export const saleReturnSchema = z.object({
  invoice_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  return_date: z.string().min(1, 'Return date is required'),
  reason: z.string().min(1, 'Reason is required').max(500),
  notes: z.string().max(1000).optional().nullable(),
  refund_amount: z.coerce.number().min(0),
  refund_method: z.enum(['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other']).optional().nullable(),
  items: z.array(z.object({
    invoice_item_id: z.string().uuid().optional().nullable(),
    product_id: z.string().uuid().optional().nullable(),
    product_name: z.string().min(1),
    product_sku: z.string().min(1),
    quantity: z.coerce.number().positive(),
    unit_price: z.coerce.number().min(0),
    stock_condition: z.enum(['sellable', 'damaged', 'quarantined']),
    return_to_stock: z.boolean(),
  })).min(1, 'At least one return item is required'),
})

export type SaleReturnFormData = z.infer<typeof saleReturnSchema>

// ─── Tax Rate ─────────────────────────────────────────────────────────────────

export const taxRateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  rate: z.coerce.number().min(0).max(100),
  hsn_code: z.string().max(20).optional().nullable(),
  effective_from: z.string().min(1, 'Effective from date is required'),
  effective_to: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
})

export type TaxRateFormData = z.infer<typeof taxRateSchema>

// ─── User Management ──────────────────────────────────────────────────────────

export const inviteUserSchema = z.object({
  email: z.string().email('Valid email required'),
  full_name: z.string().min(1, 'Full name is required').max(100),
  role: z.enum(['owner', 'manager', 'sales_employee', 'inventory_employee']),
  phone: z.string().max(20).optional().nullable(),
})

export type InviteUserFormData = z.infer<typeof inviteUserSchema>
