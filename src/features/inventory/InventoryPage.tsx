// src/features/inventory/InventoryPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatDate, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { stockAdjustmentSchema, type StockAdjustmentFormData } from '@/schemas'
import {
  Search, Plus, AlertCircle, Loader2, ChevronLeft, ChevronRight,
  Package, X, Check,
} from 'lucide-react'
import type { Product, StockMovement } from '@/types/database'

type StatusFilter = 'all' | 'low_stock' | 'out_of_stock'
type TabType = 'stock' | 'movements'

interface StockRow {
  id: string
  quantity: number
  last_updated: string
  product: Product & { category?: { name: string } | null }
}

const PAGE_SIZE = 20

function StockBadge({ qty, threshold }: { qty: number; threshold: number }) {
  if (qty === 0) return <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">Out</span>
  if (qty <= threshold) return <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Low</span>
  return <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">OK</span>
}

export default function InventoryPage() {
  const { user, canManageProducts } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabType>('stock')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [movPage, setMovPage] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingData, setPendingData] = useState<StockAdjustmentFormData | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm<any>({
    resolver: zodResolver(stockAdjustmentSchema) as any,
  })

  // Stock table query
  const { data: stockData, isLoading: loadingStock, error: stockError } = useQuery({
    queryKey: ['inventory-stock', search, statusFilter, page],
    queryFn: async () => {
      let q = supabase
        .from('stock_balances')
        .select(`
          id, quantity, last_updated,
          product:products!inner(
            id, name, sku, reorder_threshold, is_active,
            category:categories(name)
          )
        `, { count: 'exact' })
        .eq('product.is_active', true)
        .order('quantity', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (search) {
        q = q.or(`product.name.ilike.%${search}%,product.sku.ilike.%${search}%`)
      }

      const { data, error, count } = await q
      if (error) throw error

      let rows = data as unknown as StockRow[]
      if (statusFilter === 'out_of_stock') rows = rows.filter((r) => r.quantity === 0)
      if (statusFilter === 'low_stock') rows = rows.filter((r) => r.quantity > 0 && r.quantity <= r.product.reorder_threshold)

      return { rows, total: count ?? 0 }
    },
    enabled: tab === 'stock',
  })

  // Movements query
  const { data: movData, isLoading: loadingMov, error: movError } = useQuery({
    queryKey: ['inventory-movements', movPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('stock_movements')
        .select(`
          id, movement_type, quantity_change, reason, notes, created_at, actor_id,
          product:products(name, sku)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(movPage * PAGE_SIZE, (movPage + 1) * PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data as unknown as (StockMovement & { product: { name: string; sku: string } | null })[]) || [], total: count ?? 0 }
    },
    enabled: tab === 'movements',
  })

  const adjustMutation = useMutation({
    mutationFn: async (form: StockAdjustmentFormData) => {
      // Fetch current balance
      const { data: sb, error: sbErr } = await supabase
        .from('stock_balances')
        .select('id, quantity')
        .eq('product_id', form.product_id)
        .single()
      if (sbErr) throw sbErr

      const quantityBefore = sb.quantity
      const quantityAfter = quantityBefore + form.quantity_change

      // Insert movement
      const { error: movErr } = await supabase.from('stock_movements').insert({
        product_id: form.product_id,
        movement_type: 'stock_adjustment',
        quantity_change: form.quantity_change,
        quantity_before: quantityBefore,
        quantity_after: quantityAfter,
        reason: form.reason,
        notes: form.notes ?? null,
        actor_id: user?.id ?? null,
        reference_type: 'adjustment',
        reference_id: null,
      })
      if (movErr) throw movErr

      // Update balance
      const { error: updateErr } = await supabase
        .from('stock_balances')
        .update({ quantity: quantityAfter, last_updated: new Date().toISOString() })
        .eq('id', sb.id)
      if (updateErr) throw updateErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-stock'] })
      qc.invalidateQueries({ queryKey: ['inventory-movements'] })
      setShowModal(false)
      setShowConfirm(false)
      setPendingData(null)
      setSelectedProduct(null)
      setProductSearch('')
      setProductResults([])
      reset()
    },
  })

  const searchProducts = async (term: string) => {
    setProductSearch(term)
    if (term.length < 2) { setProductResults([]); return }
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, reorder_threshold')
      .eq('is_active', true)
      .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
      .limit(10)
    setProductResults((data as Product[]) ?? [])
  }

  const onSubmit = (data: StockAdjustmentFormData) => {
    setPendingData(data)
    setShowConfirm(true)
  }

  const stockTotal = stockData?.total ?? 0
  const stockTotalPages = Math.ceil(stockTotal / PAGE_SIZE)
  const movTotal = movData?.total ?? 0
  const movTotalPages = Math.ceil(movTotal / PAGE_SIZE)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">Monitor stock levels and track movements</p>
        </div>
        {canManageProducts && (
          <button
            onClick={() => setShowModal(true)}
            className="sm:ml-auto flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Stock Adjustment
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['stock', 'movements'] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'stock' ? 'Stock Levels' : 'Stock Movements'}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or SKU..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(0) }}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
          </div>

          {/* Stock Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loadingStock ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : stockError ? (
              <div className="flex items-center gap-2 p-6 text-red-600"><AlertCircle className="w-5 h-5" /><p className="text-sm">Failed to load inventory data.</p></div>
            ) : !stockData?.rows.length ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Package className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No products found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">SKU</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Category</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600">Current Stock</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Reorder At</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stockData.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{row.product.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500 hidden sm:table-cell">{row.product.sku}</td>
                          <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{(row.product.category as any)?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{row.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">{row.product.reorder_threshold}</td>
                          <td className="px-4 py-3 text-center">
                            <StockBadge qty={row.quantity} threshold={row.product.reorder_threshold} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <p className="text-sm text-gray-500">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, stockTotal)} of {stockTotal}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-600">{page + 1} / {stockTotalPages}</span>
                    <button onClick={() => setPage((p) => Math.min(stockTotalPages - 1, p + 1))} disabled={page >= stockTotalPages - 1} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tab === 'movements' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loadingMov ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
          ) : movError ? (
            <div className="flex items-center gap-2 p-6 text-red-600"><AlertCircle className="w-5 h-5" /><p className="text-sm">Failed to load movements.</p></div>
          ) : !movData?.rows.length ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-gray-500">No stock movements recorded</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Type</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Qty Change</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Reason</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {movData.rows.map((mov) => (
                      <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{mov.product?.name ?? '—'}</p>
                          <p className="text-xs text-gray-400">{mov.product?.sku}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                            {mov.movement_type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${mov.quantity_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {mov.quantity_change >= 0 ? '+' : ''}{mov.quantity_change}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{mov.reason ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{formatDateTime(mov.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-500">
                  Showing {movPage * PAGE_SIZE + 1}–{Math.min((movPage + 1) * PAGE_SIZE, movTotal)} of {movTotal}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setMovPage((p) => Math.max(0, p - 1))} disabled={movPage === 0} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600">{movPage + 1} / {movTotalPages}</span>
                  <button onClick={() => setMovPage((p) => Math.min(movTotalPages - 1, p + 1))} disabled={movPage >= movTotalPages - 1} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Stock Adjustment</h2>
              <button onClick={() => { setShowModal(false); reset(); setSelectedProduct(null); setProductResults([]); setProductSearch('') }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              {/* Product Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
                <input
                  type="text"
                  placeholder="Search product by name or SKU..."
                  value={productSearch}
                  onChange={(e) => searchProducts(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {productResults.length > 0 && (
                  <div className="border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto shadow-sm">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProduct(p)
                          setValue('product_id', p.id)
                          setProductSearch(p.name)
                          setProductResults([])
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="text-gray-400 ml-2">{p.sku}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedProduct && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Selected: {selectedProduct.name}
                  </p>
                )}
                {errors.product_id?.message && <p className="text-xs text-red-600 mt-1">{String(errors.product_id.message)}</p>}
                <input type="hidden" {...register('product_id')} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Change *</label>
                <input
                  type="number"
                  placeholder="e.g. +10 or -5"
                  {...register('quantity_change')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-0.5">Positive = add stock. Negative = remove stock.</p>
                {errors.quantity_change?.message && <p className="text-xs text-red-600 mt-1">{String(errors.quantity_change.message)}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <input
                  type="text"
                  placeholder="e.g. Damaged goods, Stock count correction"
                  {...register('reason')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.reason?.message && <p className="text-xs text-red-600 mt-1">{String(errors.reason.message)}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional notes..."
                  {...register('notes')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {adjustMutation.error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-xs">{(adjustMutation.error as Error).message}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); reset(); setSelectedProduct(null); setProductResults([]); setProductSearch('') }}
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Review & Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {showConfirm && pendingData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Confirm Adjustment</h2>
            <p className="text-sm text-gray-600">
              Are you sure you want to adjust stock for <strong>{selectedProduct?.name}</strong> by{' '}
              <strong className={pendingData.quantity_change >= 0 ? 'text-green-600' : 'text-red-600'}>
                {pendingData.quantity_change >= 0 ? '+' : ''}{pendingData.quantity_change}
              </strong>?
            </p>
            <p className="text-xs text-gray-500">Reason: {pendingData.reason}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={() => adjustMutation.mutate(pendingData)}
                disabled={adjustMutation.isPending}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {adjustMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
