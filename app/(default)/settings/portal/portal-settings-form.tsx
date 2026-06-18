'use client'

import { useState, useTransition } from 'react'
import {
  PORTAL_FEATURE_LABELS,
  PORTAL_BOOKABLE_TYPES,
  type PortalSettings,
  type PortalFeatureFlags,
} from '@/lib/types/portal'
import { savePortalSettingsAction } from './actions'
import { ActionButton } from '@/components/ui/action-button'
import { Toggle } from '@/components/ui/toggle'
import { SettingsTabs } from '../settings-tabs'

/**
 * Settings → Patient portal. Everything the clinic can shape about the
 * patient experience: feature switches (off = patients never see it),
 * booking/notice behavior, and the portal's voice. Office-manager UX:
 * tabbed, plain labels, one Save. The form is fully controlled (`settings`
 * state), so Save persists every tab regardless of which is showing.
 */

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="v2-card p-5">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{sub}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

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
    <Section
      title="What patients can do"
      sub="Switch a feature off and it disappears from the portal entirely — no dead links, no greyed-out buttons."
    >
      {FEATURE_ORDER.map((key) => {
        const meta = PORTAL_FEATURE_LABELS[key]
        const paymentsLocked = key === 'payments' && !connectReady
        const shopNote = key === 'shopLink' && !storefrontEnabled
        return (
          <div key={key} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{meta.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                {meta.description}
              </p>
              {paymentsLocked && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Connect Stripe under Shop first — until then patients see the call-to-pay fallback.
                </p>
              )}
              {shopNote && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Your storefront is currently disabled, so this link stays hidden either way.
                </p>
              )}
            </div>
            <Toggle checked={settings.features[key]} onChange={(v) => setFeature(key, v)} srLabel={meta.label} />
          </div>
        )
      })}
    </Section>
  )

  const bookingTab = (
    <Section
      title="Online booking rules"
      sub="Which visits patients can put on your calendar themselves."
    >
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">Bookable visit types</p>
        <div className="flex flex-wrap gap-2">
          {PORTAL_BOOKABLE_TYPES.map((t) => {
            const active = settings.booking.allowedTypes.includes(t.value)
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => toggleType(t.value)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-teal-500 border-teal-500 text-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Keep procedure visits off this list so the front desk books the right chair time —
          patients are pointed to call for anything not listed.
        </p>
      </div>
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
          Earliest online booking
          <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
            Hours of notice before the first bookable slot.
          </span>
        </span>
        <input
          type="number"
          min={0}
          max={168}
          value={settings.booking.minNoticeHours}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              booking: { ...s.booking, minNoticeHours: Math.max(0, Number(e.target.value) || 0) },
            }))
          }
          className="form-input w-24 text-sm"
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
          Reschedule / cancel cutoff
          <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
            Inside this window patients are asked to call instead of self-serving.
          </span>
        </span>
        <input
          type="number"
          min={0}
          max={168}
          value={settings.reschedule.minNoticeHours}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              reschedule: { minNoticeHours: Math.max(0, Number(e.target.value) || 0) },
            }))
          }
          className="form-input w-24 text-sm"
        />
      </label>
    </Section>
  )

  const voiceTab = (
    <Section
      title="Your portal's voice"
      sub="Leave a field empty to use our warm defaults."
    >
      <label className="block">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Welcome headline</span>
        <input
          type="text"
          value={settings.copy.welcomeHeadline ?? ''}
          onChange={(e) => setCopy('welcomeHeadline', e.target.value)}
          placeholder="Good morning, {firstName}"
          className="form-input w-full text-sm mt-1.5"
          maxLength={80}
        />
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">
          {'{firstName}'} fills in the patient&apos;s name.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Welcome message</span>
        <input
          type="text"
          value={settings.copy.welcomeMessage ?? ''}
          onChange={(e) => setCopy('welcomeMessage', e.target.value)}
          placeholder="We're glad you're here. However long it's been — no judgment, ever."
          className="form-input w-full text-sm mt-1.5"
          maxLength={160}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Announcement bar</span>
        <input
          type="text"
          value={settings.copy.announcement ?? ''}
          onChange={(e) => setCopy('announcement', e.target.value)}
          placeholder="We're closed July 4th — book around the holiday!"
          className="form-input w-full text-sm mt-1.5"
          maxLength={160}
        />
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">
          Shows at the top of every portal page until a patient dismisses it. Empty = hidden.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">After-visit care note</span>
        <textarea
          value={settings.copy.aftercareNote ?? ''}
          onChange={(e) => setCopy('aftercareNote', e.target.value)}
          placeholder={'Rinse gently with warm salt water for the first 24 hours.\nA little sensitivity is normal — call us if anything feels wrong.'}
          rows={3}
          className="form-textarea w-full text-sm mt-1.5"
          maxLength={1000}
        />
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">
          Shown on a patient&apos;s portal home for a week after a completed visit. Empty = hidden.
        </span>
      </label>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Show team photos</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Provider headshots on visit cards — real faces patients recognize.
          </p>
        </div>
        <Toggle
          checked={settings.display.showTeamPhotos}
          onChange={(v) => setSettings((s) => ({ ...s, display: { showTeamPhotos: v } }))}
          srLabel="Show team photos"
        />
      </div>
    </Section>
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
