import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import type { Profile, UserRole } from '@/types/database'
import {
  UserCog, Shield, AlertCircle, Loader2, CheckCircle2,
  Copy, Check, ExternalLink, RefreshCw
} from 'lucide-react'

const SQL_MIGRATION_SNIPPET = `-- Fix Profiles RLS and Backfill Missing User Profiles
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'profiles_insert_own'
    ) THEN
        CREATE POLICY "profiles_insert_own" 
            ON public.profiles FOR INSERT 
            WITH CHECK (id = auth.uid());
    END IF;
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS "profiles_select_staff" ON public.profiles;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'profiles_select_authenticated'
    ) THEN
        CREATE POLICY "profiles_select_authenticated" 
            ON public.profiles FOR SELECT 
            USING (auth.uid() IS NOT NULL);
    END IF;
END $$;

INSERT INTO public.profiles (id, role, full_name)
SELECT 
    id, 
    'owner'::user_role, 
    COALESCE(raw_user_meta_data->>'full_name', email, 'Store Owner')
FROM auth.users
ON CONFLICT (id) DO UPDATE 
SET role = 'owner';`

export default function UsersPage() {
  const qc = useQueryClient()
  const { user: currentUser, profile: currentProfile, refreshProfile } = useAuth()
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copiedSql, setCopiedSql] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Fetch profiles from database
  const { data: dbProfiles, isLoading, error, refetch } = useQuery({
    queryKey: ['users-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('role')

      if (error) throw error
      return (data || []) as Profile[]
    },
  })

  // Role update mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
      if (error) throw error
      if (id === currentUser?.id) {
        await refreshProfile()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-profiles'] })
      setSuccessMsg('User role updated successfully')
      setTimeout(() => setSuccessMsg(null), 3000)
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  // Active status toggle mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (id === currentUser?.id) {
        throw new Error('You cannot deactivate your own account')
      }
      const { error } = await supabase.from('profiles').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-profiles'] })
      setSuccessMsg('User status updated')
      setTimeout(() => setSuccessMsg(null), 3000)
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const roleBadge = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-purple-100 text-purple-800">👑 Owner</span>
      case 'manager':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase bg-blue-100 text-blue-800">👔 Manager</span>
      case 'sales_employee':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase bg-green-100 text-green-800">💳 Sales</span>
      case 'inventory_employee':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase bg-amber-100 text-amber-800">📦 Inventory</span>
    }
  }

  const handleCreateOwnProfile = async () => {
    if (!currentUser) return
    setErrorMsg(null)
    setIsCreating(true)
    try {
      const { error } = await supabase.from('profiles').insert({
        id: currentUser.id,
        role: 'owner',
        full_name: currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Store Owner',
      })
      if (error) {
        setErrorMsg(error.message)
      } else {
        await refreshProfile()
        qc.invalidateQueries({ queryKey: ['users-profiles'] })
        setSuccessMsg('Owner profile created in database successfully!')
        setTimeout(() => setSuccessMsg(null), 3000)
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to insert profile')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_MIGRATION_SNIPPET)
    setCopiedSql(true)
    setTimeout(() => setCopiedSql(false), 2500)
  }

  // Combine database profiles with current user fallback if not present in DB
  const displayProfiles: Profile[] = [...(dbProfiles || [])]
  const currentUserInDb = displayProfiles.some((p) => p.id === currentUser?.id)

  if (currentUser && !currentUserInDb) {
    displayProfiles.unshift({
      id: currentUser.id,
      role: currentProfile?.role || 'owner',
      full_name: currentProfile?.full_name || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Store Owner',
      phone: currentUser.phone || null,
      is_active: true,
      created_at: currentUser.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  const isRlsError = Boolean(
    errorMsg && (
      errorMsg.toLowerCase().includes('row-level security') ||
      errorMsg.toLowerCase().includes('policy') ||
      errorMsg.toLowerCase().includes('violates')
    )
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Settings & Permissions</h1>
          <p className="text-sm text-gray-500">Manage employee access, assign role-based permissions, and review authorized accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition"
            title="Refresh database records"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {!currentUserInDb && currentUser && (
            <button
              onClick={handleCreateOwnProfile}
              disabled={isCreating}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium transition shadow-xs cursor-pointer"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Initialize Owner Profile
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* RLS Fix Banner */}
      {(isRlsError || (!currentUserInDb && currentUser)) && (
        <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900">
                Database Permission Setup Required (Supabase RLS)
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                Supabase Row-Level Security currently restricts client-side <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">INSERT</code> operations on the <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">profiles</code> table.
                To permanently link your user account as <strong>Owner</strong> in the database, run the migration snippet below once in your Supabase SQL Editor.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={handleCopySql}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition shadow-xs cursor-pointer"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedSql ? 'SQL Copied to Clipboard!' : 'Copy SQL Fix Script'}
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

          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-amber-900 font-medium hover:underline">
              View SQL Script Details
            </summary>
            <pre className="mt-2 p-3 bg-amber-900/10 text-amber-950 rounded-lg font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
              {SQL_MIGRATION_SNIPPET}
            </pre>
          </details>
        </div>
      )}

      {errorMsg && !isRlsError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Role Explanations */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 space-y-1">
        <p className="font-bold flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Security & Role Governance:</p>
        <p>• <strong>Owner:</strong> Full access to system configuration, user role assignment, audit logs, and reports.</p>
        <p>• <strong>Manager:</strong> Operational authority across sales, purchases, customer credit adjustments, and business reports.</p>
        <p>• <strong>Inventory Staff:</strong> Product catalogue creation, supplier purchase intake, physical stock counting, and adjustments.</p>
        <p>• <strong>Sales Staff:</strong> Fast POS product search, retail bill generation, wholesale invoicing, and customer payment intake.</p>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Failed to load user profiles from database.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Current Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Assign Role</th>
                  <th className="py-3 px-4 text-center">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayProfiles.map((p) => {
                  const isCurrent = p.id === currentUser?.id
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                          {p.full_name || 'Staff Member'}
                          {isCurrent && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                              You ({currentUserInDb ? 'Database' : 'Active Session'})
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">{p.phone || p.id.slice(0, 8)}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        {roleBadge(p.role)}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.is_active ? (
                          <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                          </span>
                        ) : (
                          <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Deactivated
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-gray-500">
                        {formatDate(p.created_at)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <select
                          value={p.role}
                          onChange={(e) => updateRoleMutation.mutate({ id: p.id, role: e.target.value as UserRole })}
                          className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white shadow-xs cursor-pointer"
                        >
                          <option value="owner">👑 Owner</option>
                          <option value="manager">👔 Manager</option>
                          <option value="inventory_employee">📦 Inventory Staff</option>
                          <option value="sales_employee">💳 Sales Staff</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={p.is_active}
                          disabled={isCurrent}
                          onChange={(e) => toggleActiveMutation.mutate({ id: p.id, is_active: e.target.checked })}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


