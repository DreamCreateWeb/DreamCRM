'use client'

import { useState, useTransition } from 'react'
import { saveNotificationPrefs, setMyEmailReportsOptOutAction } from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { SaveBar } from '@/components/ui/save-bar'
import { useToast } from '@/components/ui/toast'
import { Toggle } from '@/components/ui/toggle'
import { SettingsSection, SettingsRow } from '../settings-kit'
import { SettingsTabs } from '../settings-tabs'
import type { EmailMode } from '@/lib/types/notifications'

/**
 * Personal notification preferences.
 *
 * Rebuilt honest in the 2026-08-25 notifications overhaul:
 *  - The old "Email digest" toggle was not a digest — it emailed EVERY bell
 *    event the moment it happened, and shipped ON. It is now a three-way
 *    delivery MODE (every alert / urgent only / bell only) whose copy says
 *    exactly what each choice does.
 *  - The third bucket toggle ("Platform updates" / "Product news") was a
 *    switch wired to nothing — no dispatch site has ever sent to the
 *    `offers` bucket — so the row is gone (the column stays; re-add the row
 *    with the first real sender).
 *  - The `includes` lines now enumerate what actually fires, per tenant.
 *
 * NOTE: these controls gate the in-app bell + its email copies only. They do
 * NOT touch transactional email — patient appointment reminders, booking
 * confirmations, and clinic replies send through their own pipelines
 * regardless. Copy stays honest about that.
 */
interface Prefs {
  comments: boolean
  candidates: boolean
  emailMode: EmailMode
  pushNothing: boolean
}

type TenantType = 'platform' | 'clinic' | 'patient'

/** Tenant-aware labels for the two LIVE notification buckets. The schema
 *  columns stay generic (comments / candidates); the wording shown to each
 *  tenant reflects what actually lands in their bell. */
const BUCKET_LABELS: Record<
  TenantType,
  {
    comments: { title: string; description: string; includes: string }
    candidates: { title: string; description: string; includes: string }
  }
> = {
  platform: {
    comments: {
      title: 'Business activity',
      description: 'Bell alerts for the things Dream Create needs to see.',
      includes:
        'Includes: sign-ups, cancellations, failed payments, inbound mail, prospect replies and demo bookings.',
    },
    candidates: {
      title: 'Campaign reports',
      description: 'Bell alerts when a client campaign finishes sending.',
      includes: 'Includes: sent confirmations, and sends that finished with errors.',
    },
  },
  clinic: {
    comments: {
      title: 'Patient activity',
      description: 'Bell alerts for messages, bookings, forms, payments, and reviews.',
      includes:
        'Includes: patient messages, website leads, bookings and schedule changes, intake forms, payments, low reviews and survey scores, and connection problems that need a look.',
    },
    candidates: {
      title: 'Campaign reports',
      description: 'Bell alerts when a recall or marketing campaign finishes sending.',
      includes: 'Includes: sent confirmations, and sends that finished with errors.',
    },
  },
  patient: {
    comments: {
      title: 'Clinic message alerts',
      description: 'Alerts when your clinic replies. (Reminders always reach you regardless.)',
      includes: 'Includes: replies from your clinic in the patient portal.',
    },
    candidates: {
      title: 'Visit activity',
      description: 'Alerts about your upcoming visits and recall nudges.',
      includes: 'Includes: upcoming-visit nudges, time-to-book reminders.',
    },
  },
}

/** The three email delivery modes, in the order shown. Copy is the contract:
 *  each option says exactly what reaches the inbox. */
const EMAIL_MODE_OPTIONS: Array<{
  value: EmailMode
  label: string
  description: (tenant: TenantType) => string
}> = [
  {
    value: 'urgent',
    label: 'Just the important ones',
    description: (t) =>
      t === 'clinic'
        ? 'Emails when a person is waiting on you or something went wrong — a new patient message or lead, a low review or survey score, a failed payment, a bounced message, a sync problem. Routine activity (bookings, forms, payments received) stays in the bell.'
        : 'Emails when something needs a human — new mail, a sign-up or cancellation, a failed payment, a prospect ready for a call. Routine activity stays in the bell.',
  },
  {
    value: 'all',
    label: 'Every alert',
    description: () =>
      'Every bell alert also lands in your inbox as its own email, the moment it happens. Busy days mean a busy inbox.',
  },
  {
    value: 'none',
    label: 'Bell only',
    description: () =>
      'Nothing from the bell reaches your email. You’ll see alerts the next time you open the dashboard.',
  },
]

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
  const labels = BUCKET_LABELS[tenantType]
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

  function toggle(key: 'comments' | 'candidates' | 'pushNothing') {
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

  function prefRow(
    prefKey: 'comments' | 'candidates' | 'pushNothing',
    title: string,
    description: string,
    includes?: string,
  ) {
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
              <SettingsSection description={`Pick which activity shows up in your notification bell. These control the bell and its email copies — never transactional email${tenantType === 'clinic' ? ' like appointment reminders or booking confirmations' : ''}, which always sends.`}>
                {prefRow('comments', labels.comments.title, labels.comments.description, labels.comments.includes)}
                {prefRow('candidates', labels.candidates.title, labels.candidates.description, labels.candidates.includes)}
              </SettingsSection>
            ),
          },
          {
            id: 'delivery',
            label: 'Delivery',
            content: (
              <SettingsSection description="Which of those alerts also reach your email inbox.">
                {/* NOTE: no "mobile/desktop push" toggle — we don't ship push (no service
                    worker / FCM / APNs), so a toggle promising it would be write-only. */}
                <fieldset>
                  <legend className="sr-only">Email delivery</legend>
                  <div className="space-y-2.5">
                    {EMAIL_MODE_OPTIONS.map((opt) => {
                      const active = prefs.emailMode === opt.value
                      return (
                        <label
                          key={opt.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-[var(--r-sm)] p-3.5 ring-1 ring-inset transition-colors ${
                            active
                              ? 'bg-teal-500/[0.06] ring-teal-500/40 dark:bg-teal-400/[0.06]'
                              : 'ring-[color:var(--color-hairline)] hover:bg-gray-50 dark:hover:bg-gray-800/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name="email-mode"
                            value={opt.value}
                            checked={active}
                            onChange={() => setPrefs((p) => ({ ...p, emailMode: opt.value }))}
                            className="form-radio mt-0.5 shrink-0 text-teal-600"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                              {opt.label}
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                              {opt.description(tenantType)}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>

                {prefRow('pushNothing', 'Pause all', 'Temporarily silence every alert — the bell and its emails (overrides everything above).')}

                {/* The recurring REPORT emails — the morning digest + the
                    Monday week-in-review — are a different pipeline from the
                    alert emails above, and their footer points at this page,
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
                      <strong className="font-semibold">Pause all silences the notification bell and its emails.</strong>{' '}
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
