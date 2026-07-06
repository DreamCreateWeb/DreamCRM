'use client'

import { useState, useTransition } from 'react'
import type { ProspectingConfig } from '@/lib/types/prospecting'
import { PROSPECT_SCORE_BANDS } from '@/lib/db/schema/prospecting'
import { SCORE_BAND_LABELS, type ProspectScoreBand } from '@/lib/types/prospecting'
import { US_STATES, US_STATE_NAMES, type UsState } from '@/lib/types/us-geo'
import { StatusPill } from '@/components/ui/status-pill'
import {
  setKillSwitchAction,
  setDryRunAction,
  toggleStateAction,
  updateAutoEnrollAction,
  setDigestEnabledAction,
  setWatchdogEnabledAction,
  setBookingEnabledAction,
  updateBrainAction,
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

type BattleCard = { competitor: string; angle: string }

function BrainEditor({ brain }: { brain: ProspectingConfig['brain'] }) {
  const [pending, startTransition] = useTransition()
  const [productOverride, setProductOverride] = useState(brain.productOverride)
  const [cards, setCards] = useState<BattleCard[]>(brain.battleCards)
  const [saved, setSaved] = useState(false)

  // Dirty vs the last-saved snapshot (so the Save button + "Saved" note are honest).
  const [baseline, setBaseline] = useState({
    productOverride: brain.productOverride,
    cards: brain.battleCards,
  })
  const dirty =
    productOverride !== baseline.productOverride ||
    JSON.stringify(cards) !== JSON.stringify(baseline.cards)

  const save = () => {
    const cleaned = cards
      .map((c) => ({ competitor: c.competitor.trim(), angle: c.angle.trim() }))
      .filter((c) => c.competitor.length > 0 && c.angle.length > 0)
      .slice(0, 20)
    startTransition(async () => {
      await updateBrainAction({ productOverride: productOverride.trim(), battleCards: cleaned })
      setBaseline({ productOverride: productOverride.trim(), cards: cleaned })
      setCards(cleaned)
      setProductOverride(productOverride.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <section className={SECTION}>
      <div className={SECTION_TITLE}>The brain — product knowledge &amp; battle cards</div>
      <p className={SECTION_SUB}>
        This is the source of truth every prospecting AI reads — the cold email, the reply drafts,
        and the pre-demo brief. Leave the override blank to use the built-in product knowledge; write
        your own to reshape the whole engine&apos;s pitch at once. Battle cards give the AI a specific
        counter for a named competitor (it only uses the matching one, and never name-drops a rival
        unprompted).
      </p>

      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
        Product-knowledge override{' '}
        <span className="font-normal text-gray-400">(blank = use the built-in default)</span>
      </label>
      <textarea
        className="form-textarea w-full text-sm font-mono leading-relaxed"
        rows={productOverride ? 14 : 4}
        maxLength={12000}
        placeholder="Leave blank to use the canonical product knowledge. Anything you write here fully replaces it in every prospecting AI prompt — so include pricing, positioning, and honest limits."
        value={productOverride}
        onChange={(e) => setProductOverride(e.target.value)}
        disabled={pending}
      />
      <div className="mt-1 text-right text-xs tabular-nums text-gray-400">
        {productOverride.length.toLocaleString()} / 12,000
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Competitor battle cards{' '}
            <span className="font-normal text-gray-400">({cards.length}/20)</span>
          </label>
          {cards.length < 20 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setCards([...cards, { competitor: '', angle: '' }])}
              className="text-xs font-medium text-teal-700 dark:text-teal-300 hover:underline disabled:opacity-60"
            >
              + Add card
            </button>
          )}
        </div>
        {cards.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
            No battle cards yet — add one for a competitor you keep running into.
          </p>
        )}
        <div className="space-y-2">
          {cards.map((c, i) => (
            <div
              key={i}
              className="flex flex-col sm:flex-row gap-2 rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 p-2"
            >
              <input
                type="text"
                maxLength={80}
                placeholder="Competitor (e.g. Weave)"
                className="form-input text-sm sm:w-44"
                value={c.competitor}
                disabled={pending}
                onChange={(e) => {
                  const next = [...cards]
                  next[i] = { ...next[i], competitor: e.target.value }
                  setCards(next)
                }}
              />
              <input
                type="text"
                maxLength={600}
                placeholder="How we win against them (one line)"
                className="form-input text-sm flex-1"
                value={c.angle}
                disabled={pending}
                onChange={(e) => {
                  const next = [...cards]
                  next[i] = { ...next[i], angle: e.target.value }
                  setCards(next)
                }}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => setCards(cards.filter((_, j) => j !== i))}
                className="shrink-0 rounded-[var(--r-xs)] px-2 py-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-60"
                aria-label="Remove card"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={save}
          className="rounded-[var(--r-xs)] bg-teal-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save the brain'}
        </button>
        {saved && !dirty && (
          <span className="text-xs text-teal-700 dark:text-teal-300">Saved ✓</span>
        )}
        {dirty && !pending && (
          <span className="text-xs text-gray-400">Unsaved changes</span>
        )}
      </div>
    </section>
  )
}

export default function SettingsPanel({
  config,
  progress,
  usage,
  env,
  autoEnrolledToday,
}: {
  config: ProspectingConfig
  progress: Array<{ state: string; pending: number; done: number; error: number; imported: number }>
  usage: { placesUsed: number; crawlsUsed: number; aiUsed: number }
  env: { senderConfigured: boolean; gmailConfigured: boolean; placesConfigured: boolean }
  autoEnrolledToday: number
}) {
  const [pending, startTransition] = useTransition()
  // Optimistic mirrors so the switches feel instant.
  const [killSwitch, setKillSwitch] = useState(config.killSwitch)
  const [dryRun, setDryRun] = useState(config.dryRun)
  const [states, setStates] = useState(new Set(config.enabledStates))
  const [autoEnroll, setAutoEnroll] = useState(config.autoEnroll)
  const [watchdog, setWatchdog] = useState(config.watchdog.enabled)
  const [digest, setDigest] = useState(config.digest.enabled)
  const [booking, setBooking] = useState(config.booking.enabled)

  const progressByState = new Map(progress.map((p) => [p.state, p]))

  const saveAutoEnroll = (next: typeof autoEnroll) => {
    setAutoEnroll(next)
    startTransition(() => updateAutoEnrollAction(next))
  }

  return (
    <div>
      {config.watchdog.trippedAt && (
        <div className="mb-5 rounded-lg border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
          <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            🛡️ Deliverability watchdog tripped — sending auto-paused
          </div>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {config.watchdog.reason}. The engine dropped back to dry-run to protect the sending
            domain. Review your bounces, then flip &ldquo;Live sending&rdquo; back on below to
            resume (that also clears this alarm).
          </p>
        </div>
      )}

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

      {/* The brain — editable product knowledge + battle cards */}
      <BrainEditor brain={config.brain} />

      {/* The hunter — auto-enrollment */}
      <section className={SECTION}>
        <div className={SECTION_TITLE}>Auto-enrollment — the hunter</div>
        <p className={SECTION_SUB}>
          When on, freshly enriched prospects in the chosen score bands are automatically routed
          into their segment-matched sequence — no clicking Enroll. It runs even in dry-run (the
          enrollment happens; sending still waits for live mode), so you can watch it work first.
          Every dedupe + suppression guard still applies.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle
            on={autoEnroll.enabled}
            disabled={pending}
            onChange={(next) => saveAutoEnroll({ ...autoEnroll, enabled: next })}
            labelOn="Hunter ON"
            labelOff="Hunter off (manual enroll only)"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            {autoEnrolledToday} enrolled today / {autoEnroll.perDay} cap
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Enroll bands:</span>
          {PROSPECT_SCORE_BANDS.map((band) => {
            const on = autoEnroll.bands.includes(band)
            return (
              <button
                key={band}
                type="button"
                disabled={pending}
                onClick={() => {
                  const set = new Set(autoEnroll.bands)
                  if (on) set.delete(band)
                  else set.add(band)
                  const bands = PROSPECT_SCORE_BANDS.filter((b) => set.has(b)) as ProspectScoreBand[]
                  if (bands.length > 0) saveAutoEnroll({ ...autoEnroll, bands })
                }}
                className={`rounded-[var(--r-xs)] px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                  on
                    ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
                    : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {SCORE_BAND_LABELS[band]}
              </button>
            )
          })}
          <label className="ml-auto flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            Daily cap
            <input
              type="number"
              min={1}
              max={500}
              disabled={pending}
              className="form-input w-20 text-sm"
              value={autoEnroll.perDay}
              onChange={(e) =>
                saveAutoEnroll({
                  ...autoEnroll,
                  perDay: Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                })
              }
            />
          </label>
        </div>
      </section>

      {/* Alerts & guard rails */}
      <section className={SECTION}>
        <div className={SECTION_TITLE}>Alerts &amp; guard rails</div>
        <p className={SECTION_SUB}>
          The watchdog auto-pauses live sending if bounces or complaints spike (protecting the
          sending domain). The daily digest emails you a hunt summary — sends, replies, new call-list
          entries — once a day.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle
            on={watchdog}
            disabled={pending}
            onChange={(next) => {
              setWatchdog(next)
              startTransition(() => setWatchdogEnabledAction(next))
            }}
            labelOn="Deliverability watchdog ON"
            labelOff="Watchdog off"
          />
          <Toggle
            on={digest}
            disabled={pending}
            onChange={(next) => {
              setDigest(next)
              startTransition(() => setDigestEnabledAction(next))
            }}
            labelOn="Daily hunt digest ON"
            labelOff="Digest off"
          />
          <Toggle
            on={booking}
            disabled={pending}
            onChange={(next) => {
              setBooking(next)
              startTransition(() => setBookingEnabledAction(next))
            }}
            labelOn="Self-booking demos ON"
            labelOff="Self-booking off"
          />
        </div>
        {booking && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Interested prospects can pick a demo time themselves at{' '}
            <code className="text-xs">/d/&lt;token&gt;</code> ({config.booking.hostTimeZone}, weekdays{' '}
            {config.booking.startHour}:00–{config.booking.endHour}:00). Grab a prospect&apos;s link from
            the &ldquo;📅 Booking link&rdquo; button on the call list.
          </p>
        )}
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
