'use client'

import { useState, useTransition } from 'react'
import { saveNotificationPrefs } from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { Toggle } from '@/components/ui/toggle'
import { SettingsSection, SettingsRow } from '../settings-kit'
import { SettingsTabs } from '../settings-tabs'

interface Prefs {
  comments: boolean
  candidates: boolean
  offers: boolean
  pushEverything: boolean
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
 */
const EMAIL_LABELS: Record<
  TenantType,
  { comments: { title: string; description: string }; candidates: { title: string; description: string }; offers: { title: string; description: string } }
> = {
  platform: {
    comments: {
      title: 'Customer activity',
      description: 'Bell alerts when a clinic signs up, upgrades, downgrades, or cancels.',
    },
    candidates: {
      title: 'Support & inbox',
      description: 'Bell alerts when email lands in the platform inbox or a customer replies.',
    },
    offers: {
      title: 'Product news',
      description: 'Occasional release notes and admin tips from Dream Create.',
    },
  },
  clinic: {
    comments: {
      title: 'Patient activity',
      description: 'Bell alerts for new patient inquiries, bookings, and replies.',
    },
    candidates: {
      title: 'Recall & marketing',
      description: 'Bell alerts when a recall campaign is sent or a patient becomes due.',
    },
    offers: {
      title: 'Platform updates',
      description: 'Occasional DreamCRM product news. (Billing receipts always email separately.)',
    },
  },
  patient: {
    comments: {
      title: 'Clinic message alerts',
      description: 'Bell alerts when your clinic replies. (Reminders always reach you regardless.)',
    },
    candidates: {
      title: 'Visit activity',
      description: 'Bell alerts about your upcoming visits and recall nudges.',
    },
    offers: {
      title: 'Clinic news',
      description: 'Newsletters and dental health tips from your clinic.',
    },
  },
}

export default function NotificationsPanel({ initial, tenantType }: { initial: Prefs; tenantType: TenantType }) {
  const labels = EMAIL_LABELS[tenantType]
  const [prefs, setPrefs] = useState<Prefs>(initial)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)
  const dirty = JSON.stringify(prefs) !== JSON.stringify(initial)

  function toggle<K extends keyof Prefs>(key: K) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      try {
        await saveNotificationPrefs(prefs)
        setFeedback({ ok: 'Preferences saved.' })
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  function prefRow(prefKey: keyof Prefs, title: string, description: string) {
    return (
      <SettingsRow
        label={title}
        description={description}
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
              <SettingsSection description="Pick which activity shows up in your notification bell.">
        {prefRow('comments', labels.comments.title, labels.comments.description)}
        {prefRow('candidates', labels.candidates.title, labels.candidates.description)}
        {prefRow('offers', labels.offers.title, labels.offers.description)}
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
        {prefRow('pushNothing', 'Pause all', 'Temporarily silence every alert (overrides the rest).')}
              </SettingsSection>
            ),
          },
        ]}
      />

      <div className="mt-6 flex items-center justify-end gap-3">
        {feedback?.error && <span className="mr-auto text-sm text-rose-600 dark:text-rose-400">{feedback.error}</span>}
        {feedback?.ok && <span className="mr-auto text-sm text-emerald-600 dark:text-emerald-400">{feedback.ok}</span>}
        {dirty && (
          <ActionButton variant="secondary" onClick={() => setPrefs(initial)}>
            Reset
          </ActionButton>
        )}
        <ActionButton variant="primary" type="submit" disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save changes'}
        </ActionButton>
      </div>
    </form>
  )
}
