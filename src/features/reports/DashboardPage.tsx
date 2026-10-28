// src/features/reports/DashboardPage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  TrendingUp, AlertTriangle, Package, Users,
  AlertCircle, Loader2, ArrowRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, subDays, parseISO } from 'date-fns'
import type { Invoice } from '@/types/database'

interface SummaryData {
  todaySales: number
  outstandingBalance: number
  lowStockCount: number
  totalProducts: number
}

interface DailySale {
  day: string
  label: string
  total: number
}

export default function DashboardPage() {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const sevenDaysAgo = format(subDays(today, 6), 'yyyy-MM-dd')

  const { data: summary, isLoading: loadingSummary } = useQuery<SummaryData>({
    queryKey: ['dashboard-summary', todayStr],
    queryFn: async () => {
      const [salesRes, customersRes, stockRes, productsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('grand_total')
          .eq('status', 'finalized')
          .gte('billing_date', todayStr)
          .lte('billing_date', todayStr),
        supabase
          .from('customers')
          .select('outstanding_balance')
          .eq('is_active', true),
        supabase
          .from('stock_balances')
          .select('quantity, product:products(reorder_threshold)'),
        supabase.from('products').select('id', { count: 'exact' }).eq('is_active', true),
      ])

      const todaySales = ((salesRes.data as any[]) ?? []).reduce((s, r) => s + (Number(r.grand_total) || 0), 0)
      const outstandingBalance = ((customersRes.data as any[]) ?? []).reduce((s, r) => s + (Number(r.outstanding_balance) || 0), 0)

      // Count low stock
      const stockData = (stockRes.data as unknown as Array<{ quantity: number; product: { reorder_threshold: number } | null }>) ?? []
      const lowStockCount = stockData.filter(
        (sb) => sb.product && sb.quantity <= sb.product.reorder_threshold
      ).length

      return {
        todaySales,
        outstandingBalance,
        lowStockCount,
        totalProducts: productsRes.count ?? 0,
      }
    },
  })

  const { data: recentInvoices, isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ['dashboard-recent-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, customer_name_snapshot, grand_total, billing_date, status, outstanding_amount, invoice_type')
        .eq('status', 'finalized')
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data as Invoice[]
    },
  })

  const { data: lowStockProducts, isLoading: loadingLowStock } = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('quantity, product:products!inner(id, name, sku, reorder_threshold)')
        .order('quantity', { ascending: true })
        .limit(10)
      if (error) throw error
      const typed = (data as unknown as Array<{ quantity: number; product: { id: string; name: string; sku: string; reorder_threshold: number } }>) || []
      return typed.filter((sb) => sb.product && sb.quantity <= sb.product.reorder_threshold)
    },
  })

  const { data: weeklySales, isLoading: loadingWeekly } = useQuery<DailySale[]>({
    queryKey: ['dashboard-weekly-sales', sevenDaysAgo, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('billing_date, grand_total')
        .eq('status', 'finalized')
        .gte('billing_date', sevenDaysAgo)
        .lte('billing_date', todayStr)
      if (error) throw error

      const days: DailySale[] = []
      for (let i = 6; i >= 0; i--) {
        const d = subDays(today, i)
        const dayStr = format(d, 'yyyy-MM-dd')
        const label = format(d, 'dd MMM')
        const total = (data ?? [])
          .filter((inv) => inv.billing_date === dayStr)
          .reduce((s, inv) => s + (inv.grand_total ?? 0), 0)
        days.push({ day: dayStr, label, total })
      }
      return days
    },
  })

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      finalized: 'bg-green-100 text-green-700',
      draft: 'bg-amber-100 text-amber-700',
      cancelled: 'bg-red-100 text-red-600',
    }
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const cards = [
    {
      title: "Today's Sales",
      value: loadingSummary ? '...' : formatCurrency(summary?.todaySales ?? 0),
      icon: TrendingUp,
      color: 'bg-blue-50 text-blue-600',
      border: 'border-blue-200',
    },
    {
      title: 'Outstanding Balance',
      value: loadingSummary ? '...' : formatCurrency(summary?.outstandingBalance ?? 0),
      icon: Users,
      color: 'bg-amber-50 text-amber-600',
      border: 'border-amber-200',
    },
    {
      title: 'Low Stock Items',
      value: loadingSummary ? '...' : String(summary?.lowStockCount ?? 0),
      icon: AlertTriangle,
      color: 'bg-red-50 text-red-600',
      border: 'border-red-200',
    },
    {
      title: 'Total Products',
      value: loadingSummary ? '...' : String(summary?.totalProducts ?? 0),
      icon: Package,
      color: 'bg-green-50 text-green-600',
      border: 'border-green-200',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Welcome back — here's what's happening today.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.title} className={`bg-white rounded-xl border ${card.border} p-4 flex items-start gap-3`}>
            <div className={`p-2 rounded-lg ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{card.title}</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts + Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-800 mb-4">Last 7 Days Sales</h2>
          {loadingWeekly ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklySales ?? []} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Sales']} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sales" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Low Stock</h2>
            <Link to="/inventory" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingLowStock ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          ) : !lowStockProducts?.length ? (
            <p className="text-sm text-gray-400 text-center py-8">All stock levels are OK</p>
          ) : (
            <div className="space-y-2">
              {lowStockProducts.map((sb) => (
                <div key={sb.product.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{sb.product.name}</p>
                    <p className="text-xs text-gray-400">{sb.product.sku}</p>
                  </div>
                  <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${
                    sb.quantity === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {sb.quantity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Recent Invoices</h2>
          <Link to="/sales" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {loadingInvoices ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : !recentInvoices?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No finalized invoices yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Customer</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Date</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/sales/${inv.id}`} className="font-mono text-blue-600 hover:underline text-xs">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">
                      {inv.customer_name_snapshot ?? 'Walk-in'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(inv.grand_total)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {formatDate(inv.billing_date)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {statusBadge(inv.status)}
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
