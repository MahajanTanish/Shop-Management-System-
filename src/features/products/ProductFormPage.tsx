// src/features/products/ProductFormPage.tsx
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productSchema, type ProductFormData } from '@/schemas'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react'

export default function ProductFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const { data: product, isLoading: loadingProduct } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase.from('products').select('*').eq('id', id).single()
      if (error) throw error
      return data
    },
    enabled: isEdit,
  })

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').eq('is_active', true).order('name')
      return data ?? []
    },
  })

  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data } = await supabase.from('brands').select('*').eq('is_active', true).order('name')
      return data ?? []
    },
  })

  const { data: taxRates } = useQuery({
    queryKey: ['tax_rates'],
    queryFn: async () => {
      const { data } = await supabase.from('tax_rates').select('*').eq('is_active', true).order('rate')
      return data ?? []
    },
  })

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'active'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name')
      return data ?? []
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<any>({
    resolver: zodResolver(productSchema) as any,
    defaultValues: {
      unit_of_measurement: 'piece',
      reorder_threshold: 5,
      is_active: true,
    },
  })

  useEffect(() => {
    if (product) {
      reset({
        sku: product.sku,
        name: product.name,
        description: product.description ?? '',
        brand_id: product.brand_id ?? '',
        category_id: product.category_id ?? '',
        manufacturer_part_number: product.manufacturer_part_number ?? '',
        barcode: product.barcode ?? '',
        compatible_vehicles: product.compatible_vehicles ?? '',
        unit_of_measurement: product.unit_of_measurement,
        purchase_cost: product.purchase_cost,
        retail_price: product.retail_price,
        wholesale_price: product.wholesale_price,
        tax_rate_id: product.tax_rate_id ?? '',
        reorder_threshold: product.reorder_threshold,
        preferred_supplier_id: product.preferred_supplier_id ?? '',
        is_active: product.is_active,
      })
    }
  }, [product, reset])

  const saveMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const payload = {
        ...data,
        brand_id: data.brand_id || null,
        category_id: data.category_id || null,
        tax_rate_id: data.tax_rate_id || null,
        preferred_supplier_id: data.preferred_supplier_id || null,
        manufacturer_part_number: data.manufacturer_part_number || null,
        barcode: data.barcode || null,
        compatible_vehicles: data.compatible_vehicles || null,
        description: data.description || null,
      }

      if (isEdit && id) {
        const { error } = await supabase.from('products').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('products').insert({ ...payload, created_by: user?.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      navigate('/products')
    },
  })

  if (isEdit && loadingProduct) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  const Field = ({
    label, name, required, children, error,
  }: {
    label: string
    name: string
    required?: boolean
    children: React.ReactNode
    error?: any
  }) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error.message || String(error)}</p>}
    </div>
  )

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/products')}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Product' : 'Add New Product'}</h1>
          <p className="text-sm text-gray-500">
            {isEdit ? 'Update product details' : 'Add a new spare part to your catalogue'}
          </p>
        </div>
      </div>

      {saveMutation.error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">Failed to save product</p>
            <p className="text-sm text-red-600 mt-1">
              {(saveMutation.error as Error).message}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-5">
        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Product Name" name="name" required error={errors.name?.message}>
              <input id="name" {...register('name')} className={inputClass} placeholder="e.g. Brake Pad Set - Honda Activa" />
            </Field>
            <Field label="SKU / Product Code" name="sku" required error={errors.sku?.message}>
              <input id="sku" {...register('sku')} className={inputClass} placeholder="e.g. BP-HON-001" />
            </Field>
            <Field label="Brand" name="brand_id" error={errors.brand_id?.message}>
              <select id="brand_id" {...register('brand_id')} className={inputClass}>
                <option value="">— Select Brand —</option>
                {brands?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Category" name="category_id" error={errors.category_id?.message}>
              <select id="category_id" {...register('category_id')} className={inputClass}>
                <option value="">— Select Category —</option>
                {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Manufacturer Part Number" name="manufacturer_part_number" error={errors.manufacturer_part_number?.message}>
              <input id="manufacturer_part_number" {...register('manufacturer_part_number')} className={inputClass} placeholder="e.g. 06455-KVB-971" />
            </Field>
            <Field label="Barcode" name="barcode" error={errors.barcode?.message}>
              <input id="barcode" {...register('barcode')} className={inputClass} placeholder="EAN / UPC / QR" />
            </Field>
            <Field label="Unit of Measurement" name="unit_of_measurement" required error={errors.unit_of_measurement?.message}>
              <select id="unit_of_measurement" {...register('unit_of_measurement')} className={inputClass}>
                <option value="piece">Piece</option>
                <option value="set">Set</option>
                <option value="pair">Pair</option>
                <option value="litre">Litre</option>
                <option value="ml">mL</option>
                <option value="kg">kg</option>
                <option value="gram">gram</option>
                <option value="metre">Metre</option>
                <option value="box">Box</option>
                <option value="pack">Pack</option>
              </select>
            </Field>
            <Field label="Compatible Vehicles" name="compatible_vehicles" error={errors.compatible_vehicles?.message}>
              <input id="compatible_vehicles" {...register('compatible_vehicles')} className={inputClass} placeholder="e.g. Honda Activa, TVS Jupiter" />
            </Field>
          </div>
          <Field label="Description" name="description" error={errors.description?.message}>
            <textarea id="description" {...register('description')} rows={2} className={inputClass} placeholder="Optional product description" />
          </Field>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Pricing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Purchase Cost (₹)" name="purchase_cost" required error={errors.purchase_cost?.message}>
              <input id="purchase_cost" type="number" step="0.01" min="0" {...register('purchase_cost')} className={inputClass} placeholder="0.00" />
            </Field>
            <Field label="Retail Price (₹)" name="retail_price" required error={errors.retail_price?.message}>
              <input id="retail_price" type="number" step="0.01" min="0" {...register('retail_price')} className={inputClass} placeholder="0.00" />
            </Field>
            <Field label="Wholesale Price (₹)" name="wholesale_price" required error={errors.wholesale_price?.message}>
              <input id="wholesale_price" type="number" step="0.01" min="0" {...register('wholesale_price')} className={inputClass} placeholder="0.00" />
            </Field>
          </div>
        </div>

        {/* Tax & Stock */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Tax & Inventory</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Tax Rate (GST)" name="tax_rate_id" error={errors.tax_rate_id?.message}>
              <select id="tax_rate_id" {...register('tax_rate_id')} className={inputClass}>
                <option value="">— Select Tax Rate —</option>
                {taxRates?.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
                ))}
              </select>
            </Field>
            <Field label="Reorder Threshold" name="reorder_threshold" error={errors.reorder_threshold?.message}>
              <input id="reorder_threshold" type="number" min="0" {...register('reorder_threshold')} className={inputClass} />
            </Field>
            <Field label="Preferred Supplier" name="preferred_supplier_id" error={errors.preferred_supplier_id?.message}>
              <select id="preferred_supplier_id" {...register('preferred_supplier_id')} className={inputClass}>
                <option value="">— Select Supplier —</option>
                {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="is_active"
              type="checkbox"
              {...register('is_active')}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">Product is active (available for sale)</label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/products')}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {(isSubmitting || saveMutation.isPending) ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isEdit ? 'Save Changes' : 'Add Product'}
          </button>
        </div>
      </form>
    </div>
  )
}
