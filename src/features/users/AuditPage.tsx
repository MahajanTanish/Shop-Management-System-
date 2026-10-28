import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'
import type { AuditLog } from '@/types/database'
import {
  ClipboardList, Search, Filter, Calendar, Loader2,
  AlertCircle, ShieldCheck, Eye, Terminal
} from 'lucide-react'

export default function AuditPage() {
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState('all')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  // Fetch audit logs
  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['audit-logs', entityFilter],
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (entityFilter !== 'all') {
        q = q.eq('entity_type', entityFilter)
      }

      const { data, error } = await q
      if (error) throw error
      return (data || []) as AuditLog[]
    },
  })

  // Filter logs by search term
  const filteredLogs = (logs || []).filter(l => {
    if (!search.trim()) return true
    const s = search.toLowerCase()
    return (
      l.action.toLowerCase().includes(s) ||
      (l.actor_name && l.actor_name.toLowerCase().includes(s)) ||
      (l.entity_type && l.entity_type.toLowerCase().includes(s)) ||
      (l.entity_id && l.entity_id.toLowerCase().includes(s))
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">System Audit Trail & Internal Controls</h1>
        <p className="text-sm text-gray-500">Immutable, transaction-backed activity logs of stock adjustments, invoices, and administrative actions</p>
      </div>

      {/* Security Banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-xs text-emerald-900">
        <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div>
          <span className="font-bold">Tamper-Evident Ledger: </span>
          <span>Audit logs are written directly by PostgreSQL SECURITY DEFINER triggers and transactions. Deletion and modification are blocked by Row-Level Security.</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search action, actor, or entity ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Entities</option>
          <option value="invoice">Invoices</option>
          <option value="product">Products & Stock</option>
          <option value="purchase">Purchases</option>
          <option value="customer">Customers</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Failed to load audit logs.</span>
          </div>
        ) : !filteredLogs.length ? (
          <div className="text-center py-16 text-gray-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-gray-600">No audit records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/80">
                    <td className="py-3 px-4 text-xs text-gray-600 whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs capitalize text-gray-700">
                      <span className="font-medium">{log.entity_type}</span>
                      {log.entity_id && (
                        <span className="block font-mono text-[10px] text-gray-400">{log.entity_id.slice(0, 8)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-gray-900">
                      {log.actor_name || 'System / DB Trigger'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {(log.new_values || log.old_values) && (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1 text-gray-400 hover:text-blue-600 rounded transition"
                          title="View Payload"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* JSON Payload Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-600" /> Audit Payload Detail
              </h3>
              <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{selectedLog.action}</span>
            </div>

            <div className="space-y-3 text-xs">
              {selectedLog.old_values && (
                <div>
                  <p className="font-semibold text-gray-500 mb-1">Previous Values (Before):</p>
                  <pre className="p-3 bg-gray-50 rounded-lg border font-mono overflow-x-auto text-[11px]">
                    {JSON.stringify(selectedLog.old_values, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_values && (
                <div>
                  <p className="font-semibold text-gray-500 mb-1">New Values (After):</p>
                  <pre className="p-3 bg-gray-50 rounded-lg border font-mono overflow-x-auto text-[11px]">
                    {JSON.stringify(selectedLog.new_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
