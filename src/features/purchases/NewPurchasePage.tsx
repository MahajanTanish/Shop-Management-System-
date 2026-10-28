import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, roundMoney, calculateGST } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import type { Supplier, Product } from '@/types/database'
import {
  ArrowLeft, Plus, Trash2, Search, TruckIcon, Save,
  CheckCircle, Loader2, AlertCircle
} from 'lucide-react'

interface PurchaseLineItem {
  product_id: string
  product_name: string
  product_sku: string
  quantity: number
  unit_cost: number
  tax_rate: number
  tax_amount: number
  line_total: number
}

export default function NewPurchasePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [supplierId, setSupplierId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0] || '')
  const [supplierInvoiceRef, setSupplierInvoiceRef] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<PurchaseLineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Fetch active suppliers
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'active'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('*').eq('is_active', true).order('name')
      return (data || []) as Supplier[]
    },
  })

  // Search products for item addition
  const { data: searchResults } = useQuery({
    queryKey: ['products-search-purchase', productSearch],
    queryFn: async () => {
      if (!productSearch.trim()) return []
      const { data } = await supabase
        .from('products')
        .select(`*, tax_rate:tax_rates(rate)`)
        .or(`name.ilike.%${productSearch}%,sku.ilike.%${productSearch}%,barcode.ilike.%${productSearch}%`)
        .eq('is_active', true)
        .limit(8)
      return (data || []) as (Product & { tax_rate?: { rate: number } })[]
    },
    enabled: productSearch.trim().length > 1,
  })

  const addItem = (prod: Product & { tax_rate?: { rate: number } }) => {
    // Check if already in items
    const existing = items.find(i => i.product_id === prod.id)
    if (existing) {
      updateItem(prod.id, 'quantity', existing.quantity + 1)
      setProductSearch('')
      return
    }

    const unitCost = Number(prod.purchase_cost) || 0
    const taxRate = Number(prod.tax_rate?.rate) || 0
    const taxable = roundMoney(1 * unitCost)
    const taxAmt = roundMoney((taxable * taxRate) / 100)
    const total = roundMoney(taxable + taxAmt)

    const newItem: PurchaseLineItem = {
      product_id: prod.id,
      product_name: prod.name,
      product_sku: prod.sku,
      quantity: 1,
      unit_cost: unitCost,
      tax_rate: taxRate,
      tax_amount: taxAmt,
      line_total: total,
    }

    setItems([...items, newItem])
    setProductSearch('')
  }

  const updateItem = (productId: string, field: 'quantity' | 'unit_cost' | 'tax_rate', val: number) => {
    setItems(items.map(item => {
      if (item.product_id !== productId) return item
      const updated = { ...item, [field]: val }
      const taxable = roundMoney(updated.quantity * updated.unit_cost)
      const taxAmt = roundMoney((taxable * updated.tax_rate) / 100)
      const total = roundMoney(taxable + taxAmt)
      return { ...updated, tax_amount: taxAmt, line_total: total }
    }))
  }

  const removeItem = (productId: string) => {
    setItems(items.filter(i => i.product_id !== productId))
  }

  // Calculate totals
  const subtotal = roundMoney(items.reduce((sum, i) => sum + (i.quantity * i.unit_cost), 0))
  const totalTax = roundMoney(items.reduce((sum, i) => sum + i.tax_amount, 0))
  const grandTotal = roundMoney(subtotal + totalTax)

  // Save purchase mutation
  const savePurchaseMutation = useMutation({
    mutationFn: async ({ shouldReceive }: { shouldReceive: boolean }) => {
      if (!items.length) throw new Error('Add at least one item to the purchase')

      const selectedSupplier = suppliers?.find(s => s.id === supplierId)

      // 1. Get purchase number
      const { data: numData } = await supabase.rpc('get_next_purchase_number')
      const purchaseNumber = numData || `PO-${Date.now().toString().slice(-5)}`

      // 2. Insert purchase header
      const { data: purchase, error: pErr } = await supabase.from('purchases').insert({
        purchase_number: purchaseNumber,
        supplier_id: supplierId || null,
        supplier_name_snapshot: selectedSupplier?.name || 'Unspecified Supplier',
        status: shouldReceive ? 'received' : 'draft',
        purchase_date: purchaseDate,
        supplier_invoice_ref: supplierInvoiceRef || null,
        subtotal,
        total_tax: totalTax,
        grand_total: grandTotal,
        amount_paid: 0,
        outstanding_amount: grandTotal,
        notes: notes || null,
        received_at: shouldReceive ? new Date().toISOString() : null,
        created_by: user?.id,
      }).select('id').single()

      if (pErr) throw pErr

      // 3. Insert purchase line items
      const itemRows = items.map(item => ({
        purchase_id: purchase.id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        tax_rate: item.tax_rate,
        tax_amount: item.tax_amount,
        line_total: item.line_total,
        received_quantity: shouldReceive ? item.quantity : 0,
      }))

      const { error: piErr } = await supabase.from('purchase_items').insert(itemRows)
      if (piErr) throw piErr

      // 4. If immediately received, increment stock balances and write stock movements
      if (shouldReceive) {
        for (const item of items) {
          const { data: sb } = await supabase.from('stock_balances').select('quantity').eq('product_id', item.product_id).single()
          const curr = Number(sb?.quantity ?? 0)
          const nxt = curr + item.quantity

          await supabase.from('stock_balances').update({
            quantity: nxt,
            last_updated: new Date().toISOString(),
          }).eq('product_id', item.product_id)

          await supabase.from('stock_movements').insert({
            product_id: item.product_id,
            movement_type: 'purchase_receipt',
            quantity_change: item.quantity,
            quantity_before: curr,
            quantity_after: nxt,
            reference_type: 'purchase',
            reference_id: purchase.id,
            reason: `Purchase receipt ${purchaseNumber}`,
            actor_id: user?.id,
          })

          // Update product purchase cost with latest cost
          await supabase.from('products').update({
            purchase_cost: item.unit_cost,
            updated_at: new Date().toISOString(),
          }).eq('id', item.product_id)
        }
      }

      // 5. Update supplier balance if supplier provided
      if (supplierId && grandTotal > 0) {
        const { data: sup } = await supabase.from('suppliers').select('outstanding_balance').eq('id', supplierId).single()
        if (sup) {
          await supabase.from('suppliers').update({
            outstanding_balance: Number(sup.outstanding_balance) + grandTotal,
            updated_at: new Date().toISOString(),
          }).eq('id', supplierId)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['stock-balances'] })
      navigate('/purchases')
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/purchases')} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to Purchases
        </button>
        <h1 className="text-xl font-bold text-gray-900">New Purchase & Stock Intake</h1>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Supplier & Bill Details Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 shadow-sm">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Supplier & Invoice Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Select Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select Registered Supplier —</option>
              {suppliers?.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.city || 'Vendor'})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Supplier Bill / Invoice Ref</label>
            <input
              type="text"
              placeholder="e.g. MINDA/2026/0491"
              value={supplierInvoiceRef}
              onChange={(e) => setSupplierInvoiceRef(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Purchase Date</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Line Items Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 shadow-sm">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Purchase Items</h2>

        {/* Product Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Type part name, SKU, or barcode to add item..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />

          {/* Search Dropdown */}
          {searchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto divide-y">
              {searchResults.map(p => (
                <div
                  key={p.id}
                  onClick={() => addItem(p)}
                  className="p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition"
                >
                  <div>
                    <p className="font-medium text-sm text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{p.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-gray-700">Cost: {formatCurrency(p.purchase_cost)}</p>
                    <span className="text-[10px] text-blue-600 font-medium">+ Add Line</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Items Table */}
        {!items.length ? (
          <div className="text-center py-8 text-gray-400 text-xs">
            Search and add spare parts to this purchase order above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3 w-24">Qty</th>
                  <th className="py-2.5 px-3 w-32">Unit Cost (₹)</th>
                  <th className="py-2.5 px-3 w-28">GST %</th>
                  <th className="py-2.5 px-3 text-right">Tax (₹)</th>
                  <th className="py-2.5 px-3 text-right">Total (₹)</th>
                  <th className="py-2.5 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(item => (
                  <tr key={item.product_id}>
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-gray-900">{item.product_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{item.product_sku}</p>
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.product_id, 'quantity', Math.max(1, Number(e.target.value)))}
                        className="w-20 px-2 py-1 border rounded text-sm text-center"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(item.product_id, 'unit_cost', Math.max(0, Number(e.target.value)))}
                        className="w-28 px-2 py-1 border rounded text-sm text-right"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={item.tax_rate}
                        onChange={(e) => updateItem(item.product_id, 'tax_rate', Number(e.target.value))}
                        className="w-24 px-2 py-1 border rounded text-xs"
                      >
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs text-gray-600">
                      {formatCurrency(item.tax_amount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-gray-900">
                      {formatCurrency(item.line_total)}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <button
                        onClick={() => removeItem(item.product_id)}
                        className="text-gray-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals Summary */}
        {items.length > 0 && (
          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="w-full sm:w-1/2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Purchase Notes</label>
              <textarea
                rows={2}
                placeholder="Optional supplier delivery notes or freight details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-xs"
              />
            </div>

            <div className="w-full sm:w-64 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Total GST:</span>
                <span>{formatCurrency(totalTax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t">
                <span>Grand Total:</span>
                <span className="text-blue-600">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pb-8">
        <button
          type="button"
          onClick={() => navigate('/purchases')}
          className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={savePurchaseMutation.isPending || !items.length}
          onClick={() => savePurchaseMutation.mutate({ shouldReceive: false })}
          className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
        >
          Save as Draft PO
        </button>
        <button
          type="button"
          disabled={savePurchaseMutation.isPending || !items.length}
          onClick={() => savePurchaseMutation.mutate({ shouldReceive: true })}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shadow-sm"
        >
          {savePurchaseMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          Receive & Add to Stock
        </button>
      </div>
    </div>
  )
}
