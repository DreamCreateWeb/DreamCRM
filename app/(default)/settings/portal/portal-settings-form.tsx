'use client'

import { useState, useTransition } from 'react'
import {
  PORTAL_FEATURE_LABELS,
  PORTAL_BOOKABLE_TYPES,
  DEFAULT_AUTO_REPLY_MESSAGE,
  type PortalSettings,
  type PortalFeatureFlags,
} from '@/lib/types/portal'
import { savePortalSettingsAction } from './actions'
import { ActionButton } from '@/components/ui/action-button'
import { Toggle } from '@/components/ui/toggle'
import { SettingsSection, SettingsRow } from '../settings-kit'
import { SettingsTabs } from '../settings-tabs'

/**
 * Settings → Patient portal. Everything the clinic can shape about the
 * patient experience: feature switches (off = patients never see it),
 * booking/notice behavior, and the portal's voice. Office-manager UX:
 * tabbed, plain labels, one Save. The form is fully controlled (`settings`
 * state), so Save persists every tab regardless of which is showing.
 *
 * Built entirely from the shared settings kit (SettingsSection/SettingsRow +
 * Toggle) so it reads and behaves like every other settings page.
 */

const FEATURE_ORDER: Array<keyof PortalFeatureFlags> = [
  'booking',
  'reschedule',
  'messages',
  'billing',
  'payments',
  'records',
  'forms',
  'family',
  'shopLink',
]

/** Notice-window presets shared by the two "hours of notice" controls. A
 *  human doesn't think in "how many hours is a week" — they think None / a
 *  couple hours / same-day / a day / two days / a week. The picker still
 *  persists the underlying integer hours, so nothing about storage changes. */
const NOTICE_PRESETS: Array<{ label: string; hours: number }> = [
  { label: 'None', hours: 0 },
  { label: '2 hours', hours: 2 },
  { label: '4 hours', hours: 4 },
  { label: '12 hours', hours: 12 },
  { label: '24 hours', hours: 24 },
  { label: '48 hours', hours: 48 },
  { label: '1 week', hours: 168 },
]

/**
 * A friendlier replacement for a bare 0–168 number box: a segmented pill set
 * of common windows plus a "Custom…" escape hatch that reveals a number input.
 * The value is always an integer count of hours — the presets are just the
 * common landing spots.
 */
