'use client'

import { useState, useTransition } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { FOLLOWUP_RULE_META, type FollowupRuleConfig, type FollowupRuleId } from '@/lib/types/followup-rules'
import { setFollowupRuleAction, setDigestEnabledAction } from './actions'

/**
 * Smart-rules card on the /followups page. Each toggle opts the clinic into an
 * auto-create rule (the hourly engine adds the matching follow-ups). Owner/admin
 * only; a member sees them read-only. Optimistic with revert-on-error.
 */
export default function FollowupRulesCard({
  initial,
  digestEnabled,
  canManage,
}: {
  initial: FollowupRuleConfig
  digestEnabled: boolean
  canManage: boolean
}) {
  const [config, setConfig] = useState<FollowupRuleConfig>(initial)
  const [digest, setDigest] = useState(digestEnabled)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function toggle(rule: FollowupRuleId, next: boolean) {
    if (!canManage) return
    setError(null)
    setConfig((c) => ({ ...c, [rule]: next }))
    startTransition(async () => {
      const res = await setFollowupRuleAction(rule, next)
      if ('error' in res) {
        setConfig((c) => ({ ...c, [rule]: !next }))
        setError(res.error)
      } else {
        setConfig(res.config)
      }
    })
  }

  function toggleDigest(next: boolean) {
    if (!canManage) return
    setError(null)
    setDigest(next)
    startTransition(async () => {
      const res = await setDigestEnabledAction(next)
      if ('error' in res) { setDigest(!next); setError(res.error) }
    })
  }

  return (
    <div className="v2-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Auto-add rules</h2>
        <span className="text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 rounded-full px-2 py-0.5">
          Builds your list for you
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Turn these on and the system adds the follow-up for you — no more remembering who to chase.
      </p>
      <div className="divide-y divide-[color:var(--color-hairline)]">
        {FOLLOWUP_RULE_META.map((r) => (
          <div key={r.id} className="py-2.5 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{r.description}</p>
            </div>
            <div className="shrink-0 pt-0.5">
              <Toggle
                checked={config[r.id]}
                onChange={(next) => toggle(r.id, next)}
                disabled={!canManage}
                srLabel={r.label}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Morning digest — proactive delivery of everyone's My Day */}
      <div className="mt-3 pt-3 border-t border-[color:var(--color-hairline)] flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Morning digest email</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Each morning, email every staff member their follow-ups due, visits to confirm, and new leads.
          </p>
        </div>
        <div className="shrink-0 pt-0.5">
          <Toggle checked={digest} onChange={toggleDigest} disabled={!canManage} srLabel="Morning digest email" />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {!canManage && (
        <p className="mt-3 pt-3 border-t border-[color:var(--color-hairline)] text-xs text-gray-500 dark:text-gray-400">
          Only an owner or admin can change rules.
        </p>
      )}
    </div>
  )
}
