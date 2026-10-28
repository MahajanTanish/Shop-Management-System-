// tests/unit/import-export.test.ts
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'

describe('Product Catalogue Import / Export Helpers', () => {
  it('parses valid CSV rows with PapaParse', () => {
    const csvContent = `SKU,Product Name,Purchase Cost,Retail Price,Initial Stock
VSW-001,Front Brake Shoe,150,250,20
VSW-002,Clutch Plate,300,500,10`

    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true })
    expect(parsed.data).toHaveLength(2)

    const row1 = parsed.data[0] as any
    expect(row1['SKU']).toBe('VSW-001')
    expect(row1['Product Name']).toBe('Front Brake Shoe')
    expect(Number(row1['Purchase Cost'])).toBe(150)
    expect(Number(row1['Retail Price'])).toBe(250)
    expect(Number(row1['Initial Stock'])).toBe(20)
  })

  it('correctly unparses and formats export CSV', () => {
    const productsToExport = [
      {
        'SKU': 'VSW-001',
        'Product Name': 'Front Brake Shoe Set',
        'Retail Price': 280,
        'Current Stock': 15,
        'Status': 'Active',
      },
    ]

    const csvOutput = Papa.unparse(productsToExport)
    expect(csvOutput).toContain('SKU,Product Name,Retail Price,Current Stock,Status')
    expect(csvOutput).toContain('VSW-001,Front Brake Shoe Set,280,15,Active')
  })

  it('validates mandatory fields for catalogue items', () => {
    const validateProduct = (row: { sku?: string; name?: string; retail_price?: number }) => {
      const errors: string[] = []
      if (!row.sku || row.sku.trim().length === 0) errors.push('Missing SKU')
      if (!row.name || row.name.trim().length === 0) errors.push('Missing Product Name')
      if (row.retail_price === undefined || row.retail_price < 0) errors.push('Invalid Retail Price')
      return { isValid: errors.length === 0, errors }
    }

    expect(validateProduct({ sku: 'ACT-01', name: 'Air Filter', retail_price: 150 }).isValid).toBe(true)
    expect(validateProduct({ sku: '', name: 'Air Filter', retail_price: 150 }).isValid).toBe(false)
    expect(validateProduct({ sku: 'ACT-01', name: '', retail_price: 150 }).isValid).toBe(false)
    expect(validateProduct({ sku: 'ACT-01', name: 'Air Filter', retail_price: -10 }).isValid).toBe(false)
  })
})
