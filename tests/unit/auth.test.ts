// tests/unit/auth.test.ts
import { describe, it, expect } from 'vitest'
import { signupSchema } from '@/schemas'

describe('signupSchema', () => {
  it('accepts valid signup data', () => {
    const validData = {
      full_name: 'Ved Prakash',
      email: 'ved@example.com',
      role: 'owner' as const,
      password: 'password123',
      confirm_password: 'password123',
    }
    const result = signupSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('rejects short full_name', () => {
    const invalidData = {
      full_name: 'V',
      email: 'ved@example.com',
      role: 'sales_employee' as const,
      password: 'password123',
      confirm_password: 'password123',
    }
    const result = signupSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('rejects invalid email address', () => {
    const invalidData = {
      full_name: 'Ved Prakash',
      email: 'not-an-email',
      role: 'sales_employee' as const,
      password: 'password123',
      confirm_password: 'password123',
    }
    const result = signupSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('rejects password shorter than 6 characters', () => {
    const invalidData = {
      full_name: 'Ved Prakash',
      email: 'ved@example.com',
      role: 'sales_employee' as const,
      password: '12345',
      confirm_password: '12345',
    }
    const result = signupSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('rejects when password and confirm_password do not match', () => {
    const invalidData = {
      full_name: 'Ved Prakash',
      email: 'ved@example.com',
      role: 'manager' as const,
      password: 'password123',
      confirm_password: 'differentPassword456',
    }
    const result = signupSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Passwords do not match')
    }
  })
})
