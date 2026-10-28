import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Product } from '@/types/database'
import {
  Plus, Search, Filter, Package, Edit, Archive, ArchiveRestore,
  Download, Upload, AlertCircle, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import ProductImportModal from './ProductImportModal'

const PAGE_SIZE = 20

interface ProductsFilter {
  search: string
  category_id: string
  brand_id: string
  status: 'all' | 'active' | 'inactive' | 'low_stock' | 'out_of_stock'
}

export default function ProductsPage() {
  const { canManageProducts } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [showImportModal, setShowImportModal] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [filters, setFilters] = useState<ProductsFilter>({
    search: '',
    category_id: '',
    brand_id: '',
    status: 'active',
  })

  const handleExport = async () => {
    try {
      setIsExporting(true)
      let q = supabase
        .from('products')
        .select(`
          sku,
          name,
          description,
          category:categories(name),
          brand:brands(name),
          manufacturer_part_number,
          barcode,
          compatible_vehicles,
          unit_of_measurement,
          purchase_cost,
          retail_price,
          wholesale_price,
          reorder_threshold,
          is_active,
          tax_rate:tax_rates(rate),
          stock:stock_balances(quantity)
        `)
        .order('name')

      if (filters.search) {
        q = q.or(
          `name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%,manufacturer_part_number.ilike.%${filters.search}%`
        )
      }
      if (filters.category_id) q = q.eq('category_id', filters.category_id)
      if (filters.brand_id) q = q.eq('brand_id', filters.brand_id)
      if (filters.status === 'active') q = q.eq('is_active', true)
      if (filters.status === 'inactive') q = q.eq('is_active', false)

      const { data: exportItems, error: exportErr } = await q
      if (exportErr) throw exportErr

      if (!exportItems || exportItems.length === 0) {
        alert('No products found matching the criteria to export.')
        return
      }

      const rows = exportItems.map((p: any) => ({
        'SKU': p.sku,
        'Product Name': p.name,
        'Description': p.description || '',
        'Category': p.category?.name || '',
        'Brand': p.brand?.name || '',
        'Manufacturer Part Number': p.manufacturer_part_number || '',
        'Barcode': p.barcode || '',
        'Compatible Vehicles': p.compatible_vehicles || '',
        'Unit of Measurement': p.unit_of_measurement || 'piece',
        'Purchase Cost': p.purchase_cost,
        'Retail Price': p.retail_price,
        'Wholesale Price': p.wholesale_price,
        'Tax Rate (%)': p.tax_rate?.rate ?? '',
        'Current Stock': p.stock?.[0]?.quantity ?? 0,
        'Reorder Threshold': p.reorder_threshold,
        'Status': p.is_active ? 'Active' : 'Archived',
      }))

      const csv = Papa.unparse(rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const today = new Date().toISOString().split('T')[0]
      a.download = `products-catalogue-${today}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('Export failed: ' + (err.message || 'Unknown error'))
    } finally {
      setIsExporting(false)
    }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['products', page, filters],
    queryFn: async () => {
      let q = supabase
        .from('products')
        .select(`
          *,
          brand:brands(id, name),
          category:categories(id, name),
          tax_rate:tax_rates(id, name, rate),
          stock:stock_balances(quantity)
        `, { count: 'exact' })
        .order('name')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (filters.search) {
        q = q.or(`name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%,manufacturer_part_number.ilike.%${filters.search}%`)
      }
      if (filters.category_id) q = q.eq('category_id', filters.category_id)
      if (filters.brand_id) q = q.eq('brand_id', filters.brand_id)
      if (filters.status === 'active') q = q.eq('is_active', true)
      if (filters.status === 'inactive') q = q.eq('is_active', false)

      const { data, error, count } = await q
      if (error) throw error
      return { items: data as (Product & { stock: { quantity: number }[] | null })[], total: count ?? 0 }
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const getStockQty = (product: Product & { stock?: { quantity: number }[] | null }) => {
    return product.stock?.[0]?.quantity ?? 0
  }

  const getStockBadge = (qty: number, threshold: number) => {
    if (qty === 0) return <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">Out of Stock</span>
    if (qty <= threshold) return <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Low Stock</span>
    return <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">In Stock</span>
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">Manage your spare parts catalogue</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-xs"
            title="Bulk import products from CSV or Excel"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-xs"
            title="Export products to CSV"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
          {canManageProducts && (
            <Link
              to="/products/new"
              className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, SKU, barcode..."
              value={filters.search}
              onChange={(e) => { setFilters(f => ({ ...f, search: e.target.value })); setPage(0) }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => { setFilters(f => ({ ...f, status: e.target.value as ProductsFilter['status'] })); setPage(0) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-6 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">Failed to load products. Please try again.</p>
          </div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No products found</p>
            <p className="text-sm text-gray-400 mt-1">
              {filters.search ? 'Try adjusting your search' : 'Add your first product to get started'}
            </p>
            {canManageProducts && !filters.search && (
              <Link
                to="/products/new"
                className="mt-4 flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Product
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">SKU</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Category</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Retail Price</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Stock</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                    {canManageProducts && (
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((product) => {
                    const stockQty = getStockQty(product)
                    return (
                      <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{product.name}</p>
                            {product.brand && (
                              <p className="text-xs text-gray-400">{product.brand.name}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell font-mono text-xs">{product.sku}</td>
                        <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{product.category?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(product.retail_price)}</td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-medium">{stockQty}</span>
                            {getStockBadge(stockQty, product.reorder_threshold)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            product.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {product.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {canManageProducts && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                to={`/products/${product.id}/edit`}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </Link>
                              <button
                                onClick={() =>
                                  toggleActiveMutation.mutate({ id: product.id, is_active: !product.is_active })
                                }
                                className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title={product.is_active ? 'Archive' : 'Restore'}
                              >
                                {product.is_active ? (
                                  <Archive className="w-4 h-4" />
                                ) : (
                                  <ArchiveRestore className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total} products
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 text-sm text-gray-600">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ProductImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['products'] })
          qc.invalidateQueries({ queryKey: ['inventory-stock'] })
        }}
      />
    </div>
  )
}
