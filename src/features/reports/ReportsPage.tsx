import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, roundMoney } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import {
  BarChart3, Calendar, Download, TrendingUp, Layers, Users,
  Building2, Loader2, AlertCircle, FileSpreadsheet
} from 'lucide-react'

export default function ReportsPage() {
  const { isOwner, isManager } = useAuth()
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'receivables' | 'payables'>('sales')

  // Date filters for sales report (default to current month)
  const today = new Date().toISOString().split('T')[0] || ''
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0] || ''
  const [startDate, setStartDate] = useState(firstDayOfMonth)
  const [endDate, setEndDate] = useState(today)

  // 1. Fetch Sales Data
  const { data: salesData, isLoading: loadingSales } = useQuery({
    queryKey: ['report-sales', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          id, invoice_number, invoice_type, billing_date,
          subtotal, total_discount, taxable_amount, total_tax,
          grand_total, amount_paid, outstanding_amount, status,
          customer_name_snapshot
        `)
        .eq('status', 'finalized')
        .gte('billing_date', startDate)
        .lte('billing_date', endDate)
        .order('billing_date', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: activeTab === 'sales',
  })

  // 2. Fetch Inventory Valuation
  const { data: inventoryData, isLoading: loadingInventory } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, sku, name, unit_of_measurement, purchase_cost, retail_price, wholesale_price,
          stock:stock_balances(quantity)
        `)
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      return (data || []).map((p: any) => {
        const qty = Number(p.stock?.[0]?.quantity ?? 0)
        const costValuation = roundMoney(qty * Number(p.purchase_cost))
        const retailValuation = roundMoney(qty * Number(p.retail_price))
        return {
          ...p,
          quantity: qty,
          costValuation,
          retailValuation,
        }
      })
    },
    enabled: activeTab === 'inventory',
  })

  // 3. Fetch Customer Receivables
  const { data: receivablesData, isLoading: loadingReceivables } = useQuery({
    queryKey: ['report-receivables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .gt('outstanding_balance', 0)
        .order('outstanding_balance', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: activeTab === 'receivables',
  })

  // 4. Fetch Supplier Payables
  const { data: payablesData, isLoading: loadingPayables } = useQuery({
    queryKey: ['report-payables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .gt('outstanding_balance', 0)
        .order('outstanding_balance', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: activeTab === 'payables',
  })

  // Export current table as CSV
  const handleExportCSV = () => {
    let headers: string[] = []
    let rows: (string | number)[][] = []
    let filename = `report-${activeTab}-${today}.csv`

    if (activeTab === 'sales' && salesData) {
      headers = ['Invoice Number', 'Date', 'Customer', 'Type', 'Taxable Value', 'Total Tax', 'Grand Total', 'Paid', 'Outstanding']
      rows = salesData.map(i => [
        i.invoice_number,
        i.billing_date,
        i.customer_name_snapshot || 'Walk-in',
        i.invoice_type,
        i.taxable_amount,
        i.total_tax,
        i.grand_total,
        i.amount_paid,
        i.outstanding_amount,
      ])
    } else if (activeTab === 'inventory' && inventoryData) {
      headers = ['SKU', 'Product Name', 'Current Stock', 'Unit Cost', 'Cost Valuation', 'Retail Price', 'Retail Valuation']
      rows = inventoryData.map(p => [
        p.sku,
        p.name,
        p.quantity,
        p.purchase_cost,
        p.costValuation,
        p.retail_price,
        p.retailValuation,
      ])
    } else if (activeTab === 'receivables' && receivablesData) {
      headers = ['Customer Name', 'Phone', 'Type', 'Credit Limit', 'Outstanding Balance']
      rows = receivablesData.map(c => [
        c.name,
        c.phone || '',
        c.customer_type,
        c.credit_limit || 0,
        c.outstanding_balance,
      ])
    } else if (activeTab === 'payables' && payablesData) {
      headers = ['Supplier Name', 'Contact', 'Phone', 'GSTIN', 'Outstanding Payable']
      rows = payablesData.map(s => [
        s.name,
        s.contact_person || '',
        s.phone || '',
        s.gstin || '',
        s.outstanding_balance,
      ])
    }

    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Sales Totals
  const totalSalesRevenue = (salesData || []).reduce((sum, i) => sum + Number(i.grand_total), 0)
  const totalTaxCollected = (salesData || []).reduce((sum, i) => sum + Number(i.total_tax), 0)
  const totalRetailSales = (salesData || []).filter(i => i.invoice_type === 'retail').reduce((sum, i) => sum + Number(i.grand_total), 0)
  const totalWholesaleSales = (salesData || []).filter(i => i.invoice_type === 'wholesale').reduce((sum, i) => sum + Number(i.grand_total), 0)

  // Inventory Totals
  const totalStockUnits = (inventoryData || []).reduce((sum, p) => sum + p.quantity, 0)
  const totalInventoryCost = (inventoryData || []).reduce((sum, p) => sum + p.costValuation, 0)
  const totalInventoryRetail = (inventoryData || []).reduce((sum, p) => sum + p.retailValuation, 0)

  // Receivables & Payables Totals
  const totalReceivables = (receivablesData || []).reduce((sum, c) => sum + Number(c.outstanding_balance), 0)
  const totalPayables = (payablesData || []).reduce((sum, s) => sum + Number(s.outstanding_balance), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Business Reports & Analytics</h1>
          <p className="text-sm text-gray-500">Real transaction aggregates, inventory valuation, and audit-grade balances</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-lg transition"
        >
          <Download className="w-4 h-4" />
          Export to CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('sales')}
          className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
            activeTab === 'sales' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Sales & Tax Report
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
            activeTab === 'inventory' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Inventory Valuation
        </button>
        <button
          onClick={() => setActiveTab('receivables')}
          className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
            activeTab === 'receivables' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Customer Receivables
        </button>
        <button
          onClick={() => setActiveTab('payables')}
          className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
            activeTab === 'payables' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Supplier Payables
        </button>
      </div>

      {/* ─── SALES TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          {/* Date Range Selector */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold text-gray-700 uppercase">Billing Period:</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 border rounded-lg text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 border rounded-lg text-xs"
              />
            </div>
          </div>

          {/* Sales Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase">Period Revenue</p>
              <p className="text-xl font-black text-gray-900 mt-1">{formatCurrency(totalSalesRevenue)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase">GST Tax Collected</p>
              <p className="text-xl font-black text-blue-600 mt-1">{formatCurrency(totalTaxCollected)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase">Retail Bills</p>
              <p className="text-xl font-black text-gray-900 mt-1">{formatCurrency(totalRetailSales)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase">Wholesale Invoices</p>
              <p className="text-xl font-black text-indigo-600 mt-1">{formatCurrency(totalWholesaleSales)}</p>
            </div>
          </div>

          {/* Sales Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {loadingSales ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : !salesData?.length ? (
              <p className="py-12 text-center text-xs text-gray-400">No finalized sales during this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    <tr>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-right">Taxable</th>
                      <th className="py-3 px-4 text-right">GST</th>
                      <th className="py-3 px-4 text-right">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {salesData.map((s: any) => (
                      <tr key={s.id} className="hover:bg-gray-50/80">
                        <td className="py-3 px-4 font-mono font-medium text-blue-600">{s.invoice_number}</td>
                        <td className="py-3 px-4 text-xs text-gray-600">{formatDate(s.billing_date)}</td>
                        <td className="py-3 px-4 text-gray-900 font-medium">{s.customer_name_snapshot || 'Walk-in'}</td>
                        <td className="py-3 px-4 capitalize text-xs">{s.invoice_type}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{formatCurrency(s.taxable_amount)}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{formatCurrency(s.total_tax)}</td>
                        <td className="py-3 px-4 text-right font-bold text-gray-900">{formatCurrency(s.grand_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── INVENTORY TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase">Total Stock Quantity</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{totalStockUnits} Units</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase">Inventory Value (At Cost)</p>
              <p className="text-2xl font-black text-blue-600 mt-1">{formatCurrency(totalInventoryCost)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase">Inventory Value (At Retail)</p>
              <p className="text-2xl font-black text-green-600 mt-1">{formatCurrency(totalInventoryRetail)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {loadingInventory ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : !inventoryData?.length ? (
              <p className="py-12 text-center text-xs text-gray-400">No active products found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    <tr>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4 text-right">In Stock</th>
                      <th className="py-3 px-4 text-right">Unit Cost</th>
                      <th className="py-3 px-4 text-right">Valuation (Cost)</th>
                      <th className="py-3 px-4 text-right">Retail Price</th>
                      <th className="py-3 px-4 text-right">Valuation (Retail)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inventoryData.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/80">
                        <td className="py-3 px-4 font-mono text-xs text-gray-500">{p.sku}</td>
                        <td className="py-3 px-4 font-medium text-gray-900">{p.name}</td>
                        <td className="py-3 px-4 text-right font-semibold">{p.quantity} {p.unit_of_measurement}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{formatCurrency(p.purchase_cost)}</td>
                        <td className="py-3 px-4 text-right font-medium text-blue-600">{formatCurrency(p.costValuation)}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{formatCurrency(p.retail_price)}</td>
                        <td className="py-3 px-4 text-right font-medium text-green-600">{formatCurrency(p.retailValuation)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── RECEIVABLES TAB ────────────────────────────────────────────────── */}
      {activeTab === 'receivables' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase">Total Customer Balance Due</p>
            <p className="text-2xl font-black text-red-600 mt-1">{formatCurrency(totalReceivables)}</p>
            <p className="text-xs text-gray-400 mt-1">Outstanding amounts across all customer accounts</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {loadingReceivables ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : !receivablesData?.length ? (
              <p className="py-12 text-center text-xs text-green-600 font-medium">All customer accounts are fully paid!</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    <tr>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Account Type</th>
                      <th className="py-3 px-4 text-right">Credit Limit</th>
                      <th className="py-3 px-4 text-right">Outstanding Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {receivablesData.map((c: any) => (
                      <tr key={c.id} className="hover:bg-gray-50/80">
                        <td className="py-3 px-4 font-bold text-gray-900">{c.name}</td>
                        <td className="py-3 px-4 text-xs text-gray-600">{c.phone || '—'}</td>
                        <td className="py-3 px-4 capitalize text-xs">{c.customer_type}</td>
                        <td className="py-3 px-4 text-right text-gray-500">{c.credit_limit ? formatCurrency(c.credit_limit) : 'No Limit'}</td>
                        <td className="py-3 px-4 text-right font-black text-red-600">{formatCurrency(c.outstanding_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── PAYABLES TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'payables' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase">Total Supplier Payables</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{formatCurrency(totalPayables)}</p>
            <p className="text-xs text-gray-400 mt-1">Outstanding amounts owed to parts distributors</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {loadingPayables ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : !payablesData?.length ? (
              <p className="py-12 text-center text-xs text-gray-400">No outstanding payables to suppliers.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    <tr>
                      <th className="py-3 px-4">Supplier Name</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">GSTIN</th>
                      <th className="py-3 px-4 text-right">Payable Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payablesData.map((s: any) => (
                      <tr key={s.id} className="hover:bg-gray-50/80">
                        <td className="py-3 px-4 font-bold text-gray-900">{s.name}</td>
                        <td className="py-3 px-4 text-xs text-gray-600">{s.phone || s.contact_person || '—'}</td>
                        <td className="py-3 px-4 font-mono text-xs text-gray-500">{s.gstin || '—'}</td>
                        <td className="py-3 px-4 text-right font-black text-amber-600">{formatCurrency(s.outstanding_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
