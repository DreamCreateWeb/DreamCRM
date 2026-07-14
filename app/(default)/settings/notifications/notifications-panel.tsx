'use client'

import { useState, useTransition } from 'react'
import { saveNotificationPrefs } from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { Toggle } from '@/components/ui/toggle'
import { SettingsSection, SettingsRow } from '../settings-kit'
import { SettingsTabs } from '../settings-tabs'

/**
 * Personal notification preferences.
 *
 * NOTE on the schema's `push_everything` column: it's intentionally NOT
 * surfaced here. `notify()` (lib/services/notifications.ts) never reads it and
 * the app ships no push channel (no service worker / FCM / APNs), so a control
 * for it would be write-only — exactly the kind of promise-a-capability toggle
 * we don't ship. It stays in the DB (harmless default `false`); this panel
 * simply doesn't send it. `saveNotificationPrefs` → `NotificationPrefsInput`
 * treats every field as optional and `.parse()` strips absent keys, so omitting
 * it leaves the stored value untouched — no shared type change required. (The
 * shared `NotificationPrefsInput` / `getNotificationPrefs` could drop the field
 * entirely in a later pass — FLAGGED in the report, not changed here.)
 */
interface Prefs {
  comments: boolean
  candidates: boolean
  offers: boolean
  pushEmail: boolean
  pushNothing: boolean
}

type TenantType = 'platform' | 'clinic' | 'patient'

/**
 * Tenant-aware labels for the three notification buckets. The schema columns
 * stay generic (comments / candidates / offers) — they're the only three
 * "buckets" of in-app notifications we currently fire — and the wording shown
 * to each tenant reflects what activity actually lands in their bell.
 *
 * IMPORTANT: these toggles control the in-app notification bell + (when "Email
 * digest" is on) a digest email. They do NOT gate transactional email — patient
 * appointment reminders, booking confirmations, and clinic replies send through
 * their own pipelines regardless of these settings. Copy stays honest about
 * that: it describes what shows up in the dashboard, never "we'll stop emailing
 * you reminders," which this can't actually do.
 *
 * Each bucket carries a one-line `includes` explainer so staff know exactly
 * what "Patient activity" vs "Recall & marketing" vs "Platform updates" covers.
 */
const EMAIL_LABELS: Record<
  TenantType,
  {
    comments: { title: string; description: string; includes: string }
    candidates: { title: string; description: string; includes: string }
    offers: { title: string; description: string; includes: string }
  }
> = {
  platform: {
    comments: {
      title: 'Customer activity',
      description: 'Bell alerts when a clinic signs up, upgrades, downgrades, or cancels.',
      includes: 'Includes: new sign-ups, plan changes, add-on purchases, cancellations.',
    },
    candidates: {
      title: 'Support & inbox',
      description: 'Bell alerts when email lands in the platform inbox or a customer replies.',
      includes: 'Includes: new inbox email, customer replies, feedback submissions.',
    },
    offers: {
      title: 'Product news',
      description: 'Occasional release notes and admin tips from Dream Create.',
      includes: 'Includes: release notes, admin tips. (Never marketing to your customers.)',
    },
  },
  clinic: {
    comments: {
      title: 'Patient activity',
      description: 'Bell alerts for new patient inquiries, bookings, and replies.',
      includes: 'Includes: website leads, new bookings, patient messages, intake submissions.',
    },
    candidates: {
      title: 'Recall & marketing',
      description: 'Bell alerts when a recall campaign is sent or a patient becomes due.',
      includes: 'Includes: recall campaigns sent, patients due for recall, review requests.',
    },
    offers: {
      title: 'Platform updates',
      description: 'Occasional DreamCRM product news. (Billing receipts always email separately.)',
      includes: 'Includes: new features, product tips. Not patient- or billing-related.',
    },
  },
  patient: {
    comments: {
      title: 'Clinic message alerts',
      description: 'Bell alerts when your clinic replies. (Reminders always reach you regardless.)',
      includes: 'Includes: replies from your clinic in the patient portal.',
    },
    candidates: {
      title: 'Visit activity',
      description: 'Bell alerts about your upcoming visits and recall nudges.',
      includes: 'Includes: upcoming-visit nudges, time-to-book reminders.',
    },
    offers: {
      title: 'Clinic news',
      description: 'Newsletters and dental health tips from your clinic.',
      includes: 'Includes: clinic newsletters, dental health tips.',
    },
  },
}

