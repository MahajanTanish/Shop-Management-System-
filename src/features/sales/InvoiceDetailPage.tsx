import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatDateTime, calculateGST } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import type { Invoice, InvoiceItem, Payment, BusinessSettings } from '@/types/database'
import {
  ArrowLeft, Printer, Ban, CreditCard, Loader2, AlertCircle,
  CheckCircle, FileText, Building2, User, Phone, MapPin, Calendar
} from 'lucide-react'

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isOwner, isManager, user } = useAuth()

  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'card'>('cash')
  const [payReference, setPayReference] = useState('')
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // Fetch invoice details
  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customer:customers(*),
          items:invoice_items(*),
          payments:payments(*)
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Invoice & {
        customer?: any
        items: InvoiceItem[]
        payments: Payment[]
      }
    },
    enabled: Boolean(id),
  })

  // Fetch business settings for invoice header
  const { data: settings } = useQuery({
    queryKey: ['business_settings'],
    queryFn: async () => {
      const { data } = await supabase.from('business_settings').select('*').limit(1).single()
      return data as BusinessSettings | null
    },
  })

  // Record payment mutation
  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) return
      const amount = parseFloat(payAmount)
      if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid payment amount')
      if (amount > invoice.outstanding_amount) throw new Error('Payment cannot exceed outstanding balance')

      const { error: payErr } = await supabase.from('payments').insert({
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        amount,
        payment_method: payMethod,
        payment_date: new Date().toISOString().split('T')[0],
        reference_number: payReference || null,
        created_by: user?.id,
      })
      if (payErr) throw payErr

      const newPaid = Number(invoice.amount_paid) + amount
      const newOutstanding = Number(invoice.grand_total) - newPaid

      const { error: invErr } = await supabase.from('invoices').update({
        amount_paid: newPaid,
        outstanding_amount: newOutstanding,
      }).eq('id', invoice.id)
      if (invErr) throw invErr

      if (invoice.customer_id) {
        const { data: cust } = await supabase.from('customers').select('outstanding_balance').eq('id', invoice.customer_id).single()
        if (cust) {
          await supabase.from('customers').update({
            outstanding_balance: Math.max(0, Number(cust.outstanding_balance) - amount),
          }).eq('id', invoice.customer_id)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] })
      setPaymentModalOpen(false)
      setPayAmount('')
      setPayReference('')
    },
    onError: (err: Error) => setActionError(err.message),
  })

  // Cancel invoice mutation
  const cancelInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) return
      if (!cancelReason.trim()) throw new Error('Cancellation reason is required')

      // Mark invoice cancelled
      const { error: updErr } = await supabase.from('invoices').update({
        status: 'cancelled',
        cancelled_by: user?.id,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason,
      }).eq('id', invoice.id)
      if (updErr) throw updErr

      // Revert stock for each item if finalized
      if (invoice.status === 'finalized') {
        for (const item of invoice.items) {
          if (item.product_id) {
            const { data: sb } = await supabase.from('stock_balances').select('quantity').eq('product_id', item.product_id).single()
            const curr = Number(sb?.quantity ?? 0)
            const nxt = curr + Number(item.quantity)
            await supabase.from('stock_balances').update({ quantity: nxt, last_updated: new Date().toISOString() }).eq('product_id', item.product_id)

            await supabase.from('stock_movements').insert({
              product_id: item.product_id,
              movement_type: 'customer_return',
              quantity_change: item.quantity,
              quantity_before: curr,
              quantity_after: nxt,
              reference_type: 'invoice_cancellation',
              reference_id: invoice.id,
              reason: `Invoice ${invoice.invoice_number} cancelled: ${cancelReason}`,
              actor_id: user?.id,
            })
          }
        }

        // Adjust customer outstanding if invoice had unpaid amount
        if (invoice.customer_id && Number(invoice.outstanding_amount) > 0) {
          const { data: cust } = await supabase.from('customers').select('outstanding_balance').eq('id', invoice.customer_id).single()
          if (cust) {
            await supabase.from('customers').update({
              outstanding_balance: Math.max(0, Number(cust.outstanding_balance) - Number(invoice.outstanding_amount)),
            }).eq('id', invoice.customer_id)
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] })
      setCancelModalOpen(false)
      setCancelReason('')
    },
    onError: (err: Error) => setActionError(err.message),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <h2 className="text-lg font-bold text-red-700">Invoice Not Found</h2>
        <p className="text-sm text-red-600">The invoice could not be found or failed to load.</p>
        <Link to="/sales" className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
          Back to Invoices
        </Link>
      </div>
    )
  }

  const handlePrint = () => {
    window.print()
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'finalized':
        return <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold uppercase">Finalized</span>
      case 'draft':
        return <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold uppercase">Draft</span>
      case 'cancelled':
        return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold uppercase">Cancelled</span>
      default:
        return null
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Action Toolbar (Hidden during print) */}
      <div className="no-print flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/sales')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Invoices
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-lg transition"
          >
            <Printer className="w-4 h-4" />
            Print / PDF
          </button>

          {invoice.status === 'finalized' && Number(invoice.outstanding_amount) > 0 && (
            <button
              onClick={() => { setPayAmount(String(invoice.outstanding_amount)); setPaymentModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
            >
              <CreditCard className="w-4 h-4" />
              Record Payment
            </button>
          )}

          {invoice.status !== 'cancelled' && (isOwner || isManager) && (
            <button
              onClick={() => setCancelModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg transition border border-red-200"
            >
              <Ban className="w-4 h-4" />
              Cancel Invoice
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="no-print p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {actionError}
        </div>
      )}

      {/* Invoice Document Card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 print:border-none print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start pb-6 border-b border-gray-200 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-gray-900">
                {settings?.business_name || 'VED SCOOTER WORKS'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              {settings?.address || 'Shop No. 1, Main Auto Market'}, {settings?.city || 'Delhi'}
            </p>
            {settings?.phone && (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Phone className="w-3 h-3" /> Phone: {settings.phone}
              </p>
            )}
            {settings?.gstin && (
              <p className="text-xs font-mono font-medium text-gray-700 mt-1">
                GSTIN: {settings.gstin}
              </p>
            )}
          </div>

          <div className="text-right">
            <h1 className="text-xl font-bold uppercase tracking-wider text-blue-600">
              {invoice.invoice_type === 'wholesale' ? 'TAX INVOICE' : 'RETAIL BILL'}
            </h1>
            <p className="text-lg font-mono font-bold text-gray-900 mt-1">{invoice.invoice_number}</p>
            <div className="mt-2 flex items-center justify-end gap-2">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-600 font-medium">Date: {formatDate(invoice.billing_date)}</span>
            </div>
            <div className="mt-2">{statusBadge(invoice.status)}</div>
          </div>
        </div>

        {/* Bill To & Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-gray-200 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Billed To:</p>
            <p className="font-bold text-gray-900 text-base">
              {invoice.customer_name_snapshot || invoice.customer?.name || 'Walk-in Customer'}
            </p>
            {(invoice.customer_phone_snapshot || invoice.customer?.phone) && (
              <p className="text-gray-600 mt-1">Phone: {invoice.customer_phone_snapshot || invoice.customer?.phone}</p>
            )}
            {(invoice.customer_address_snapshot || invoice.customer?.billing_address) && (
              <p className="text-gray-600 mt-1">{invoice.customer_address_snapshot || invoice.customer?.billing_address}</p>
            )}
            {(invoice.customer_gstin_snapshot || invoice.customer?.gstin) && (
              <p className="font-mono text-xs text-gray-700 mt-1">
                Customer GSTIN: {invoice.customer_gstin_snapshot || invoice.customer?.gstin}
              </p>
            )}
          </div>

          <div className="sm:text-right space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Transaction Details:</p>
            <p className="text-gray-600">Type: <span className="font-medium capitalize">{invoice.invoice_type}</span></p>
            <p className="text-gray-600">Place of Supply: <span className="font-medium">{invoice.is_inter_state ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}</span></p>
            {invoice.created_at && (
              <p className="text-xs text-gray-400">Created: {formatDateTime(invoice.created_at)}</p>
            )}
          </div>
        </div>

        {/* Itemized Table */}
        <div className="py-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">
                <th className="py-3 px-2">#</th>
                <th className="py-3 px-2">Description / Part</th>
                <th className="py-3 px-2">HSN</th>
                <th className="py-3 px-2 text-right">Qty</th>
                <th className="py-3 px-2 text-right">Rate</th>
                <th className="py-3 px-2 text-right">Disc %</th>
                <th className="py-3 px-2 text-right">Taxable</th>
                <th className="py-3 px-2 text-right">GST</th>
                <th className="py-3 px-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoice.items?.map((item, idx) => (
                <tr key={item.id || idx}>
                  <td className="py-3 px-2 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="py-3 px-2">
                    <p className="font-medium text-gray-900">{item.product_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.product_sku}</p>
                  </td>
                  <td className="py-3 px-2 text-xs font-mono text-gray-600">{item.hsn_code || '—'}</td>
                  <td className="py-3 px-2 text-right font-medium">{item.quantity} {item.unit_of_measurement}</td>
                  <td className="py-3 px-2 text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="py-3 px-2 text-right text-gray-500">{item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}</td>
                  <td className="py-3 px-2 text-right">{formatCurrency(item.taxable_amount)}</td>
                  <td className="py-3 px-2 text-right text-xs text-gray-600">
                    {item.tax_rate > 0 ? `${item.tax_rate}% (${formatCurrency(item.total_tax)})` : '0%'}
                  </td>
                  <td className="py-3 px-2 text-right font-semibold text-gray-900">{formatCurrency(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between gap-6">
          <div className="text-xs text-gray-500 max-w-sm space-y-2">
            {invoice.notes && (
              <div>
                <span className="font-semibold text-gray-700">Notes: </span>
                <span>{invoice.notes}</span>
              </div>
            )}
            {settings?.bank_account_number && (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="font-semibold text-gray-700 mb-1">Bank Details for Payment:</p>
                <p>Bank: {settings.bank_name || 'N/A'}</p>
                <p className="font-mono">A/C: {settings.bank_account_number}</p>
                <p className="font-mono">IFSC: {settings.bank_ifsc || 'N/A'}</p>
              </div>
            )}
            <p className="text-[11px] text-gray-400 italic">
              {settings?.invoice_footer_note || 'Thank you for your business. Spare parts warranty as per manufacturer terms.'}
            </p>
          </div>

          <div className="w-full sm:w-72 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal:</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            {Number(invoice.total_discount) > 0 && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Total Discount:</span>
                <span>- {formatCurrency(invoice.total_discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Taxable Amount:</span>
              <span>{formatCurrency(invoice.taxable_amount)}</span>
            </div>

            {invoice.is_inter_state ? (
              <div className="flex justify-between text-gray-600">
                <span>IGST Total:</span>
                <span>{formatCurrency(invoice.total_igst)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-gray-600">
                  <span>CGST Total:</span>
                  <span>{formatCurrency(invoice.total_cgst)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>SGST Total:</span>
                  <span>{formatCurrency(invoice.total_sgst)}</span>
                </div>
              </>
            )}

            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Grand Total:</span>
              <span className="text-blue-700">{formatCurrency(invoice.grand_total)}</span>
            </div>

            <div className="flex justify-between text-sm text-gray-600 pt-1">
              <span>Amount Paid:</span>
              <span className="text-green-600 font-semibold">{formatCurrency(invoice.amount_paid)}</span>
            </div>

            <div className="flex justify-between text-sm font-bold pt-1 border-t border-gray-100">
              <span>Outstanding Balance:</span>
              <span className={Number(invoice.outstanding_amount) > 0 ? 'text-red-600' : 'text-gray-700'}>
                {formatCurrency(invoice.outstanding_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment History */}
        {invoice.payments && invoice.payments.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Payment Receipts Log
            </h3>
            <div className="space-y-2">
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex justify-between items-center text-xs p-2.5 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                    <span className="font-medium text-gray-800">{formatDate(p.payment_date)}</span>
                    <span className="capitalize px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px]">
                      {p.payment_method.replace('_', ' ')}
                    </span>
                    {p.reference_number && (
                      <span className="font-mono text-gray-500">Ref: {p.reference_number}</span>
                    )}
                  </div>
                  <span className="font-semibold text-gray-900">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Record Payment</h3>
            <p className="text-xs text-gray-500">Outstanding: {formatCurrency(invoice.outstanding_amount)}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
                  <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                  <option value="bank_transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="card">Debit / Credit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Reference / UTR Number</label>
                <input
                  type="text"
                  placeholder="Optional transaction reference"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
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
                {recordPaymentMutation.isPending ? 'Saving...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
              <Ban className="w-5 h-5" /> Cancel Invoice
            </h3>
            <p className="text-xs text-gray-600">
              Cancelling this invoice will restore inventory stock balances and adjust any outstanding customer credit. This action will be audited.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Reason for Cancellation *</label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Customer changed mind, incorrect parts billed"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={cancelInvoiceMutation.isPending || !cancelReason.trim()}
                onClick={() => cancelInvoiceMutation.mutate()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {cancelInvoiceMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
