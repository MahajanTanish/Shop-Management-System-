// src/features/sales/NewInvoicePage.tsx
import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, roundMoney, calculateGST } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import {
  ArrowLeft, Search, Plus, Trash2, AlertCircle, Loader2, X, Check,
} from 'lucide-react'
import type { Customer, Product, PaymentMethod } from '@/types/database'
import { format } from 'date-fns'

interface LineItem {
  tempId: string
  product_id: string | null
  product_name: string
  product_sku: string
  hsn_code: string | null
  unit_of_measurement: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_rate: number
}

function computeLineTotals(line: LineItem, isInterState: boolean) {
  const gross = roundMoney(line.quantity * line.unit_price)
  const discountAmt = roundMoney(gross * (line.discount_percent / 100))
  const taxable = roundMoney(gross - discountAmt)
  const gst = calculateGST(taxable, line.tax_rate, isInterState)
  return {
    gross,
    discountAmt,
    taxable,
    ...gst,
    lineTotal: gst.total,
  }
}

export default function NewInvoicePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const today = format(new Date(), 'yyyy-MM-dd')

  const [invoiceType, setInvoiceType] = useState<'retail' | 'wholesale'>('retail')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isWalkIn, setIsWalkIn] = useState(false)
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [isInterState, setIsInterState] = useState(false)
  const [billingDate, setBillingDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingAction, setPendingAction] = useState<'draft' | 'finalize' | null>(null)
  const [stockErrors, setStockErrors] = useState<string[]>([])
  const [formError, setFormError] = useState('')

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let subtotal = 0
    let totalDiscount = 0
    let taxableAmount = 0
    let totalCGST = 0
    let totalSGST = 0
    let totalIGST = 0
    let totalTax = 0
    let grandTotal = 0

    for (const item of items) {
      const t = computeLineTotals(item, isInterState)
      subtotal += t.gross
      totalDiscount += t.discountAmt
      taxableAmount += t.taxable
      totalCGST += t.cgst
      totalSGST += t.sgst
      totalIGST += t.igst
      totalTax += t.totalTax
      grandTotal += t.lineTotal
    }

    return {
      subtotal: roundMoney(subtotal),
      totalDiscount: roundMoney(totalDiscount),
      taxableAmount: roundMoney(taxableAmount),
      totalCGST: roundMoney(totalCGST),
      totalSGST: roundMoney(totalSGST),
      totalIGST: roundMoney(totalIGST),
      totalTax: roundMoney(totalTax),
      grandTotal: roundMoney(grandTotal),
      outstanding: roundMoney(Math.max(0, roundMoney(grandTotal) - paymentAmount)),
    }
  }, [items, isInterState, paymentAmount])

  // ── Customer search ───────────────────────────────────────────────────────────
  const searchCustomers = async (term: string) => {
    setCustomerSearch(term)
    if (term.length < 2) { setCustomerResults([]); return }
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(8)
    setCustomerResults((data as Customer[]) ?? [])
  }

  // ── Product search ────────────────────────────────────────────────────────────
  const searchProducts = async (term: string) => {
    setProductSearch(term)
    if (term.length < 2) { setProductResults([]); return }
    const { data } = await supabase
      .from('products')
      .select('*, tax_rate:tax_rates(rate)')
      .eq('is_active', true)
      .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
      .limit(10)
    setProductResults((data as Product[]) ?? [])
  }

  const addProduct = (p: Product) => {
    const taxRate = (p.tax_rate as any)?.rate ?? 0
    const unitPrice = invoiceType === 'wholesale' ? p.wholesale_price : p.retail_price
    setItems((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        product_id: p.id,
        product_name: p.name,
        product_sku: p.sku,
        hsn_code: (p.tax_rate as any)?.hsn_code ?? null,
        unit_of_measurement: p.unit_of_measurement,
        quantity: 1,
        unit_price: unitPrice,
        discount_percent: 0,
        tax_rate: taxRate,
      },
    ])
    setProductSearch('')
    setProductResults([])
  }

  const updateItem = (tempId: string, field: keyof LineItem, value: string | number) => {
    setItems((prev) => prev.map((it) => it.tempId === tempId ? { ...it, [field]: value } : it))
  }

  const removeItem = (tempId: string) => setItems((prev) => prev.filter((it) => it.tempId !== tempId))

  // ── Save/Finalize ────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ action }: { action: 'draft' | 'finalize' }) => {
      if (items.length === 0) throw new Error('Add at least one item')

      const customerNameSnapshot = selectedCustomer?.name ?? (isWalkIn ? walkInName : null)
      const customerPhoneSnapshot = selectedCustomer?.phone ?? (isWalkIn ? walkInPhone : null)

      // Stock check for finalize
      if (action === 'finalize') {
        const errors: string[] = []
        for (const item of items) {
          if (!item.product_id) continue
          const { data: sb } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', item.product_id)
            .single()
          const available = sb?.quantity ?? 0
          if (available < item.quantity) {
            errors.push(`${item.product_name}: need ${item.quantity}, have ${available}`)
          }
        }
        if (errors.length > 0) {
          setStockErrors(errors)
          throw new Error('Insufficient stock')
        }
      }

      // Fetch business settings for invoice number
      const { data: biz } = await supabase
        .from('business_settings')
        .select('id, invoice_prefix, invoice_counter')
        .single()

      const prefix = biz?.invoice_prefix ?? 'INV'
      const counter = (biz?.invoice_counter ?? 0) + 1
      const invoiceNumber = `${prefix}-${String(counter).padStart(5, '0')}`

      const status = action === 'finalize' ? 'finalized' : 'draft'

      // Insert invoice
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          invoice_type: invoiceType,
          status,
          customer_id: selectedCustomer?.id ?? null,
          customer_name_snapshot: customerNameSnapshot,
          customer_phone_snapshot: customerPhoneSnapshot,
          customer_gstin_snapshot: selectedCustomer?.gstin ?? null,
          customer_address_snapshot: selectedCustomer?.billing_address ?? null,
          billing_date: billingDate,
          is_inter_state: isInterState,
          subtotal: totals.subtotal,
          total_discount: totals.totalDiscount,
          taxable_amount: totals.taxableAmount,
          total_cgst: totals.totalCGST,
          total_sgst: totals.totalSGST,
          total_igst: totals.totalIGST,
          total_tax: totals.totalTax,
          grand_total: totals.grandTotal,
          amount_paid: action === 'finalize' ? paymentAmount : 0,
          outstanding_amount: action === 'finalize' ? totals.outstanding : totals.grandTotal,
          notes: notes || null,
          created_by: user?.id ?? null,
          finalized_by: action === 'finalize' ? user?.id ?? null : null,
          finalized_at: action === 'finalize' ? new Date().toISOString() : null,
        })
        .select()
        .single()
      if (invErr) throw invErr

      // Insert invoice items
      const itemInserts = items.map((item, idx) => {
        const t = computeLineTotals(item, isInterState)
        return {
          invoice_id: inv.id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          hsn_code: item.hsn_code,
          unit_of_measurement: item.unit_of_measurement,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent,
          discount_amount: t.discountAmt,
          taxable_amount: t.taxable,
          tax_rate: item.tax_rate,
          cgst_rate: isInterState ? 0 : item.tax_rate / 2,
          sgst_rate: isInterState ? 0 : item.tax_rate / 2,
          igst_rate: isInterState ? item.tax_rate : 0,
          cgst_amount: t.cgst,
          sgst_amount: t.sgst,
          igst_amount: t.igst,
          total_tax: t.totalTax,
          line_total: t.lineTotal,
          sort_order: idx,
        }
      })
      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemInserts)
      if (itemsErr) throw itemsErr

      if (action === 'finalize') {
        // Update stock for each item
        for (const item of items) {
          if (!item.product_id) continue
          const { data: sb } = await supabase
            .from('stock_balances')
            .select('id, quantity')
            .eq('product_id', item.product_id)
            .single()
          if (!sb) continue
          const newQty = sb.quantity - item.quantity
          await supabase.from('stock_balances').update({ quantity: newQty, last_updated: new Date().toISOString() }).eq('id', sb.id)
          await supabase.from('stock_movements').insert({
            product_id: item.product_id,
            movement_type: 'sale',
            quantity_change: -item.quantity,
            quantity_before: sb.quantity,
            quantity_after: newQty,
            reference_type: 'invoice',
            reference_id: inv.id,
            reason: `Sale - ${invoiceNumber}`,
            actor_id: user?.id ?? null,
          })
        }

        // Insert payment if any
        if (paymentAmount > 0) {
          await supabase.from('payments').insert({
            customer_id: selectedCustomer?.id ?? null,
            invoice_id: inv.id,
            amount: paymentAmount,
            payment_method: paymentMethod,
            payment_date: billingDate,
            created_by: user?.id ?? null,
          })
        }

        // Update customer outstanding
        if (selectedCustomer?.id) {
          const { data: cust } = await supabase
            .from('customers')
            .select('outstanding_balance')
            .eq('id', selectedCustomer.id)
            .single()
          if (cust) {
            await supabase.from('customers').update({
              outstanding_balance: roundMoney((cust.outstanding_balance ?? 0) + totals.outstanding),
            }).eq('id', selectedCustomer.id)
          }
        }

        // Increment invoice counter
        await supabase.from('business_settings').update({ invoice_counter: counter }).eq('id', biz!.id)
      }

      return inv.id
    },
    onSuccess: (newId) => {
      navigate(`/sales/${newId}`)
    },
    onError: (err: Error) => {
      if (err.message !== 'Insufficient stock') setFormError(err.message)
    },
  })

  const handleAction = (action: 'draft' | 'finalize') => {
    setStockErrors([])
    setFormError('')
    setPendingAction(action)
    setShowConfirm(true)
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/sales" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Invoice</h1>
        </div>
        <div className="ml-auto flex gap-1 p-1 bg-gray-100 rounded-lg">
          {(['retail', 'wholesale'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setInvoiceType(t)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
                invoiceType === t ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h2 className="font-semibold text-gray-800">Customer</h2>
        <div className="flex gap-3 items-center">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isWalkIn} onChange={(e) => { setIsWalkIn(e.target.checked); setSelectedCustomer(null); setCustomerSearch('') }}
              className="rounded" />
            Walk-in customer
          </label>
        </div>

        {isWalkIn ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" placeholder="Walk-in name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" placeholder="Walk-in phone (optional)" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search customer by name or phone..."
              value={customerSearch}
              onChange={(e) => searchCustomers(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {customerResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {customerResults.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setSelectedCustomer(c); setCustomerSearch(c.name); setCustomerResults([]) }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm">
                    <span className="font-medium">{c.name}</span>
                    {c.phone && <span className="text-gray-400 ml-2">{c.phone}</span>}
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${c.customer_type === 'wholesale' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {c.customer_type}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedCustomer && (
              <div className="flex items-center gap-2 mt-2 text-sm text-green-700">
                <Check className="w-4 h-4" />
                <span>Selected: <strong>{selectedCustomer.name}</strong></span>
                {selectedCustomer.outstanding_balance > 0 && (
                  <span className="text-red-600 font-medium">(Outstanding: {formatCurrency(selectedCustomer.outstanding_balance)})</span>
                )}
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }} className="ml-auto text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isInterState} onChange={(e) => setIsInterState(e.target.checked)} className="rounded" />
            Inter-state (IGST)
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Billing Date:</label>
            <input type="date" value={billingDate} onChange={(e) => setBillingDate(e.target.value)}
              className="px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h2 className="font-semibold text-gray-800">Items</h2>

        {/* Product search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search and add products..."
            value={productSearch}
            onChange={(e) => searchProducts(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {productResults.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {productResults.map((p) => (
                <button key={p.id} type="button" onClick={() => addProduct(p)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-gray-400 ml-2 text-xs">{p.sku}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-700">{formatCurrency(invoiceType === 'wholesale' ? p.wholesale_price : p.retail_price)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Items table */}
        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Product</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Qty</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Unit Price</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Disc%</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 hidden md:table-cell">Tax%</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Line Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const t = computeLineTotals(item, isInterState)
                  return (
                    <tr key={item.tempId}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{item.product_name}</p>
                        <p className="text-xs text-gray-400">{item.product_sku}</p>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.tempId, 'quantity', Number(e.target.value))}
                          className="w-16 text-right px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateItem(item.tempId, 'unit_price', Number(e.target.value))}
                          className="w-24 text-right px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discount_percent}
                          onChange={(e) => updateItem(item.tempId, 'discount_percent', Number(e.target.value))}
                          className="w-16 text-right px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 hidden md:table-cell">{item.tax_rate}%</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(t.lineTotal)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeItem(item.tempId)} className="p-1 text-gray-400 hover:text-red-600 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-200 rounded-lg py-8 text-center">
            <Plus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Search for products above to add line items</p>
          </div>
        )}
      </div>

      {/* Totals + Payment */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Notes */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes for this invoice..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other'] as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Totals */}
            <div className="md:w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="text-gray-900">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Discount</span>
                <span className="text-red-600">-{formatCurrency(totals.totalDiscount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Taxable Amount</span>
                <span className="text-gray-900">{formatCurrency(totals.taxableAmount)}</span>
              </div>
              {isInterState ? (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">IGST</span>
                  <span className="text-gray-900">{formatCurrency(totals.totalIGST)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">CGST</span>
                    <span className="text-gray-900">{formatCurrency(totals.totalCGST)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">SGST</span>
                    <span className="text-gray-900">{formatCurrency(totals.totalSGST)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
                <span>Grand Total</span>
                <span>{formatCurrency(totals.grandTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-2">
                <label className="text-gray-600">Amount Paid</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-32 text-right px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className={`font-semibold ${totals.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>Outstanding</span>
                <span className={`font-semibold ${totals.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(totals.outstanding)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {(formError || stockErrors.length > 0) && (
        <div className="flex items-start gap-2 p-4 bg-red-50 rounded-xl border border-red-200 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            {formError && <p className="text-sm">{formError}</p>}
            {stockErrors.length > 0 && (
              <>
                <p className="text-sm font-medium">Insufficient stock:</p>
                <ul className="list-disc list-inside text-xs mt-1">
                  {stockErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Link to="/sales" className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700">
          Cancel
        </Link>
        <button
          onClick={() => handleAction('draft')}
          disabled={items.length === 0 || saveMutation.isPending}
          className="px-4 py-2 text-sm border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-medium disabled:opacity-50"
        >
          Save as Draft
        </button>
        <button
          onClick={() => handleAction('finalize')}
          disabled={items.length === 0 || saveMutation.isPending}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Finalize & Print
        </button>
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">
              {pendingAction === 'finalize' ? 'Finalize Invoice?' : 'Save as Draft?'}
            </h2>
            <p className="text-sm text-gray-600">
              {pendingAction === 'finalize'
                ? `This will create a finalized invoice for ${formatCurrency(totals.grandTotal)} and update stock levels. This action cannot be undone.`
                : 'The invoice will be saved as a draft and can be edited later.'}
            </p>
            <div className="space-y-1 text-sm bg-gray-50 rounded-lg p-3">
              <div className="flex justify-between"><span className="text-gray-500">Items</span><span>{items.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Grand Total</span><span className="font-medium">{formatCurrency(totals.grandTotal)}</span></div>
              {pendingAction === 'finalize' && (
                <>
                  <div className="flex justify-between"><span className="text-gray-500">Amount Paid</span><span>{formatCurrency(paymentAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Outstanding</span><span className={totals.outstanding > 0 ? 'text-red-600' : 'text-green-600'}>{formatCurrency(totals.outstanding)}</span></div>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={() => { setShowConfirm(false); saveMutation.mutate({ action: pendingAction! }) }}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
