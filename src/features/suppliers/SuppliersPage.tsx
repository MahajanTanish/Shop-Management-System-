import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { supplierSchema, type SupplierFormData } from '@/schemas'
import { useAuth } from '@/features/auth/AuthContext'
import type { Supplier } from '@/types/database'
import {
  Building2, Plus, Search, Phone, Mail, MapPin, AlertCircle,
  Loader2, Edit, CheckCircle2, ChevronRight
} from 'lucide-react'

export default function SuppliersPage() {
  const qc = useQueryClient()
  const { isOwner, isManager } = useAuth()

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<SupplierFormData>({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    gstin: '',
    pan: '',
    payment_terms: '',
    is_active: true,
  })

  // Fetch suppliers
  const { data: suppliers, isLoading, error } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: async () => {
      let q = supabase
        .from('suppliers')
        .select('*')
        .order('name')

      if (search) {
        q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,gstin.ilike.%${search}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as Supplier[]
    },
  })

  // Save supplier mutation
  const saveSupplierMutation = useMutation({
    mutationFn: async (data: SupplierFormData) => {
      const payload = {
        ...data,
        contact_person: data.contact_person || null,
        email: data.email || null,
        phone: data.phone || null,
        gstin: data.gstin || null,
        pan: data.pan || null,
      }

      if (editingSupplier) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('suppliers').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      setModalOpen(false)
      resetForm()
    },
  })

  const resetForm = () => {
    setEditingSupplier(null)
    setFormData({
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      gstin: '',
      pan: '',
      payment_terms: '',
      is_active: true,
    })
    setFormErrors({})
  }

  const handleEdit = (sup: Supplier) => {
    setEditingSupplier(sup)
    setFormData({
      name: sup.name,
      contact_person: sup.contact_person || '',
      phone: sup.phone || '',
      email: sup.email || '',
      address: sup.address || '',
      city: sup.city || '',
      state: sup.state || '',
      gstin: sup.gstin || '',
      pan: sup.pan || '',
      payment_terms: sup.payment_terms || '',
      is_active: sup.is_active,
    })
    setModalOpen(true)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = supplierSchema.safeParse(formData)
    if (!parsed.success) {
      const errMap: Record<string, string> = {}
      parsed.error.issues.forEach(issue => {
        errMap[issue.path[0] as string] = issue.message
      })
      setFormErrors(errMap)
      return
    }
    setFormErrors({})
    saveSupplierMutation.mutate(parsed.data)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Parts Suppliers & Distributors</h1>
          <p className="text-sm text-gray-500">Manage spare parts vendors, payment terms, and GSTIN records</p>
        </div>
        {(isOwner || isManager) && (
          <button
            onClick={() => { resetForm(); setModalOpen(true); }}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Add Supplier
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search suppliers by name, phone, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Supplier List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Failed to load suppliers.</span>
          </div>
        ) : !suppliers?.length ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-gray-600">No suppliers listed</p>
            <p className="text-xs text-gray-400 mt-1">Add your spare parts distributors and wholesale vendors.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="py-3 px-4">Supplier / Vendor</th>
                  <th className="py-3 px-4">Contact Details</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">GSTIN / Tax ID</th>
                  <th className="py-3 px-4 text-right">Outstanding Payable</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {(isOwner || isManager) && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/80 transition">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-gray-900">{s.name}</p>
                      {s.contact_person && <p className="text-xs text-gray-500">Contact: {s.contact_person}</p>}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600">
                      {s.phone ? (
                        <p className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" /> {s.phone}</p>
                      ) : '—'}
                      {s.email && <p className="text-gray-400">{s.email}</p>}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600">
                      {s.city ? `${s.city}, ${s.state || ''}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-700">
                      {s.gstin || 'Unregistered'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold">
                      <span className={Number(s.outstanding_balance) > 0 ? 'text-amber-600' : 'text-gray-700'}>
                        {formatCurrency(s.outstanding_balance)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {s.is_active ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Inactive</span>
                      )}
                    </td>
                    {(isOwner || isManager) && (
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleEdit(s)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Edit Supplier"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl my-8">
            <h3 className="text-lg font-bold text-gray-900">
              {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </h3>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Company / Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Minda Auto Corporation"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
                {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={formData.contact_person || ''}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    placeholder="Name of agent / manager"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Contact number"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                  {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">GSTIN</label>
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">PAN Number</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={formData.pan || ''}
                    onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                    placeholder="10-digit PAN"
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                  {formErrors.pan && <p className="text-xs text-red-500 mt-1">{formErrors.pan}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Address / Warehouse</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street / Godown location"
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Terms</label>
                <input
                  type="text"
                  value={formData.payment_terms || ''}
                  onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                  placeholder="e.g. Net 30, 50% advance, COD"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sup_is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300"
                />
                <label htmlFor="sup_is_active" className="text-xs text-gray-700 font-medium">Supplier is active</label>
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
                  disabled={saveSupplierMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saveSupplierMutation.isPending ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
