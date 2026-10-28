import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { businessSettingsSchema, type BusinessSettingsFormData } from '@/schemas'
import { useAuth } from '@/features/auth/AuthContext'
import type { BusinessSettings } from '@/types/database'
import {
  Settings, Save, Building2, AlertTriangle, CheckCircle2,
  Loader2, CreditCard, FileText, Phone, Mail, MapPin, ShieldAlert
} from 'lucide-react'

export default function SettingsPage() {
  const qc = useQueryClient()
  const { isOwner, user } = useAuth()
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [formData, setFormData] = useState<BusinessSettingsFormData>({
    business_name: 'Ved Scooter Works',
    legal_name: '',
    address: '',
    city: '',
    state: '',
    pin_code: '',
    gstin: '',
    pan: '',
    phone: '',
    email: '',
    website: '',
    invoice_prefix: 'VSW',
    gst_registered: false,
    bank_name: '',
    bank_account_number: '',
    bank_ifsc: '',
    bank_branch: '',
    invoice_footer_note: '',
  })

  // Fetch current business settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['business_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('business_settings').select('*').limit(1).single()
      if (error && error.code !== 'PGRST116') throw error
      return data as BusinessSettings | null
    },
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        business_name: settings.business_name || 'Ved Scooter Works',
        legal_name: settings.legal_name || '',
        address: settings.address || '',
        city: settings.city || '',
        state: settings.state || '',
        pin_code: settings.pin_code || '',
        gstin: settings.gstin || '',
        pan: settings.pan || '',
        phone: settings.phone || '',
        email: settings.email || '',
        website: settings.website || '',
        invoice_prefix: settings.invoice_prefix || 'VSW',
        gst_registered: settings.gst_registered ?? false,
        bank_name: settings.bank_name || '',
        bank_account_number: settings.bank_account_number || '',
        bank_ifsc: settings.bank_ifsc || '',
        bank_branch: settings.bank_branch || '',
        invoice_footer_note: settings.invoice_footer_note || '',
      })
    }
  }, [settings])

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: BusinessSettingsFormData) => {
      if (!isOwner) throw new Error('Only the owner can update business settings')

      const payload = {
        ...data,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      }

      if (settings?.id) {
        const { error } = await supabase.from('business_settings').update(payload).eq('id', settings.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('business_settings').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business_settings'] })
      setSuccessMsg('Business settings saved successfully')
      setTimeout(() => setSuccessMsg(null), 3000)
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    const parsed = businessSettingsSchema.safeParse(formData)
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Validation failed')
      return
    }
    saveMutation.mutate(parsed.data)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Business Settings & Shop Profile</h1>
        <p className="text-sm text-gray-500">Configure business identity, legal GST details, invoice branding, and bank accounts</p>
      </div>

      {/* Mandatory Tax Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-sm text-amber-800">Compliance & Legal Decisions Note</p>
          <p>
            The registered legal name, GSTIN status, applicable HSN tax rates, and invoice numbering scheme must be formally confirmed by a qualified accountant before issuing legally compliant GST tax invoices to customers.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Identity */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Business Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Trade / Shop Name *</label>
              <input
                type="text"
                required
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Registered Legal Entity Name</label>
              <input
                type="text"
                placeholder="If different from trade name"
                value={formData.legal_name || ''}
                onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Shop Address</label>
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="City"
              value={formData.city || ''}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="text"
              placeholder="State"
              value={formData.state || ''}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="text"
              placeholder="PIN Code"
              value={formData.pin_code || ''}
              onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        {/* GST & Tax Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">GST & Taxation</h2>

          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="gst_reg"
              checked={formData.gst_registered}
              onChange={(e) => setFormData({ ...formData, gst_registered: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="gst_reg" className="text-sm font-medium text-gray-800">
              Business is registered under Goods and Services Tax (GST)
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">GSTIN Number</label>
              <input
                type="text"
                maxLength={15}
                placeholder="15-character GSTIN"
                value={formData.gstin || ''}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">PAN Number</label>
              <input
                type="text"
                maxLength={10}
                placeholder="10-digit PAN"
                value={formData.pan || ''}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono uppercase"
              />
            </div>
          </div>
        </div>

        {/* Invoice & Bank Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Invoice & Bank Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Invoice Prefix *</label>
              <input
                type="text"
                required
                maxLength={8}
                value={formData.invoice_prefix}
                onChange={(e) => setFormData({ ...formData, invoice_prefix: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono font-bold"
              />
              <p className="text-[11px] text-gray-400 mt-1">Invoices will format as {formData.invoice_prefix}-00001</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Bank Name</label>
              <input
                type="text"
                placeholder="e.g. State Bank of India / HDFC"
                value={formData.bank_name || ''}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Bank Account Number</label>
              <input
                type="text"
                placeholder="Account number for wire transfer"
                value={formData.bank_account_number || ''}
                onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">IFSC Code</label>
              <input
                type="text"
                placeholder="e.g. SBIN0001234"
                value={formData.bank_ifsc || ''}
                onChange={(e) => setFormData({ ...formData, bank_ifsc: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Invoice Footer Note / Terms</label>
            <textarea
              rows={2}
              value={formData.invoice_footer_note || ''}
              onChange={(e) => setFormData({ ...formData, invoice_footer_note: e.target.value })}
              placeholder="e.g. Goods once sold will not be taken back after 7 days."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pb-8">
          <button
            type="submit"
            disabled={saveMutation.isPending || !isOwner}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Business Settings
          </button>
        </div>
      </form>
    </div>
  )
}
