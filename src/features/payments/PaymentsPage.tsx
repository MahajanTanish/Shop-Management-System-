import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import type { Payment, Customer } from '@/types/database'
import {
  CreditCard, Plus, Search, Filter, Calendar, Loader2,
  AlertCircle, CheckCircle2, ArrowDownLeft, Building2, User
} from 'lucide-react'

export default function PaymentsPage() {
  const qc = useQueryClient()
  const { isOwner, isManager, isSalesEmployee, user } = useAuth()

  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)

  // Form states
  const [customerId, setCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'card' | 'cheque'>('cash')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0] || '')
  const [refNum, setRefNum] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Fetch payments
  const { data: payments, isLoading, error } = useQuery({
    queryKey: ['payments', search, methodFilter],
    queryFn: async () => {
      let q = supabase
        .from('payments')
        .select(`
          *,
          customer:customers(name, phone, outstanding_balance),
          invoice:invoices(invoice_number, grand_total)
        `)
        .order('payment_date', { ascending: false })

      if (methodFilter !== 'all') {
        q = q.eq('payment_method', methodFilter)
      }

      const { data, error } = await q
      if (error) throw error

      // Client filter for customer name or reference
      let res = (data || []) as (Payment & { customer?: any; invoice?: any })[]
      if (search.trim()) {
        const lower = search.toLowerCase()
        res = res.filter(p =>
          p.customer?.name?.toLowerCase().includes(lower) ||
          p.reference_number?.toLowerCase().includes(lower) ||
          p.invoice?.invoice_number?.toLowerCase().includes(lower)
        )
      }
      return res
    },
  })

  // Fetch customers for modal
  const { data: customers } = useQuery({
    queryKey: ['customers-active'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').order('name')
      return (data || []) as Customer[]
    },
  })

  // Record payment mutation
  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      const payAmt = parseFloat(amount)
      if (isNaN(payAmt) || payAmt <= 0) throw new Error('Enter a valid amount')
      if (!customerId) throw new Error('Select a customer')

      // 1. Insert payment record
      const { error: pErr } = await supabase.from('payments').insert({
        customer_id: customerId,
        amount: payAmt,
        payment_method: method,
        payment_date: paymentDate,
        reference_number: refNum || null,
        notes: notes || null,
        created_by: user?.id,
      })
      if (pErr) throw pErr

      // 2. Reduce customer balance
      const cust = customers?.find(c => c.id === customerId)
      if (cust) {
        const newBalance = Math.max(0, Number(cust.outstanding_balance) - payAmt)
        await supabase.from('customers').update({
          outstanding_balance: newBalance,
          updated_at: new Date().toISOString(),
        }).eq('id', customerId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      setModalOpen(false)
      setAmount('')
      setCustomerId('')
      setRefNum('')
      setNotes('')
      setFormError(null)
    },
    onError: (err: Error) => setFormError(err.message),
  })

  // Calculate quick summary metrics
  const todayStr = new Date().toISOString().split('T')[0]
  const todayTotal = (payments || [])
    .filter(p => p.payment_date === todayStr)
    .reduce((sum, p) => sum + Number(p.amount), 0)

  const cashTotal = (payments || [])
    .filter(p => p.payment_method === 'cash')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  const digitalTotal = (payments || [])
    .filter(p => ['upi', 'bank_transfer', 'card'].includes(p.payment_method))
    .reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payments & Credit Collections</h1>
          <p className="text-sm text-gray-500">Track all incoming cash, UPI, and bank receipts with automated customer credit ledger reconciliation</p>
        </div>
        {(isOwner || isManager || isSalesEmployee) && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Record Payment Receipt
          </button>
        )}
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs uppercase font-semibold text-gray-400 tracking-wider">Today's Collections</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{formatCurrency(todayTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">Receipts recorded for {formatDate(todayStr)}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs uppercase font-semibold text-gray-400 tracking-wider">Cash in Register</p>
          <p className="text-2xl font-black text-green-600 mt-1">{formatCurrency(cashTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">Total physical cash collected</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs uppercase font-semibold text-gray-400 tracking-wider">Digital / UPI / Bank</p>
          <p className="text-2xl font-black text-blue-600 mt-1">{formatCurrency(digitalTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">Verified UPI, QR, and bank transfers</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by customer, invoice number, or UTR/Ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Payment Modes</option>
          <option value="cash">Cash Only</option>
          <option value="upi">UPI / QR Code</option>
          <option value="bank_transfer">Bank Transfer (NEFT/RTGS)</option>
          <option value="card">Card Payment</option>
          <option value="cheque">Cheque</option>
        </select>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Failed to load payments.</span>
          </div>
        ) : !payments?.length ? (
          <div className="text-center py-16 text-gray-400">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-gray-600">No payment receipts found</p>
            <p className="text-xs text-gray-400 mt-1">Incoming payments against customer bills will show here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Receipt Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Ref / UTR</th>
                  <th className="py-3 px-4 text-right">Amount Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/80 transition">
                    <td className="py-3.5 px-4 text-xs text-gray-600">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-gray-900">{p.customer?.name || 'Walk-in'}</p>
                      {p.customer?.phone && <p className="text-xs text-gray-400">{p.customer.phone}</p>}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-blue-600">
                      {p.invoice?.invoice_number ? p.invoice.invoice_number : <span className="text-gray-400 font-sans">General Credit</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="capitalize px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        {p.payment_method.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-500">
                      {p.reference_number || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-green-600">
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Record Payment Receipt</h3>
            <p className="text-xs text-gray-500">Accept and reconcile customer payment towards parts credit.</p>

            {formError && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Customer *</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">— Select Customer —</option>
                  {customers?.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Due: {formatCurrency(c.outstanding_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI / QR Code</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Reference / UTR Number</label>
                <input
                  type="text"
                  placeholder="Bank UTR or transaction ID"
                  value={refNum}
                  onChange={(e) => setRefNum(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Optional receipt notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={recordPaymentMutation.isPending}
                onClick={() => recordPaymentMutation.mutate()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {recordPaymentMutation.isPending ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