function NoticePicker({
  value,
  onChange,
  idBase,
}: {
  value: number
  onChange: (hours: number) => void
  /** Stable id prefix for the custom input (label association). */
  idBase: string
}) {
  const matchesPreset = NOTICE_PRESETS.some((p) => p.hours === value)
  // "Custom" is active whenever the stored value isn't one of the presets.
  const [customOpen, setCustomOpen] = useState(!matchesPreset)

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-1.5 sm:justify-end">
        {NOTICE_PRESETS.map((p) => {
          const active = !customOpen && p.hours === value
          return (
            <button
              key={p.hours}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCustomOpen(false)
                onChange(p.hours)
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                active
                  ? 'bg-teal-500 border-teal-500 text-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100'
              }`}
            >
              {p.label}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={customOpen}
          onClick={() => setCustomOpen(true)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
            customOpen
              ? 'bg-teal-500 border-teal-500 text-white dark:text-gray-900'
              : 'bg-white dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100'
          }`}
        >
          Custom…
        </button>
      </div>
      {customOpen && (
        <label className="flex items-center gap-2" htmlFor={`${idBase}-custom`}>
          <input
            id={`${idBase}-custom`}
            type="number"
            min={0}
            max={168}
            step={1}
            value={value}
            onChange={(e) => {
              const n = Math.min(168, Math.max(0, Math.round(Number(e.target.value) || 0)))
              onChange(n)
            }}
            className="w-20 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 tabular-nums font-mono-num"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">hours</span>
        </label>
      )}
    </div>
  )
}

export default function PortalSettingsForm({
  initial,
  connectReady,
  storefrontEnabled,
}: {
  initial: PortalSettings
  /** Clinic's Stripe Connect account is active (gates the payments toggle). */
  connectReady: boolean
  storefrontEnabled: boolean
}) {
  const [settings, setSettings] = useState<PortalSettings>(initial)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const setFeature = (key: keyof PortalFeatureFlags, value: boolean) =>
    setSettings((s) => ({ ...s, features: { ...s.features, [key]: value } }))

  const toggleType = (t: string) =>
    setSettings((s) => {
      const has = s.booking.allowedTypes.includes(t)
      const next = has ? s.booking.allowedTypes.filter((x) => x !== t) : [...s.booking.allowedTypes, t]
      if (next.length === 0) return s // at least one type stays bookable
      return { ...s, booking: { ...s.booking, allowedTypes: next } }
    })

  const setCopy = (key: keyof PortalSettings['copy'], value: string) =>
    setSettings((s) => ({ ...s, copy: { ...s.copy, [key]: value.trim() === '' ? null : value } }))

  const setAutoReply = (patch: Partial<PortalSettings['autoReply']>) =>
    setSettings((s) => ({ ...s, autoReply: { ...s.autoReply, ...patch } }))

  const save = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await savePortalSettingsAction(settings)
      if (res.ok) {
        setFeedback({ kind: 'ok', msg: 'Saved. Patients see the change on their next page load.' })
        setTimeout(() => setFeedback(null), 5000)
      } else {
        setFeedback({ kind: 'err', msg: res.error })
      }
    })
  }

  const featuresTab = (
    <SettingsSection
      title="What patients can do"
      description="Switch a feature off and it disappears from the portal entirely — no dead links, no greyed-out buttons."
    >
      {FEATURE_ORDER.map((key) => {
        const meta = PORTAL_FEATURE_LABELS[key]

        // The payments feature is special: it needs a live Stripe Connect
        // account, so we surface a callout ABOVE the toggle explaining why it's
        // locked (rather than burying it in the toggle's help), and the toggle
        // stays disabled until Connect is active.
        if (key === 'payments') {
          return (
            <div key={key}>
              {!connectReady && (
                <div
                  role="note"
                  className="mb-3 flex items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-50/60 px-3.5 py-3 text-xs leading-relaxed text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200"
                >
                  <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 fill-current" aria-hidden="true">
                    <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 3.25A1.25 1.25 0 1 1 8 5.75 1.25 1.25 0 0 1 8 3.25ZM9.5 12h-3v-1h1V8h-1V7h2v4h1v1Z" />
                  </svg>
                  <span>
                    Online payments need a connected Stripe account. Set one up under{' '}
                    <a href="/shop" className="font-medium underline underline-offset-2">
                      Shop → Connect
                    </a>{' '}
                    to turn this on. Payments land in your bank; you post them to your PMS ledger.
                  </span>
                </div>
              )}
              <SettingsRow
                label={meta.label}
                description={meta.description}
                control={
                  <Toggle
                    checked={settings.features.payments}
                    onChange={(v) => setFeature('payments', v)}
                    disabled={!connectReady}
                    srLabel={meta.label}
                  />
                }
              />
            </div>
          )
        }

        const description =
          key === 'shopLink' && !storefrontEnabled ? (
            <>
              {meta.description}{' '}
              <span className="text-amber-700 dark:text-amber-300">
                Your storefront is currently off, so this link stays hidden either way.
              </span>
            </>
          ) : (
            meta.description
          )

        return (
          <SettingsRow
            key={key}
            label={meta.label}
            description={description}
            control={
              <Toggle checked={settings.features[key]} onChange={(v) => setFeature(key, v)} srLabel={meta.label} />
            }
          />
        )
      })}
    </SettingsSection>
  )

  const bookingTab = (
    <SettingsSection
      title="Online booking rules"
      description="Which visits patients can put on your calendar themselves, and how far ahead."
    >
      <div className="border-t border-gray-100 dark:border-gray-700/50 py-3.5 first:border-t-0 first:pt-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">Bookable visit types</p>
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400 mb-2.5 max-w-prose">
          Keep procedure visits off this list so the front desk books the right chair time. Patients are pointed to
          call for anything not selected. At least one type stays on.
        </p>
        <div className="flex flex-wrap gap-2">
          {PORTAL_BOOKABLE_TYPES.map((t) => {
            const active = settings.booking.allowedTypes.includes(t.value)
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleType(t.value)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-teal-500 border-teal-500 text-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <SettingsRow
        label="Earliest online booking"
        description="How much notice you need before the first slot a patient can grab — on your website and in the portal. None = they can book the very next open slot."
        control={
          <NoticePicker
            idBase="booking-notice"
            value={settings.booking.minNoticeHours}
            onChange={(hours) =>
              setSettings((s) => ({ ...s, booking: { ...s.booking, minNoticeHours: hours } }))
            }
          />
        }
      />

      <SettingsRow
        label="Reschedule / cancel cutoff"
        description="Inside this window patients are asked to call instead of moving or cancelling online — protects tomorrow's schedule."
        control={
          <NoticePicker
            idBase="reschedule-notice"
            value={settings.reschedule.minNoticeHours}
            onChange={(hours) => setSettings((s) => ({ ...s, reschedule: { minNoticeHours: hours } }))}
          />
        }
      />

      <p className="pt-3.5 text-xs text-gray-500 dark:text-gray-400">
        The supply side of booking — visit types and durations, providers, chairs, and the
        master self-scheduling switch — lives in{' '}
        <a href="/settings/practice" className="font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4">
          Settings → Practice
        </a>
        .
      </p>
    </SettingsSection>
  )

  const voiceTab = (
    <>
      <SettingsSection title="Your portal's voice" description="Leave a field empty to use our warm defaults.">
        <SettingsRow
          label="Welcome headline"
          htmlFor="portal-welcome-headline"
          description={
            <>
              The greeting on the portal home. Use <code className="font-mono-num">{'{firstName}'}</code> for the
              patient&apos;s name.
            </>
          }
          control={
            <input
              id="portal-welcome-headline"
              type="text"
              value={settings.copy.welcomeHeadline ?? ''}
              onChange={(e) => setCopy('welcomeHeadline', e.target.value)}
              placeholder="Good morning, {firstName}"
              className="form-input w-full sm:w-72 text-sm"
              maxLength={80}
            />
          }
        />
        <SettingsRow
          label="Welcome message"
          htmlFor="portal-welcome-message"
          description="One warm sentence under the greeting."
          control={
            <input
              id="portal-welcome-message"
              type="text"
              value={settings.copy.welcomeMessage ?? ''}
              onChange={(e) => setCopy('welcomeMessage', e.target.value)}
              placeholder="We're glad you're here. However long it's been — no judgment, ever."
              className="form-input w-full sm:w-72 text-sm"
              maxLength={160}
            />
          }
        />
        <SettingsRow
          label="Announcement bar"
          htmlFor="portal-announcement"
          description="Shows at the top of every portal page until a patient dismisses it. Empty = hidden."
          control={
            <input
              id="portal-announcement"
              type="text"
              value={settings.copy.announcement ?? ''}
              onChange={(e) => setCopy('announcement', e.target.value)}
              placeholder="We're closed July 4th — book around the holiday!"
              className="form-input w-full sm:w-72 text-sm"
              maxLength={160}
            />
          }
        />
        <SettingsRow
          label="After-visit care note"
          htmlFor="portal-aftercare"
          description="Shown on a patient's portal home for a week after a completed visit. Empty = hidden."
          control={
            <textarea
              id="portal-aftercare"
              value={settings.copy.aftercareNote ?? ''}
              onChange={(e) => setCopy('aftercareNote', e.target.value)}
              placeholder={'Rinse gently with warm salt water for the first 24 hours.\nA little sensitivity is normal — call us if anything feels wrong.'}
              rows={3}
              className="form-textarea w-full sm:w-80 text-sm"
              maxLength={1000}
            />
          }
        />
        <SettingsRow
          label="Show team photos"
          description="Provider headshots on visit cards — real faces patients recognize."
          control={
            <Toggle
              checked={settings.display.showTeamPhotos}
              onChange={(v) => setSettings((s) => ({ ...s, display: { showTeamPhotos: v } }))}
              srLabel="Show team photos"
            />
          }
        />
      </SettingsSection>

      {/* After-hours auto-reply — sends one courteous ack to a patient's portal
          message when the office is closed (per your hours + timezone). */}
      <SettingsSection
        title="After-hours auto-reply"
        description="When a patient messages you outside your office hours, send one automatic acknowledgement so they know you got it. You still owe a real reply — the thread stays unread."
        className="mt-5"
      >
        <SettingsRow
          label="Send an after-hours acknowledgement"
          description="Off by default — turn it on to auto-reply once to messages that arrive while you're closed (deduplicated so a patient never gets spammed)."
          control={
            <Toggle
              checked={settings.autoReply.enabled}
              onChange={(v) => setAutoReply({ enabled: v })}
              srLabel="Enable after-hours auto-reply"
            />
          }
        />
        {settings.autoReply.enabled && (
          <SettingsRow
            label="Auto-reply message"
            htmlFor="portal-autoreply-message"
            description={
              <>
                Use <code className="font-mono-num">{'{clinic}'}</code> for your clinic name. Empty = our warm default.
              </>
            }
            control={
              <textarea
                id="portal-autoreply-message"
                value={settings.autoReply.message ?? ''}
                onChange={(e) => setAutoReply({ message: e.target.value.trim() === '' ? null : e.target.value })}
                placeholder={DEFAULT_AUTO_REPLY_MESSAGE}
                rows={3}
                className="form-textarea w-full sm:w-80 text-sm"
                maxLength={1000}
              />
            }
          />
        )}
      </SettingsSection>
    </>
  )

  return (
    <div className="space-y-5">
      <SettingsTabs
        tabs={[
          { id: 'features', label: 'Features', content: featuresTab },
          { id: 'booking', label: 'Booking', content: bookingTab },
          { id: 'voice', label: 'Voice & display', content: voiceTab },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ActionButton variant="primary" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save portal settings'}
        </ActionButton>
        <ActionButton href="/settings/portal/preview" variant="secondary" target="_blank">
          Preview as a patient ↗
        </ActionButton>
        {feedback && (
          <span
            className={`text-sm font-medium ${
              feedback.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
            }`}
          >
            {feedback.msg}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Preview uses your saved settings — save first to see your latest changes.
      </p>
    </div>
  )
}
