// src/features/auth/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  role: UserRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateRole: (newRole: UserRole) => Promise<{ error: Error | null }>
  isOwner: boolean
  isManager: boolean
  isSalesEmployee: boolean
  isInventoryEmployee: boolean
  canManageUsers: boolean
  canViewReports: boolean
  canManageProducts: boolean
  canManagePurchases: boolean
  canFinalizeSales: boolean
  canManagePayments: boolean
  canViewAuditLog: boolean
  canManageSettings: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const isFetchingProfileRef = useRef<string | null>(null)

  const fetchProfile = useCallback(async (userId: string, fallbackName = 'Store Owner') => {
    if (isFetchingProfileRef.current === userId) return
    isFetchingProfileRef.current = userId

    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (data) {
        setProfile(data)
        return
      }

      // If profile does not exist in DB yet, attempt to create it
      const { data: created } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          role: 'owner',
          full_name: fallbackName,
        })
        .select('*')
        .maybeSingle()

      if (created) {
        setProfile(created)
      } else {
        // Fallback profile object so UI and role permissions remain active
        setProfile((prev) => {
          if (prev && prev.id === userId) return prev
          return {
            id: userId,
            role: 'owner',
            full_name: fallbackName,
            phone: null,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        })
      }
    } catch (err) {
      console.warn('Could not fetch user profile:', err)
    } finally {
      isFetchingProfileRef.current = null
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (currentSession?.user) {
      const name =
        currentSession.user.user_metadata?.full_name ||
        currentSession.user.email?.split('@')[0] ||
        'Store Owner'
      await fetchProfile(currentSession.user.id, name)
    }
  }, [fetchProfile])

  useEffect(() => {
    let isMounted = true

    // 1. Initial session retrieval
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!isMounted) return
      setSession(initialSession)
      setUser(initialSession?.user ?? null)
      if (initialSession?.user) {
        const name =
          initialSession.user.user_metadata?.full_name ||
          initialSession.user.email?.split('@')[0] ||
          'Store Owner'
        fetchProfile(initialSession.user.id, name).finally(() => {
          if (isMounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    // 2. Auth state subscription (fires only on real auth events)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return
      setSession(newSession)
      setUser(newSession?.user ?? null)

      if (newSession?.user) {
        const name =
          newSession.user.user_metadata?.full_name ||
          newSession.user.email?.split('@')[0] ||
          'Store Owner'
        await fetchProfile(newSession.user.id, name)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, role: UserRole = 'sales_employee') => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
          },
        },
      })
      return { error }
    },
    []
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const updateRole = useCallback(async (newRole: UserRole) => {
    if (!user) return { error: new Error('User not authenticated') }
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', user.id)
    if (!error) {
      await fetchProfile(user.id)
    }
    return { error }
  }, [user, fetchProfile])

  const role = profile?.role ?? null
  const isOwner = role === 'owner'
  const isManager = role === 'manager'
  const isSalesEmployee = role === 'sales_employee'
  const isInventoryEmployee = role === 'inventory_employee'

  // Permission helpers
  const canManageUsers = isOwner
  const canViewReports = isOwner || isManager
  const canManageProducts = isOwner || isManager || isInventoryEmployee
  const canManagePurchases = isOwner || isManager || isInventoryEmployee
  const canFinalizeSales = isOwner || isManager || isSalesEmployee
  const canManagePayments = isOwner || isManager || isSalesEmployee
  const canViewAuditLog = isOwner || isManager
  const canManageSettings = isOwner

  const value: AuthContextValue = {
    session,
    user,
    profile,
    role,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    updateRole,
    isOwner,
    isManager,
    isSalesEmployee,
    isInventoryEmployee,
    canManageUsers,
    canViewReports,
    canManageProducts,
    canManagePurchases,
    canFinalizeSales,
    canManagePayments,
    canViewAuditLog,
    canManageSettings,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
