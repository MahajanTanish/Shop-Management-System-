// tests/unit/components-import.test.tsx
import { describe, it, expect } from 'vitest'

describe('Component dynamic imports', () => {
  it('imports ProductsPage without errors', async () => {
    const mod = await import('@/features/products/ProductsPage')
    expect(mod.default).toBeDefined()
  })

  it('imports ProductImportModal without errors', async () => {
    const mod = await import('@/features/products/ProductImportModal')
    expect(mod.default).toBeDefined()
  })

  it('imports Layout without errors', async () => {
    const mod = await import('@/app/Layout')
    expect(mod.default).toBeDefined()
  })

  it('imports UsersPage without errors', async () => {
    const mod = await import('@/features/users/UsersPage')
    expect(mod.default).toBeDefined()
  })

  it('imports SettingsPage without errors', async () => {
    const mod = await import('@/features/users/SettingsPage')
    expect(mod.default).toBeDefined()
  })

  it('imports Router without errors', async () => {
    const mod = await import('@/app/Router')
    expect(mod.default).toBeDefined()
  })
})
