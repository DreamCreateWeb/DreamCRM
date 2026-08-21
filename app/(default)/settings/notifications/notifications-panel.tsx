'use client'

import { useState, useTransition } from 'react'
import { saveNotificationPrefs, setMyEmailReportsOptOutAction } from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { SaveBar } from '@/components/ui/save-bar'
import { useToast } from '@/components/ui/toast'
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

export default function NotificationsPanel({
  initial,
  tenantType,
  emailReportsOptedOut = null,
}: {
  initial: Prefs
  tenantType: TenantType
  /** Clinic staff only: whether this member muted the recurring report
   *  emails (morning digest + Monday week-in-review). null hides the
   *  section (platform/patient tenants don't get these emails). */
  emailReportsOptedOut?: boolean | null
}) {
  const labels = EMAIL_LABELS[tenantType]
  const toast = useToast()
  const [prefs, setPrefs] = useState<Prefs>(initial)
  // Baseline moves on every successful save, so "Saved" can actually show
  // (comparing against the immutable server prop left the form dirty forever).
  const [baseline, setBaseline] = useState<Prefs>(initial)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const dirty = JSON.stringify(prefs) !== JSON.stringify(baseline)
  // The report-emails mute saves IMMEDIATELY (it's the same switch as My
  // Day's — one tap, no Save button), separate from the form's dirty flow.
  const [reportsOptedOut, setReportsOptedOut] = useState(emailReportsOptedOut ?? false)
  const [reportsPending, startReportsTransition] = useTransition()

  function toggleEmailReports() {
    const next = !reportsOptedOut
    setReportsOptedOut(next)
    startReportsTransition(async () => {
      const res = await setMyEmailReportsOptOutAction(next)
      if ('error' in res) {
        setReportsOptedOut(!next)
        toast(res.error, { tone: 'urgent' })
      } else {
        toast(next ? 'Report emails muted for you.' : 'Report emails back on for you.')
      }
    })
  }

  function toggle<K extends keyof Prefs>(key: K) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    startTransition(async () => {
      try {
        await saveNotificationPrefs(prefs)
        setBaseline(prefs)
        setSaved(true)
        toast('Preferences saved.')
      } catch (err) {
        toast((err as Error).message, { tone: 'urgent' })
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
              <span className="mt-1 block text-gray-500 dark:text-gray-400">{includes}</span>
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

                {/* The recurring REPORT emails — the morning digest + the
                    Monday week-in-review — are a different pipeline from the
                    alert digest above, and their footer points at this page,
                    so this page must actually be able to silence them
                    (Phase-2 self-sweep). Saves immediately; same per-staff
                    switch as My Day's. */}
                {emailReportsOptedOut != null && (
                  <SettingsRow
                    label="My report emails"
                    description={
                      <>
                        The Monday week-in-review, plus the morning digest when your clinic has it on.
                        <span className="mt-1 block text-gray-500 dark:text-gray-400">
                          Just for you — the rest of the team keeps theirs. Saves right away.
                        </span>
                      </>
                    }
                    control={
                      <Toggle
                        checked={!reportsOptedOut}
                        onChange={toggleEmailReports}
                        disabled={reportsPending}
                        srLabel="My report emails"
                      />
                    }
                  />
                )}

                {prefs.pushNothing && (
                  <div
                    role="note"
                    className="mt-3.5 flex items-start gap-2 rounded-[var(--r-sm)] bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200"
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

      <div className="mt-2 flex items-center justify-between gap-3">
        <SaveBar dirty={dirty} saved={saved} pending={pending} onSave={() => onSubmit()} />
        {dirty && (
          <ActionButton variant="ghost" size="sm" disabled={pending} onClick={() => setPrefs(baseline)}>
            Reset
          </ActionButton>
        )}
      </div>
    </form>
  )
}
