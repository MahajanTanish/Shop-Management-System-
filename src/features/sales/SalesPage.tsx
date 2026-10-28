// src/features/sales/SalesPage.tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Search, AlertCircle, Loader2, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import type { Invoice, InvoiceStatus, InvoiceType } from '@/types/database'

const PAGE_SIZE = 20

type StatusFilter = 'all' | InvoiceStatus
type TypeFilter = 'all' | InvoiceType

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const map: Record<InvoiceStatus, string> = {
    finalized: 'bg-green-100 text-green-700',
    draft: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-600',
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${map[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function SalesPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['sales', page, search, statusFilter, typeFilter, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('invoices')
        .select('id, invoice_number, invoice_type, status, customer_id, customer_name_snapshot, billing_date, grand_total, outstanding_amount', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (search) {
        q = q.or(`invoice_number.ilike.%${search}%,customer_name_snapshot.ilike.%${search}%`)
      }
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      if (typeFilter !== 'all') q = q.eq('invoice_type', typeFilter)
      if (dateFrom) q = q.gte('billing_date', dateFrom)
      if (dateTo) q = q.lte('billing_date', dateTo)

      const { data, error, count } = await q
      if (error) throw error
      return { items: data as Invoice[], total: count ?? 0 }
    },
  })

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Sales / Invoices</h1>
          <p className="text-sm text-gray-500">Manage all customer invoices</p>
        </div>
        <Link
          to="/sales/new"
          className="sm:ml-auto flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-fit"
        >
          <Plus className="w-4 h-4" /> New Invoice
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative col-span-1 sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Invoice # or customer name..."
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
            <option value="draft">Draft</option>
            <option value="finalized">Finalized</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as TypeFilter); setPage(0) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
          </select>
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
              className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
              className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
        ) : error ? (
          <div className="flex items-center gap-2 p-6 text-red-600"><AlertCircle className="w-5 h-5" /><p className="text-sm">Failed to load invoices.</p></div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No invoices found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or create a new invoice.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice #</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Date</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/sales/${inv.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-blue-600 text-xs">{inv.invoice_number}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">
                        {inv.customer_name_snapshot ?? 'Walk-in'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          inv.invoice_type === 'wholesale' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {inv.invoice_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{formatDate(inv.billing_date)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(inv.grand_total)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        {inv.outstanding_amount > 0 ? (
                          <span className="font-medium text-red-600">{formatCurrency(inv.outstanding_amount)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 text-sm text-gray-600">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
