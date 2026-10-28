import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import type { Customer, Invoice, Payment } from '@/types/database'
import {
  ArrowLeft, Phone, Mail, MapPin, Building2, CreditCard,
  FileText, History, Loader2, AlertCircle, CheckCircle, Edit, Plus
} from 'lucide-react'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'ledger'>('invoices')
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'card'>('cash')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Fetch customer
  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').eq('id', id).single()
      if (error) throw error
      return data as Customer
    },
    enabled: Boolean(id),
  })

  // Fetch customer invoices
  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['customer-invoices', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', id)
        .order('billing_date', { ascending: false })
      if (error) throw error
      return data as Invoice[]
    },
    enabled: Boolean(id),
  })

  // Fetch customer payments
  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ['customer-payments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`*, invoice:invoices(invoice_number)`)
        .eq('customer_id', id)
        .order('payment_date', { ascending: false })
      if (error) throw error
      return data as (Payment & { invoice?: { invoice_number: string } })[]
    },
    enabled: Boolean(id),
  })

  // Record payment mutation
  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!customer) return
      const amount = parseFloat(payAmount)
      if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid payment amount')

      // 1. Insert payment record
      const { error: pErr } = await supabase.from('payments').insert({
        customer_id: customer.id,
        amount,
        payment_method: payMethod,
        payment_date: new Date().toISOString().split('T')[0],
        reference_number: payRef || null,
        notes: payNotes || null,
        created_by: user?.id,
      })
      if (pErr) throw pErr

      // 2. Reduce customer outstanding balance
      const newBalance = Math.max(0, Number(customer.outstanding_balance) - amount)
      const { error: cErr } = await supabase
        .from('customers')
        .update({ outstanding_balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', customer.id)
      if (cErr) throw cErr

      // 3. Reconcile against unpaid finalized invoices (oldest first FIFO)
      let remainingPayment = amount
      const unpaidInvoices = (invoices || [])
        .filter(inv => inv.status === 'finalized' && Number(inv.outstanding_amount) > 0)
        .sort((a, b) => new Date(a.billing_date).getTime() - new Date(b.billing_date).getTime())

      for (const inv of unpaidInvoices) {
        if (remainingPayment <= 0) break
        const out = Number(inv.outstanding_amount)
        const applyAmt = Math.min(out, remainingPayment)
        const newPaid = Number(inv.amount_paid) + applyAmt
        const newOut = out - applyAmt

        await supabase.from('invoices').update({
          amount_paid: newPaid,
          outstanding_amount: newOut,
        }).eq('id', inv.id)

        remainingPayment -= applyAmt
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', id] })
      qc.invalidateQueries({ queryKey: ['customer-invoices', id] })
      qc.invalidateQueries({ queryKey: ['customer-payments', id] })
      setPaymentModalOpen(false)
      setPayAmount('')
      setPayRef('')
      setPayNotes('')
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  if (loadingCustomer) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Customer not found.</p>
        <button onClick={() => navigate('/customers')} className="mt-2 text-sm text-blue-600">Back to Customers</button>
      </div>
    )
  }

  // Combine invoices and payments into a unified chronological ledger
  const ledgerEntries = [
    ...(invoices || [])
      .filter(i => i.status === 'finalized')
      .map(i => ({
        id: i.id,
        date: i.billing_date,
        type: 'Invoice',
        reference: i.invoice_number,
        debit: Number(i.grand_total),
        credit: 0,
        notes: `${i.invoice_type.toUpperCase()} Invoice`,
        link: `/sales/${i.id}`,
      })),
    ...(payments || []).map(p => ({
      id: p.id,
      date: p.payment_date,
      type: 'Payment',
      reference: p.reference_number || (p.invoice?.invoice_number ? `Inv ${p.invoice.invoice_number}` : 'Receipt'),
      debit: 0,
      credit: Number(p.amount),
      notes: `${p.payment_method.toUpperCase()} Payment`,
      link: undefined,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Calculate running balance for the ledger
  let running = 0
  const ledgerWithBalance = ledgerEntries.map(entry => {
    running = running + entry.debit - entry.credit
    return { ...entry, runningBalance: running }
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/customers')} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </button>
        <button
          onClick={() => { setPayAmount(String(customer.outstanding_balance)); setPaymentModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          <CreditCard className="w-4 h-4" /> Record Payment
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* Customer Info Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase bg-blue-100 text-blue-800">
                {customer.customer_type}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-600">
              {customer.phone && (
                <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" /> {customer.phone}</span>
              )}
              {customer.billing_address && (
                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" /> {customer.billing_address}, {customer.city}</span>
              )}
              {customer.gstin && (
                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">GSTIN: {customer.gstin}</span>
              )}
            </div>
          </div>

          {/* Outstanding Balance Banner */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 sm:text-right min-w-[200px]">
            <p className="text-xs uppercase font-semibold text-gray-500 tracking-wider">Current Outstanding</p>
            <p className={`text-2xl font-black mt-1 ${Number(customer.outstanding_balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(customer.outstanding_balance)}
            </p>
            {customer.credit_limit && (
              <p className="text-xs text-gray-400 mt-1">Limit: {formatCurrency(customer.credit_limit)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 space-x-6">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'invoices' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Invoices ({invoices?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`pb-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'payments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Payment History ({payments?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'ledger' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Statement of Account (Ledger)
        </button>
      </div>

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {!invoices?.length ? (
            <p className="text-center py-12 text-sm text-gray-400">No invoices generated for this customer yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/80">
                    <td className="py-3.5 px-4 font-mono font-medium text-blue-600">
                      <Link to={`/sales/${inv.id}`}>{inv.invoice_number}</Link>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600">{formatDate(inv.billing_date)}</td>
                    <td className="py-3.5 px-4 text-right font-medium">{formatCurrency(inv.grand_total)}</td>
                    <td className="py-3.5 px-4 text-right text-green-600">{formatCurrency(inv.amount_paid)}</td>
                    <td className="py-3.5 px-4 text-right font-semibold text-red-600">{formatCurrency(inv.outstanding_amount)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                        inv.status === 'finalized' ? 'bg-green-100 text-green-700' :
                        inv.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link to={`/sales/${inv.id}`} className="text-xs text-blue-600 font-medium hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {!payments?.length ? (
            <p className="text-center py-12 text-sm text-gray-400">No payment receipts recorded yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Against Invoice</th>
                  <th className="py-3 px-4 text-right">Amount Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/80">
                    <td className="py-3.5 px-4 text-gray-600">{formatDate(p.payment_date)}</td>
                    <td className="py-3.5 px-4 capitalize font-medium">{p.payment_method.replace('_', ' ')}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-500">{p.reference_number || '—'}</td>
                    <td className="py-3.5 px-4 text-xs font-mono text-blue-600">{p.invoice?.invoice_number || 'General Account'}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-green-600">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Ledger Tab */}
      {activeTab === 'ledger' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {!ledgerWithBalance.length ? (
            <p className="text-center py-12 text-sm text-gray-400">No transactions recorded.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Particulars</th>
                  <th className="py-3 px-4">Ref #</th>
                  <th className="py-3 px-4 text-right">Debit (Sale)</th>
                  <th className="py-3 px-4 text-right">Credit (Receipt)</th>
                  <th className="py-3 px-4 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledgerWithBalance.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50/80 text-xs">
                    <td className="py-3 px-4 text-gray-600">{formatDate(l.date)}</td>
                    <td className="py-3 px-4 font-medium text-gray-900">{l.notes}</td>
                    <td className="py-3 px-4 font-mono text-blue-600">
                      {l.link ? <Link to={l.link}>{l.reference}</Link> : l.reference}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-red-600">
                      {l.debit > 0 ? formatCurrency(l.debit) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-green-600">
                      {l.credit > 0 ? formatCurrency(l.credit) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900">
                      {formatCurrency(l.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Record Payment for {customer.name}</h3>
            <p className="text-xs text-gray-500">Current Outstanding: {formatCurrency(customer.outstanding_balance)}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Amount Received (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI (GPay / PhonePe / QR)</option>
                  <option value="bank_transfer">Bank Transfer (NEFT/RTGS)</option>
                  <option value="card">Card</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Transaction Ref / Cheque No.</label>
                <input
                  type="text"
                  placeholder="Optional reference number"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Cleared past week parts balance"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
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
                {recordPaymentMutation.isPending ? 'Recording...' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
