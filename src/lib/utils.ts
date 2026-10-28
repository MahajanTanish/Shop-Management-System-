// src/lib/utils.ts
// Shared utility functions

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as Indian Rupees.
 * Uses Intl.NumberFormat with en-IN locale.
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format a number as a plain Indian number (no currency symbol).
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-IN').format(value)
}

/**
 * Format a date string or Date object.
 */
export function formatDate(date: string | Date | null | undefined, fmt = 'dd MMM yyyy'): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, fmt)
  } catch {
    return String(date)
  }
}

/**
 * Format a datetime string or Date object.
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  return formatDate(date, 'dd MMM yyyy, hh:mm a')
}

/**
 * Round to 2 decimal places using standard half-up rounding.
 * Use for all financial calculations to avoid floating-point drift.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Calculate GST amounts from a taxable value.
 * Returns CGST, SGST, IGST, and total tax for the given rate.
 * Assumes intra-state (CGST + SGST) by default.
 * Pass isInterState=true for IGST.
 */
export function calculateGST(
  taxableValue: number,
  gstRate: number, // e.g. 18 for 18%
  isInterState = false
): { cgst: number; sgst: number; igst: number; totalTax: number; total: number } {
  const rate = gstRate / 100
  if (isInterState) {
    const igst = roundMoney(taxableValue * rate)
    return { cgst: 0, sgst: 0, igst, totalTax: igst, total: roundMoney(taxableValue + igst) }
  }
  const halfRate = gstRate / 2 / 100
  const cgst = roundMoney(taxableValue * halfRate)
  const sgst = roundMoney(taxableValue * halfRate)
  const totalTax = roundMoney(cgst + sgst)
  return { cgst, sgst, igst: 0, totalTax, total: roundMoney(taxableValue + totalTax) }
}

/**
 * Generate a short display reference from a UUID.
 */
export function shortId(uuid: string): string {
  return uuid.slice(0, 8).toUpperCase()
}

/**
 * Truncate a string to a given length.
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}

/**
 * Check if a value is a non-empty string.
 */
export function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Parse a numeric string, returning null if invalid.
 */
export function parseNumeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return isNaN(n) ? null : n
}

/**
 * Build a URL search-params string from an object.
 */
export function buildQueryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') {
      p.set(k, String(v))
    }
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}