export default function NotificationsPanel({ initial, tenantType }: { initial: Prefs; tenantType: TenantType }) {
  const labels = EMAIL_LABELS[tenantType]
  const [prefs, setPrefs] = useState<Prefs>(initial)
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'urgent' } | null>(null)
  const dirty = JSON.stringify(prefs) !== JSON.stringify(initial)

  function toggle<K extends keyof Prefs>(key: K) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setToast(null)
    startTransition(async () => {
      try {
        await saveNotificationPrefs(prefs)
        setToast({ message: 'Preferences saved.', tone: 'ok' })
      } catch (err) {
        setToast({ message: (err as Error).message, tone: 'urgent' })
      }
    })
  }

  function prefRow(prefKey: keyof Prefs, title: string, description: string, includes?: string) {
    return (
      <SettingsRow
        label={title}
        description={
          includes ? (
            <>
              {description}
              <span className="mt-1 block text-gray-400 dark:text-gray-500">{includes}</span>
            </>
          ) : (
            description
          )
        }
        control={<Toggle checked={prefs[prefKey]} onChange={() => toggle(prefKey)} srLabel={title} />}
      />
    )
  }

  return (
    <form onSubmit={onSubmit} className="p-6">
      <SettingsTabs
        tabs={[
          {
            id: 'alerts',
            label: 'In-app alerts',
            content: (
              <SettingsSection description={`Pick which activity shows up in your notification bell. These control the bell (and, with Email digest on, a summary email) — never transactional email${tenantType === 'clinic' ? ' like appointment reminders or booking confirmations' : ''}, which always sends.`}>
                {prefRow('comments', labels.comments.title, labels.comments.description, labels.comments.includes)}
                {prefRow('candidates', labels.candidates.title, labels.candidates.description, labels.candidates.includes)}
                {prefRow('offers', labels.offers.title, labels.offers.description, labels.offers.includes)}
              </SettingsSection>
            ),
          },
          {
            id: 'delivery',
            label: 'Delivery',
            content: (
              <SettingsSection description="How these alerts reach you, on top of the bell.">
                {/* NOTE: no "mobile/desktop push" toggle — we don't ship push (no service
                    worker / FCM / APNs), so a toggle promising it would be write-only.
                    Email digest + Pause all are the two delivery controls that act. */}
                {prefRow('pushEmail', 'Email digest', 'Email a copy of these alerts to your inbox.')}
                {prefRow('pushNothing', 'Pause all', 'Temporarily silence every alert (overrides the buckets above).')}

                {prefs.pushNothing && (
                  <div
                    role="note"
                    className="mt-3.5 flex items-start gap-2 rounded-[var(--r-sm)] border-l-4 border-l-amber-500 border border-amber-200/70 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                  >
                    <svg className="mt-px h-3.5 w-3.5 shrink-0 fill-current" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M8 1.5 15 14H1L8 1.5Zm0 3.6a.9.9 0 0 0-.9.9v3.6a.9.9 0 1 0 1.8 0V6a.9.9 0 0 0-.9-.9Zm0 6.3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
                    </svg>
                    <span>
                      <strong className="font-semibold">Pause all silences the notification bell and the email digest.</strong>{' '}
                      {tenantType === 'clinic'
                        ? 'Transactional patient email — appointment reminders, booking confirmations, and clinic replies — still sends through its own pipeline and is unaffected.'
                        : 'Transactional email (billing receipts, invites, account email) still sends through its own pipeline and is unaffected.'}
                    </span>
                  </div>
                )}
              </SettingsSection>
            ),
          },
        ]}
      />

      <div className="mt-6 flex items-center justify-end gap-3">
        {dirty && (
          <ActionButton variant="secondary" onClick={() => setPrefs(initial)}>
            Reset
          </ActionButton>
        )}
        <ActionButton variant="primary" type="submit" disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save changes'}
        </ActionButton>
      </div>

      {toast && <FlashToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </form>
  )
}
