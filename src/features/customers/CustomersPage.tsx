import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { customerSchema, type CustomerFormData } from '@/schemas'
import { useAuth } from '@/features/auth/AuthContext'
import type { Customer } from '@/types/database'
import {
  Users, Plus, Search, Filter, Phone, Mail, MapPin, AlertCircle,
  Loader2, ChevronRight, CheckCircle2, XCircle
} from 'lucide-react'

export default function CustomersPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'retail' | 'wholesale' | 'both'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<CustomerFormData>({
    name: '',
    phone: '',
    email: '',
    billing_address: '',
    city: '',
    state: '',
    gstin: '',
    customer_type: 'retail',
    credit_limit: null,
    payment_terms: '',
    notes: '',
    is_active: true,
  })

  // Fetch customers
  const { data: customers, isLoading, error } = useQuery({
    queryKey: ['customers', search, typeFilter],
    queryFn: async () => {
      let q = supabase
        .from('customers')
        .select('*')
        .order('name')

      if (search) {
        q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,gstin.ilike.%${search}%`)
      }
      if (typeFilter !== 'all') {
        q = q.eq('customer_type', typeFilter)
      }

      const { data, error } = await q
      if (error) throw error
      return data as Customer[]
    },
  })

  // Add customer mutation
  const addCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      const { error } = await supabase.from('customers').insert({
        ...data,
        email: data.email || null,
        phone: data.phone || null,
        gstin: data.gstin || null,
        created_by: user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      setModalOpen(false)
      resetForm()
    },
  })

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      billing_address: '',
      city: '',
      state: '',
      gstin: '',
      customer_type: 'retail',
      credit_limit: null,
      payment_terms: '',
      notes: '',
      is_active: true,
    })
    setFormErrors({})
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = customerSchema.safeParse(formData)
    if (!parsed.success) {
      const errMap: Record<string, string> = {}
      parsed.error.issues.forEach(issue => {
        errMap[issue.path[0] as string] = issue.message
      })
      setFormErrors(errMap)
      return
    }
    setFormErrors({})
    addCustomerMutation.mutate(parsed.data)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customers & Credit Accounts</h1>
          <p className="text-sm text-gray-500">Track customer details, wholesale accounts, and outstanding balances</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, phone, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Customer Types</option>
          <option value="retail">Retail Customers</option>
          <option value="wholesale">Wholesale / Mechanics</option>
          <option value="both">Both</option>
        </select>
      </div>

      {/* Customer List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Failed to load customer list.</span>
          </div>
        ) : !customers?.length ? (
          <div className="text-center py-16 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-gray-600">No customers found</p>
            <p className="text-xs text-gray-400 mt-1">Add regular mechanics or wholesale buyers to track credit.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Credit Limit</th>
                  <th className="py-3 px-4 text-right">Outstanding Balance</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    className="hover:bg-gray-50/80 cursor-pointer transition"
                  >
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-gray-900">{c.name}</p>
                      {c.city && <p className="text-xs text-gray-400">{c.city}, {c.state || ''}</p>}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600">
                      {c.phone ? (
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" /> {c.phone}</span>
                      ) : '—'}
                      {c.gstin && (
                        <p className="text-[11px] font-mono text-gray-500 mt-0.5">GST: {c.gstin}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-xs font-medium capitalize bg-gray-100 text-gray-700">
                        {c.customer_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-600">
                      {c.credit_limit ? formatCurrency(c.credit_limit) : 'No Limit'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold">
                      <span className={Number(c.outstanding_balance) > 0 ? 'text-red-600 font-bold' : 'text-gray-700'}>
                        {formatCurrency(c.outstanding_balance)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {c.is_active ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Active" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-gray-300" title="Inactive" />
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl my-8">
            <h3 className="text-lg font-bold text-gray-900">Add New Customer</h3>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Customer / Workshop Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Ramesh Auto Garage or Amit Kumar"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
                {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="10-digit mobile"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                  {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Type</label>
                  <select
                    value={formData.customer_type}
                    onChange={(e) => setFormData({ ...formData, customer_type: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="retail">Retail</option>
                    <option value="wholesale">Wholesale / Mechanic</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">GSTIN (Optional)</label>
                  <input
                    type="text"
                    maxLength={15}
                    value={formData.gstin || ''}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                    placeholder="15-character GSTIN"
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                  {formErrors.gstin && <p className="text-xs text-red-500 mt-1">{formErrors.gstin}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Credit Limit (₹)</label>
                  <input
                    type="number"
                    value={formData.credit_limit ?? ''}
                    onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value ? Number(e.target.value) : null })}
                    placeholder="Max credit allowed"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.billing_address || ''}
                  onChange={(e) => setFormData({ ...formData, billing_address: e.target.value })}
                  placeholder="Street / Area / Market"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <input
                  type="text"
                  value={formData.state || ''}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="State"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes / Terms</label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Payment terms, special vehicle models serviced..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => { setModalOpen(false); resetForm(); }}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addCustomerMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {addCustomerMutation.isPending ? 'Saving...' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
