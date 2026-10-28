import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import type { Purchase } from '@/types/database'
import {
  TruckIcon, Plus, Search, Filter, Loader2, AlertCircle,
  CheckCircle, ArrowUpRight, Calendar
} from 'lucide-react'

export default function PurchasesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isOwner, isManager, isInventoryEmployee, user } = useAuth()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'received' | 'cancelled'>('all')

  // Fetch purchases
  const { data: purchases, isLoading, error } = useQuery({
    queryKey: ['purchases', search, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('purchases')
        .select(`
          *,
          supplier:suppliers(name, phone)
        `)
        .order('purchase_date', { ascending: false })

      if (search) {
        q = q.or(`purchase_number.ilike.%${search}%,supplier_invoice_ref.ilike.%${search}%,supplier_name_snapshot.ilike.%${search}%`)
      }
      if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter)
      }

      const { data, error } = await q
      if (error) throw error
      return data as (Purchase & { supplier?: { name: string; phone: string | null } })[]
    },
  })

  // Receive stock mutation (calls the database atomic function receive_purchase)
  const receivePurchaseMutation = useMutation({
    mutationFn: async (purchaseId: string) => {
      const { error } = await supabase.rpc('receive_purchase', {
        p_purchase_id: purchaseId,
        p_actor_id: user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['stock-balances'] })
    },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Purchases & Goods Receipts</h1>
          <p className="text-sm text-gray-500">Record inventory intake from suppliers and track stock receipts</p>
        </div>
        {(isOwner || isManager || isInventoryEmployee) && (
          <Link
            to="/purchases/new"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            New Purchase Entry
          </Link>
        )}
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by PO #, Supplier Invoice #, or Supplier Name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft (Pending Receipt)</option>
          <option value="received">Received (Stock Added)</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Purchase List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Failed to load purchase records.</span>
          </div>
        ) : !purchases?.length ? (
          <div className="text-center py-16 text-gray-400">
            <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-gray-600">No purchase records found</p>
            <p className="text-xs text-gray-400 mt-1">Record supplier purchase bills to add parts into inventory.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">PO Number</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Supplier Invoice #</th>
                  <th className="py-3 px-4">Purchase Date</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-medium text-blue-600">
                      {p.purchase_number}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-gray-900">{p.supplier_name_snapshot || p.supplier?.name || 'Unknown Supplier'}</p>
                      {p.supplier?.phone && <p className="text-xs text-gray-400">{p.supplier.phone}</p>}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-600">
                      {p.supplier_invoice_ref || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600">
                      {formatDate(p.purchase_date)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-gray-900">
                      {formatCurrency(p.grand_total)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                        p.status === 'received' ? 'bg-green-100 text-green-800' :
                        p.status === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {p.status === 'draft' && (isOwner || isManager || isInventoryEmployee) ? (
                        <button
                          onClick={() => receivePurchaseMutation.mutate(p.id)}
                          disabled={receivePurchaseMutation.isPending}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition"
                        >
                          Receive Stock
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {p.received_at ? `Received ${formatDate(p.received_at)}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
