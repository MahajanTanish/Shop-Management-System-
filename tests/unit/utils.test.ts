// tests/unit/utils.test.ts
import { describe, it, expect } from 'vitest'
import { roundMoney, calculateGST, formatCurrency, formatDate, parseNumeric } from '@/lib/utils'

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(10.005)).toBe(10.01)
    expect(roundMoney(10.004)).toBe(10.00)
    expect(roundMoney(100.125)).toBe(100.13)
  })

  it('handles whole numbers', () => {
    expect(roundMoney(100)).toBe(100)
    expect(roundMoney(0)).toBe(0)
  })

  it('handles negative values', () => {
    // Our implementation uses half-up rounding (adds EPSILON before rounding).
    // For negative values, -10.005 → Math.round(-10.005 + ε) * 0.01 = -10.01
    // This is expected and consistent behavior for financial use.
    expect(roundMoney(-10.005)).toBe(-10.01)
    expect(roundMoney(-10.004)).toBe(-10.00)
  })
})

describe('calculateGST', () => {
  it('calculates intra-state GST (CGST + SGST)', () => {
    const result = calculateGST(100, 18, false)
    expect(result.cgst).toBe(9)
    expect(result.sgst).toBe(9)
    expect(result.igst).toBe(0)
    expect(result.totalTax).toBe(18)
    expect(result.total).toBe(118)
  })

  it('calculates inter-state GST (IGST)', () => {
    const result = calculateGST(100, 18, true)
    expect(result.cgst).toBe(0)
    expect(result.sgst).toBe(0)
    expect(result.igst).toBe(18)
    expect(result.totalTax).toBe(18)
    expect(result.total).toBe(118)
  })

  it('calculates GST 5%', () => {
    const result = calculateGST(200, 5, false)
    expect(result.cgst).toBe(5)
    expect(result.sgst).toBe(5)
    expect(result.totalTax).toBe(10)
    expect(result.total).toBe(210)
  })

  it('handles zero tax rate', () => {
    const result = calculateGST(500, 0, false)
    expect(result.totalTax).toBe(0)
    expect(result.total).toBe(500)
  })

  it('handles fractional taxable values', () => {
    const result = calculateGST(83.33, 18, false)
    // cgst = 83.33 * 0.09 = 7.4997 → 7.50
    expect(result.cgst).toBe(7.50)
    expect(result.sgst).toBe(7.50)
    expect(result.totalTax).toBe(15.00)
  })
})

describe('formatCurrency', () => {
  it('formats Indian rupees', () => {
    // Should start with ₹ symbol
    expect(formatCurrency(1000)).toContain('1,000')
    expect(formatCurrency(0)).toContain('0')
  })

  it('handles null and undefined gracefully', () => {
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency(undefined)).toBe('—')
  })
})

describe('parseNumeric', () => {
  it('parses valid numbers', () => {
    expect(parseNumeric('100')).toBe(100)
    expect(parseNumeric('3.14')).toBe(3.14)
    expect(parseNumeric(42)).toBe(42)
  })

  it('returns null for invalid values', () => {
    expect(parseNumeric('abc')).toBeNull()
    expect(parseNumeric('')).toBeNull()
    expect(parseNumeric(null)).toBeNull()
    expect(parseNumeric(undefined)).toBeNull()
  })
})

describe('Invoice total calculation', () => {
  it('correctly computes line total with discount and tax', () => {
    // Product: qty=2, unitPrice=500, discount=10%, taxRate=18%
    const qty = 2
    const unitPrice = 500
    const discountPct = 10
    const taxRate = 18

    const subtotal = roundMoney(qty * unitPrice)              // 1000
    const discountAmt = roundMoney(subtotal * discountPct / 100)  // 100
    const taxableAmt = roundMoney(subtotal - discountAmt)     // 900
    const gst = calculateGST(taxableAmt, taxRate, false)

    expect(subtotal).toBe(1000)
    expect(discountAmt).toBe(100)
    expect(taxableAmt).toBe(900)
    expect(gst.cgst).toBe(81)
    expect(gst.sgst).toBe(81)
    expect(gst.total).toBe(1062)
  })

  it('correctly sums multiple invoice lines', () => {
    const lines = [
      { qty: 1, price: 200, discount: 0, tax: 18 },
      { qty: 3, price: 150, discount: 5, tax: 12 },
    ]

    const totals = lines.map(l => {
      const sub = roundMoney(l.qty * l.price)
      const disc = roundMoney(sub * l.discount / 100)
      const taxable = roundMoney(sub - disc)
      const gst = calculateGST(taxable, l.tax, false)
      return { sub, disc, taxable, tax: gst.totalTax, total: gst.total }
    })

    expect(totals[0]).toBeDefined()
    expect(totals[1]).toBeDefined()
    expect(totals[0]!.total).toBe(236)        // 200 * 1.18
    expect(totals[1]!.taxable).toBe(roundMoney(450 * 0.95))  // 427.50
    const grandTotal = roundMoney(totals.reduce((s, t) => s + t.total, 0))
    expect(grandTotal).toBe(roundMoney(236 + calculateGST(427.5, 12).total))
  })
})
