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
  // Collapsed by default: rules are set-and-forget config, and the open card
  // sat between the filters and the day's actual work. The summary line keeps
  // the state legible; the body stays MOUNTED while hidden (settings-tabs law)
  // so an in-flight toggle isn't lost to a collapse.
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  const onCount = FOLLOWUP_RULE_META.filter((r) => config[r.id]).length

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
    <div className="v2-card px-5 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Auto-add rules</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {onCount} of {FOLLOWUP_RULE_META.length} on · morning digest {digest ? 'on' : 'off'}
          </span>
        </span>
        <span className="shrink-0 flex items-center gap-2">
          <span className="hidden sm:inline text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 rounded-full px-2 py-0.5">
            Builds your list for you
          </span>
          <svg
            viewBox="0 0 12 12"
            className={`h-3 w-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M2 4.5 6 8.5l4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <div className={open ? 'block pt-2' : 'hidden'}>
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
    </div>
  )
}
