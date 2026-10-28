// src/features/products/ProductImportModal.tsx
import React, { useState, useRef } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Info,
  Check,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { formatCurrency } from '@/lib/utils'

interface ProductImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ParsedProductRow {
  rowIndex: number
  sku: string
  name: string
  description?: string
  categoryName?: string
  brandName?: string
  manufacturerPartNumber?: string
  barcode?: string
  compatibleVehicles?: string
  unitOfMeasurement: string
  purchaseCost: number
  retailPrice: number
  wholesalePrice: number
  initialStock: number
  reorderThreshold: number
  taxRatePercent?: number
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export default function ProductImportModal({ isOpen, onClose, onSuccess }: ProductImportModalProps) {
  const { user, role } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload')
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([])
  const [updateExisting, setUpdateExisting] = useState(true)
  const [autoCreateCategories, setAutoCreateCategories] = useState(true)
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'invalid'>('all')

  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, status: '' })
  const [copiedSql, setCopiedSql] = useState(false)
  const [importResult, setImportResult] = useState({
    added: 0,
    updated: 0,
    stockUpdated: 0,
    failed: 0,
    errors: [] as string[],
  })

  if (!isOpen) return null

  // Reset state on close
  const handleClose = () => {
    setStep('upload')
    setFileName('')
    setFileSize('')
    setParsedRows([])
    setImportResult({ added: 0, updated: 0, stockUpdated: 0, failed: 0, errors: [] })
    onClose()
  }

  // ─── 1. Download Sample CSV Template ───────────────────────────────────────
  const downloadSampleTemplate = (format: 'csv' | 'xlsx' = 'csv') => {
    const templateData = [
      {
        'SKU *': 'VSW-ACT-001',
        'Product Name *': 'Front Brake Shoe Set',
        'Description': 'Premium ceramic front brake shoe assembly',
        'Category': 'Braking System',
        'Brand': 'Brembo',
        'Manufacturer Part Number': 'MPN-BRK-001',
        'Barcode': '890123456701',
        'Compatible Vehicles': 'Activa 3G, Activa 4G, Activa 5G, Activa 6G',
        'Unit of Measurement': 'set',
        'Purchase Cost': 180.0,
        'Retail Price *': 280.0,
        'Wholesale Price': 230.0,
        'Initial Stock': 25,
        'Reorder Threshold': 5,
        'Tax Rate (%)': 18,
      },
      {
        'SKU *': 'VSW-JUP-002',
        'Product Name *': 'Heavy Duty CVT Drive Belt',
        'Description': 'Reinforced Kevlar timing and drive belt',
        'Category': 'Transmission',
        'Brand': 'Bando',
        'Manufacturer Part Number': 'MPN-BELT-09',
        'Barcode': '890123456702',
        'Compatible Vehicles': 'Jupiter 110, Wego',
        'Unit of Measurement': 'piece',
        'Purchase Cost': 320.0,
        'Retail Price *': 520.0,
        'Wholesale Price': 440.0,
        'Initial Stock': 15,
        'Reorder Threshold': 3,
        'Tax Rate (%)': 18,
      },
      {
        'SKU *': 'VSW-PUL-003',
        'Product Name *': 'Spark Plug CPR8EA-9',
        'Description': 'High performance nickel spark plug',
        'Category': 'Electrical',
        'Brand': 'NGK',
        'Manufacturer Part Number': 'CPR8EA-9',
        'Barcode': '890123456703',
        'Compatible Vehicles': 'Pulsar 150/180/220, Apache RTR',
        'Unit of Measurement': 'piece',
        'Purchase Cost': 95.0,
        'Retail Price *': 160.0,
        'Wholesale Price': 130.0,
        'Initial Stock': 50,
        'Reorder Threshold': 10,
        'Tax Rate (%)': 18,
      },
    ]

    if (format === 'csv') {
      const csv = Papa.unparse(templateData)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'products_import_template.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      const ws = XLSX.utils.json_to_sheet(templateData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Products Template')
      XLSX.writeFile(wb, 'products_import_template.xlsx')
    }
  }

  // ─── 2. Parsing & Mapping ──────────────────────────────────────────────────
  const cleanKey = (key: string) =>
    key
      .toLowerCase()
      .replace(/[*()]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/^_+|_+$/g, '')

  const normalizeRow = (raw: Record<string, any>, rowIndex: number): ParsedProductRow => {
    const map: Record<string, any> = {}
    for (const [k, v] of Object.entries(raw)) {
      map[cleanKey(k)] = v
    }

    const sku = String(
      map.sku || map.item_code || map.code || map.part_sku || map.product_sku || map.part_number || ''
    ).trim()

    const name = String(
      map.product_name || map.name || map.item_name || map.part_name || map.title || ''
    ).trim()

    const description = String(map.description || map.desc || map.details || '').trim() || undefined
    const categoryName = String(map.category || map.category_name || map.group || '').trim() || undefined
    const brandName = String(map.brand || map.brand_name || map.make || map.manufacturer || '').trim() || undefined
    const manufacturerPartNumber = String(
      map.manufacturer_part_number || map.mpn || map.mfg_part_no || ''
    ).trim() || undefined
    const barcode = String(map.barcode || map.upc || map.ean || '').trim() || undefined
    const compatibleVehicles = String(
      map.compatible_vehicles || map.vehicles || map.models || map.compatibility || ''
    ).trim() || undefined

    const unitOfMeasurement = String(
      map.unit_of_measurement || map.unit || map.uom || 'piece'
    ).trim().toLowerCase() || 'piece'

    const parseNum = (val: any, defaultVal = 0) => {
      if (val === undefined || val === null || val === '') return defaultVal
      const cleaned = String(val).replace(/[^0-9.-]/g, '')
      const n = parseFloat(cleaned)
      return isNaN(n) ? defaultVal : n
    }

    const purchaseCost = parseNum(map.purchase_cost || map.cost || map.buy_price || map.cost_price, 0)
    const retailPrice = parseNum(map.retail_price || map.price || map.mrp || map.selling_price, 0)
    const wholesalePrice = parseNum(
      map.wholesale_price || map.trade_price || map.dealer_price,
      retailPrice > 0 ? retailPrice : purchaseCost
    )
    const initialStock = Math.max(0, parseNum(map.initial_stock || map.stock || map.opening_stock || map.qty, 0))
    const reorderThreshold = Math.max(0, Math.floor(parseNum(map.reorder_threshold || map.min_stock || 5, 5)))
    const taxRatePercent = map.tax_rate || map.tax_rate_percent || map.gst || map.gst_rate
      ? parseNum(map.tax_rate || map.tax_rate_percent || map.gst || map.gst_rate)
      : undefined

    const errors: string[] = []
    const warnings: string[] = []

    if (!sku) errors.push('Missing SKU')
    if (!name) errors.push('Missing Product Name')
    if (retailPrice < 0) errors.push('Invalid Retail Price')
    if (purchaseCost < 0) errors.push('Invalid Purchase Cost')
    if (retailPrice > 0 && purchaseCost > retailPrice) {
      warnings.push('Purchase cost is higher than retail price')
    }

    return {
      rowIndex,
      sku,
      name,
      description,
      categoryName,
      brandName,
      manufacturerPartNumber,
      barcode,
      compatibleVehicles,
      unitOfMeasurement,
      purchaseCost,
      retailPrice,
      wholesalePrice,
      initialStock,
      reorderThreshold,
      taxRatePercent,
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  const handleFileUpload = (file: File) => {
    setFileName(file.name)
    setFileSize((file.size / 1024).toFixed(1) + ' KB')

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

    if (isExcel) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const rawData: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })
          const rows = rawData
            .filter((r) => Object.values(r).some((v) => String(v).trim().length > 0))
            .map((r, i) => normalizeRow(r, i + 1))
          setParsedRows(rows)
          setStep('preview')
        } catch (err: any) {
          alert('Failed to parse Excel file: ' + (err.message || 'Unknown error'))
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = (results.data as Record<string, any>[])
            .filter((r) => Object.values(r).some((v) => String(v).trim().length > 0))
            .map((r, i) => normalizeRow(r, i + 1))
          setParsedRows(rows)
          setStep('preview')
        },
        error: (err) => {
          alert('Failed to parse CSV file: ' + err.message)
        },
      })
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  // ─── 3. Import Execution ───────────────────────────────────────────────────
  const runImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid)
    if (validRows.length === 0) {
      alert('No valid rows found to import.')
      return
    }

    setStep('importing')
    setImportProgress({ current: 0, total: validRows.length, status: 'Preparing references...' })

    let addedCount = 0
    let updatedCount = 0
    let stockUpdatedCount = 0
    let failedCount = 0
    const failureErrors: string[] = []

    try {
      // 1. Fetch categories, brands, and tax rates
      const [{ data: dbCats }, { data: dbBrands }, { data: dbTaxes }] = await Promise.all([
        supabase.from('categories').select('id, name'),
        supabase.from('brands').select('id, name'),
        supabase.from('tax_rates').select('id, name, rate'),
      ])

      const categoryMap = new Map<string, string>()
      ;(dbCats || []).forEach((c) => categoryMap.set(c.name.toLowerCase().trim(), c.id))

      const brandMap = new Map<string, string>()
      ;(dbBrands || []).forEach((b) => brandMap.set(b.name.toLowerCase().trim(), b.id))

      const taxRateMap = new Map<number, string>()
      ;(dbTaxes || []).forEach((t) => taxRateMap.set(Number(t.rate), t.id))

      // 2. Auto-create missing categories and brands if requested
      if (autoCreateCategories) {
        setImportProgress({ current: 0, total: validRows.length, status: 'Resolving categories & brands...' })

        const uniqueCats = Array.from(
          new Set(validRows.map((r) => r.categoryName).filter((c): c is string => !!c))
        )
        for (const catName of uniqueCats) {
          const norm = catName.toLowerCase().trim()
          if (!categoryMap.has(norm)) {
            const { data: newCat, error } = await supabase
              .from('categories')
              .insert({ name: catName })
              .select('id, name')
              .single()
            if (!error && newCat) {
              categoryMap.set(norm, newCat.id)
            }
          }
        }

        const uniqueBrands = Array.from(
          new Set(validRows.map((r) => r.brandName).filter((b): b is string => !!b))
        )
        for (const brandName of uniqueBrands) {
          const norm = brandName.toLowerCase().trim()
          if (!brandMap.has(norm)) {
            const { data: newBrand, error } = await supabase
              .from('brands')
              .insert({ name: brandName })
              .select('id, name')
              .single()
            if (!error && newBrand) {
              brandMap.set(norm, newBrand.id)
            }
          }
        }
      }

      // 3. Process products in batches of 10
      const batchSize = 10
      for (let i = 0; i < validRows.length; i += batchSize) {
        const chunk = validRows.slice(i, i + batchSize)
        setImportProgress({
          current: Math.min(i + batchSize, validRows.length),
          total: validRows.length,
          status: `Importing records ${i + 1} to ${Math.min(i + batchSize, validRows.length)}...`,
        })

        for (const row of chunk) {
          try {
            const catId = row.categoryName ? categoryMap.get(row.categoryName.toLowerCase().trim()) || null : null
            const brandId = row.brandName ? brandMap.get(row.brandName.toLowerCase().trim()) || null : null
            const taxId = row.taxRatePercent !== undefined ? taxRateMap.get(row.taxRatePercent) || null : null

            // Check if product with this SKU exists
            const { data: existingProduct } = await supabase
              .from('products')
              .select('id, sku')
              .eq('sku', row.sku)
              .maybeSingle()

            let productId = existingProduct?.id

            const payload: any = {
              sku: row.sku,
              name: row.name,
              description: row.description || null,
              category_id: catId,
              brand_id: brandId,
              manufacturer_part_number: row.manufacturerPartNumber || null,
              barcode: row.barcode || null,
              compatible_vehicles: row.compatibleVehicles || null,
              unit_of_measurement: row.unitOfMeasurement || 'piece',
              purchase_cost: row.purchaseCost,
              retail_price: row.retailPrice,
              wholesale_price: row.wholesalePrice,
              reorder_threshold: row.reorderThreshold,
              tax_rate_id: taxId,
              is_active: true,
              updated_at: new Date().toISOString(),
            }

            if (existingProduct) {
              if (updateExisting) {
                const { error: updErr } = await supabase
                  .from('products')
                  .update(payload)
                  .eq('id', existingProduct.id)
                if (updErr) throw updErr
                updatedCount++
              }
            } else {
              payload.created_by = user?.id || null
              const { data: inserted, error: insErr } = await supabase
                .from('products')
                .insert(payload)
                .select('id')
                .single()
              if (insErr) throw insErr
              productId = inserted.id
              addedCount++
            }

            // 4. Handle initial stock if specified and productId exists
            if (productId && row.initialStock > 0) {
              // Wait slightly for on_product_created trigger or find existing balance
              const { data: sb } = await supabase
                .from('stock_balances')
                .select('id, quantity')
                .eq('product_id', productId)
                .maybeSingle()

              if (sb) {
                const qtyBefore = Number(sb.quantity) || 0
                // If it was newly inserted or balance is 0, update to initialStock
                if (qtyBefore === 0) {
                  const qtyChange = row.initialStock
                  const qtyAfter = qtyChange

                  await supabase.from('stock_movements').insert({
                    product_id: productId,
                    movement_type: 'opening_stock',
                    quantity_change: qtyChange,
                    quantity_before: 0,
                    quantity_after: qtyAfter,
                    reference_type: 'opening_stock',
                    reference_id: null,
                    reason: 'Bulk CSV/Excel catalogue import',
                    actor_id: user?.id || null,
                  })

                  await supabase
                    .from('stock_balances')
                    .update({ quantity: qtyAfter, last_updated: new Date().toISOString() })
                    .eq('id', sb.id)

                  stockUpdatedCount++
                }
              }
            }
          } catch (rowErr: any) {
            failedCount++
            failureErrors.push(`Row ${row.rowIndex} (${row.sku}): ${rowErr.message || 'Failed'}`)
          }
        }
      }

      // 5. Record import batch
      try {
        await supabase.from('import_batches').insert({
          import_type: 'products',
          file_name: fileName || 'products_import.csv',
          total_rows: parsedRows.length,
          imported_rows: addedCount + updatedCount,
          error_rows: failedCount + parsedRows.filter((r) => !r.isValid).length,
          status: 'completed',
          summary: {
            added: addedCount,
            updated: updatedCount,
            stockUpdated: stockUpdatedCount,
            errors: failureErrors.slice(0, 20),
          },
          created_by: user?.id || null,
          completed_at: new Date().toISOString(),
        })
      } catch (logErr) {
        console.warn('Could not log import batch:', logErr)
      }

      setImportResult({
        added: addedCount,
        updated: updatedCount,
        stockUpdated: stockUpdatedCount,
        failed: failedCount,
        errors: failureErrors,
      })
      setStep('complete')
      onSuccess()
    } catch (generalErr: any) {
      alert('Import encountered an error: ' + (generalErr.message || 'Unknown error'))
      setStep('preview')
    }
  }

  const validCount = parsedRows.filter((r) => r.isValid).length
  const invalidCount = parsedRows.filter((r) => !r.isValid).length
  const displayedRows =
    filterTab === 'valid'
      ? parsedRows.filter((r) => r.isValid)
      : filterTab === 'invalid'
      ? parsedRows.filter((r) => !r.isValid)
      : parsedRows

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Import Products Catalogue</h2>
              <p className="text-xs text-gray-500">Bulk upload spare parts via CSV or Excel (.xlsx)</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Template Download Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-lg mt-0.5">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Need the standard spreadsheet format?</h4>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Download our pre-formatted template with column definitions and sample spare parts data.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate('csv')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV Template
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate('xlsx')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" /> Excel (.xlsx)
                  </button>
                </div>
              </div>

              {/* Drag & Drop Area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-blue-500 bg-gray-50/50 hover:bg-blue-50/20 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  accept=".csv, .xlsx, .xls"
                  className="hidden"
                />
                <div className="p-4 bg-white shadow-md text-blue-600 rounded-full group-hover:scale-110 transition duration-200">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mt-4">
                  Click to browse or drag and drop your file here
                </h3>
                <p className="text-xs text-gray-500 mt-1">Supports CSV, Microsoft Excel (.xlsx, .xls) up to 10MB</p>
                <span className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 shadow-xs">
                  Supported columns: SKU, Name, Price, Cost, Stock, Category, Brand, etc.
                </span>
              </div>

              {/* Instructions Guide */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-600" /> Important Guidelines for Two-Wheeler Spare Parts:
                </h4>
                <ul className="text-xs text-gray-600 mt-2 space-y-1.5 list-disc list-inside">
                  <li>
                    <strong>Required fields:</strong> <code className="text-blue-600">SKU</code> and{' '}
                    <code className="text-blue-600">Product Name</code> are strictly mandatory for each row.
                  </li>
                  <li>
                    <strong>Vehicles:</strong> Use comma-separated model names (e.g.,{' '}
                    <em>"Activa 3G/4G, Jupiter, Pulsar 150"</em>) in Compatible Vehicles column.
                  </li>
                  <li>
                    <strong>Initial Stock:</strong> If provided and &gt; 0, will automatically initialize the product's
                    ledger balance with an auditable <em>opening_stock</em> movement.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW & VALIDATION */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* File Info & Stats Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-gray-200 rounded-xl gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{fileName}</p>
                    <p className="text-xs text-gray-500">{fileSize} • {parsedRows.length} total rows detected</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('upload')
                      setParsedRows([])
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Choose another file
                  </button>
                </div>
              </div>

              {/* Status Counters */}
              <div className="grid grid-cols-3 gap-3">
                <div
                  onClick={() => setFilterTab('all')}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    filterTab === 'all'
                      ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-100'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <p className="text-xs text-gray-500 font-medium">Total Rows</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{parsedRows.length}</p>
                </div>

                <div
                  onClick={() => setFilterTab('valid')}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    filterTab === 'valid'
                      ? 'border-green-500 bg-green-50/40 ring-2 ring-green-100'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-green-700 font-medium">Ready to Import</p>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-xl font-bold text-green-700 mt-0.5">{validCount}</p>
                </div>

                <div
                  onClick={() => setFilterTab('invalid')}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    filterTab === 'invalid'
                      ? 'border-red-500 bg-red-50/40 ring-2 ring-red-100'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-red-600 font-medium">Errors / Missing</p>
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                  <p className="text-xl font-bold text-red-600 mt-0.5">{invalidCount}</p>
                </div>
              </div>

              {/* Options */}
              <div className="bg-gray-50/70 p-3.5 rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center gap-4 text-xs text-gray-700">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span>
                    Update existing products if <strong>SKU</strong> already exists
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoCreateCategories}
                    onChange={(e) => setAutoCreateCategories(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span>Auto-create missing categories and brands</span>
                </label>
              </div>

              {/* Preview Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 text-gray-600">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold w-16">Row</th>
                        <th className="py-2.5 px-3 font-semibold">SKU</th>
                        <th className="py-2.5 px-3 font-semibold">Product Name</th>
                        <th className="py-2.5 px-3 font-semibold">Category</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Cost</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Retail Price</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Opening Stock</th>
                        <th className="py-2.5 px-3 font-semibold text-center w-24">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-gray-400">
                            No rows matching this filter
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((r) => (
                          <tr
                            key={r.rowIndex}
                            className={`hover:bg-gray-50/80 transition ${
                              !r.isValid ? 'bg-red-50/30' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-gray-400 font-mono">#{r.rowIndex}</td>
                            <td className="py-2 px-3 font-mono font-medium text-gray-800">
                              {r.sku || <span className="text-red-500 italic">Empty</span>}
                            </td>
                            <td className="py-2 px-3 font-medium text-gray-900 max-w-[200px] truncate" title={r.name}>
                              {r.name || <span className="text-red-500 italic">Empty</span>}
                            </td>
                            <td className="py-2 px-3 text-gray-500">{r.categoryName || '—'}</td>
                            <td className="py-2 px-3 text-right text-gray-700">{formatCurrency(r.purchaseCost)}</td>
                            <td className="py-2 px-3 text-right font-medium text-gray-900">
                              {formatCurrency(r.retailPrice)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className="font-semibold text-blue-700">{r.initialStock}</span>{' '}
                              <span className="text-gray-400 text-[10px]">{r.unitOfMeasurement}</span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {r.isValid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
                                  <Check className="w-3 h-3" /> Ready
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700 cursor-help"
                                  title={r.errors.join(', ')}
                                >
                                  <AlertCircle className="w-3 h-3" /> Error
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: IMPORTING PROGRESS */}
          {step === 'importing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Importing catalogue into database...</h3>
              <p className="text-xs text-gray-500 max-w-sm">{importProgress.status}</p>

              <div className="w-full max-w-md bg-gray-100 rounded-full h-3 overflow-hidden mt-2">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      importProgress.total > 0
                        ? Math.round((importProgress.current / importProgress.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs font-mono text-gray-500">
                {importProgress.current} / {importProgress.total} products processed
              </p>
            </div>
          )}

          {/* STEP 4: COMPLETE */}
          {step === 'complete' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="p-3 bg-green-100 text-green-600 rounded-2xl shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Import Process Completed!</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Catalogue items and ledger balances have been synchronized.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-lg mt-2">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-[11px] text-gray-500">New Added</p>
                  <p className="text-lg font-bold text-green-600">{importResult.added}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-[11px] text-gray-500">Updated</p>
                  <p className="text-lg font-bold text-blue-600">{importResult.updated}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-[11px] text-gray-500">Stock Set</p>
                  <p className="text-lg font-bold text-indigo-600">{importResult.stockUpdated}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-[11px] text-gray-500">Failed / Skipped</p>
                  <p className="text-lg font-bold text-gray-600">
                    {importResult.failed + parsedRows.filter((r) => !r.isValid).length}
                  </p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="w-full max-w-lg text-left bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 max-h-32 overflow-y-auto">
                  <p className="font-semibold mb-1">Errors logged during processing:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.errors.some(
                (e) =>
                  e.toLowerCase().includes('row-level security') ||
                  e.toLowerCase().includes('policy') ||
                  e.toLowerCase().includes('permission') ||
                  e.toLowerCase().includes('stock_balances')
              ) && (
                <div className="w-full max-w-lg p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl text-xs space-y-2.5 text-left">
                  <div className="flex items-start gap-2.5 text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Database Setup Required (stock_balances / profiles)</p>
                      <p className="text-amber-800 mt-0.5 leading-relaxed">
                        Supabase requires the <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">initialize_stock_balance</code> trigger to run with <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">SECURITY DEFINER</code> so new catalogue items can automatically initialize their inventory ledger.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const sql = `-- Fix stock_balances trigger & profiles permissions
CREATE OR REPLACE FUNCTION initialize_stock_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.stock_balances (product_id, quantity)
    VALUES (NEW.id, 0)
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'stock_balances' AND policyname = 'stock_balances_insert'
    ) THEN
        CREATE POLICY "stock_balances_insert" 
            ON public.stock_balances FOR INSERT 
            WITH CHECK (is_authenticated());
    END IF;
END $$;

INSERT INTO public.profiles (id, role, full_name)
SELECT id, 'owner'::user_role, COALESCE(raw_user_meta_data->>'full_name', email, 'Store Owner')
FROM auth.users
ON CONFLICT (id) DO UPDATE SET role = 'owner';`
                        navigator.clipboard.writeText(sql)
                        setCopiedSql(true)
                        setTimeout(() => setCopiedSql(false), 2500)
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition shadow-xs cursor-pointer"
                    >
                      {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedSql ? 'SQL Copied!' : 'Copy SQL Fix'}
                    </button>

                    <a
                      href="https://supabase.com/dashboard/project/etmjvriuvgrsdffexaxh/sql/new"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-50 text-amber-900 rounded-lg text-xs font-medium transition shadow-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open Supabase SQL Editor
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between">
          {step === 'upload' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-xs"
              >
                <Upload className="w-4 h-4" /> Select File
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition"
              >
                Back
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 hidden sm:inline">
                  {validCount} ready to commit
                </span>
                <button
                  type="button"
                  disabled={validCount === 0}
                  onClick={runImport}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-xs"
                >
                  Confirm & Import ({validCount}) <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 'complete' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-xs"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
