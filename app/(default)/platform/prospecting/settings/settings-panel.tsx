'use client'

import { useState, useTransition } from 'react'
import type { ProspectingConfig } from '@/lib/types/prospecting'
import { US_STATES, US_STATE_NAMES, type UsState } from '@/lib/types/us-geo'
import { StatusPill } from '@/components/ui/status-pill'
import {
  setKillSwitchAction,
  setDryRunAction,
  toggleStateAction,
} from '../admin-actions'

const SECTION = 'v2-card p-5 mb-5'
const SECTION_TITLE = 'text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1'
const SECTION_SUB = 'text-xs text-gray-500 dark:text-gray-400 mb-4'

function Toggle({
  on,
  disabled,
  onChange,
  labelOn,
  labelOff,
}: {
  on: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  labelOn: string
  labelOff: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
        on
          ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
          : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${on ? 'bg-teal-500' : 'bg-gray-400'}`}
      />
      {on ? labelOn : labelOff}
    </button>
  )
}

export default function SettingsPanel({
  config,
  progress,
  usage,
  env,
}: {
  config: ProspectingConfig
  progress: Array<{ state: string; pending: number; done: number; error: number; imported: number }>
  usage: { placesUsed: number; crawlsUsed: number; aiUsed: number }
  env: { senderConfigured: boolean; gmailConfigured: boolean; placesConfigured: boolean }
}) {
  const [pending, startTransition] = useTransition()
  // Optimistic mirrors so the switches feel instant.
  const [killSwitch, setKillSwitch] = useState(config.killSwitch)
  const [dryRun, setDryRun] = useState(config.dryRun)
  const [states, setStates] = useState(new Set(config.enabledStates))

  const progressByState = new Map(progress.map((p) => [p.state, p]))

  return (
    <div>
      {/* Master switches */}
      <section className={SECTION}>
        <div className={SECTION_TITLE}>Engine</div>
        <p className={SECTION_SUB}>
          The kill switch stops everything — discovery, enrichment, and outreach. Dry-run lets the
          outreach engine write fully personalized emails to the log without sending a single one.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle
            on={!killSwitch}
            disabled={pending}
            onChange={(next) => {
              setKillSwitch(!next)
              startTransition(() => setKillSwitchAction(!next))
            }}
            labelOn="Engine ON"
            labelOff="Engine OFF (kill switch)"
          />
          <Toggle
            on={dryRun}
            disabled={pending}
            onChange={(next) => {
              setDryRun(next)
              startTransition(() => setDryRunAction(next))
            }}
            labelOn="Dry-run (no real sends)"
            labelOff="Live sending"
          />
        </div>
      </section>

      {/* Sender / integration readiness */}
      <section className={SECTION}>
        <div className={SECTION_TITLE}>Integration readiness</div>
        <p className={SECTION_SUB}>
          These come from environment secrets, not this page — the honest wiring status.
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <StatusPill
              tone={env.placesConfigured ? 'ok' : 'warn'}
              label={env.placesConfigured ? 'Connected' : 'Not configured'}
            />
            <span className="text-gray-700 dark:text-gray-300">
              Google Places API key <code className="text-xs">GOOGLE_PLACES_API_KEY</code> — website +
              rating enrichment {env.placesConfigured ? '' : '(enrichment will skip Places until set)'}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <StatusPill
              tone={env.senderConfigured ? 'ok' : 'warn'}
              label={env.senderConfigured ? 'Configured' : 'Not configured'}
            />
            <span className="text-gray-700 dark:text-gray-300">
              Outreach sender <code className="text-xs">OUTREACH_EMAIL_FROM</code> — must be a
              dedicated domain, never dreamcreatestudio.com{' '}
              {env.senderConfigured ? '' : '(outreach runs in dry-run until set)'}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <StatusPill
              tone={env.gmailConfigured ? 'ok' : 'neutral'}
              label={env.gmailConfigured ? 'Connected' : 'Optional'}
            />
            <span className="text-gray-700 dark:text-gray-300">
              Outreach Gmail <code className="text-xs">OUTREACH_GMAIL_ACCOUNT_ID</code> — reply
              detection + better deliverability
            </span>
          </li>
        </ul>
      </section>

      {/* State rollout */}
      <section className={SECTION}>
        <div className={SECTION_TITLE}>State rollout</div>
        <p className={SECTION_SUB}>
          Enabling a state seeds its discovery grid; the registry import starts on the next cron
          tick (within ~6 hours). Start with one state, prove the loop, then expand.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
          {US_STATES.map((s: UsState) => {
            const on = states.has(s)
            const p = progressByState.get(s)
            return (
              <button
                key={s}
                type="button"
                disabled={pending}
                title={
                  US_STATE_NAMES[s] +
                  (p ? ` — ${p.imported.toLocaleString()} imported, ${p.pending} tasks pending` : '')
                }
                onClick={() => {
                  const next = new Set(states)
                  if (on) next.delete(s)
                  else next.add(s)
                  setStates(next)
                  startTransition(() => toggleStateAction(s, !on))
                }}
                className={`rounded-[var(--r-xs)] px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  on
                    ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
                    : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {s}
                {p && p.imported > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">{p.imported}</span>
                )}
              </button>
            )
          })}
        </div>
        {progress.some((p) => p.error > 0) && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            {progress.reduce((n, p) => n + p.error, 0)} discovery task(s) hit an error — they retry
            automatically once the healthy backlog drains.
          </p>
        )}
      </section>

      {/* Budgets */}
      <section className={SECTION}>
        <div className={SECTION_TITLE}>This month&apos;s usage</div>
        <p className={SECTION_SUB}>
          Enrichment pauses softly when a budget is hit — discovery keeps running and nothing is
          lost, it just waits for the month to roll.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {(
            [
              ['Google Places lookups', usage.placesUsed, config.budgets.placesPerMonth],
              ['Website crawls', usage.crawlsUsed, config.budgets.crawlsPerMonth],
              ['AI scorings', usage.aiUsed, config.budgets.aiPerMonth],
            ] as Array<[string, number, number]>
          ).map(([label, used, budget]) => (
            <div key={label} className="rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
              <div className="mt-0.5 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {used.toLocaleString()} <span className="text-gray-400 font-normal">/ {budget.toLocaleString()}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${used >= budget ? 'bg-amber-500' : 'bg-teal-500'}`}
                  style={{ width: `${Math.min(100, Math.round((used / Math.max(1, budget)) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Warm-up (read-only summary in Phase 1 — the send engine lands next) */}
      <section className={SECTION}>
        <div className={SECTION_TITLE}>Sending warm-up</div>
        <p className={SECTION_SUB}>
          When live sending starts, daily volume ramps from {config.warmup.startPerDay}/day by +
          {config.warmup.incrementPerWeek}/week up to {config.warmup.ceilingPerDay}/day, inside{' '}
          {config.sendWindow.startHour}:00–{config.sendWindow.endHour}:00 prospect-local time,
          weekdays only. The ramp protects the sending domain&apos;s reputation — resist the urge to
          skip it.
        </p>
      </section>
    </div>
  )
}
