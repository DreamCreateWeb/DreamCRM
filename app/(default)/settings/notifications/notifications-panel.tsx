'use client'

import { useState, useTransition } from 'react'
import { saveNotificationPrefs } from '../actions'
import { ActionButton } from '@/components/ui/action-button'

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

  function toggle<K extends keyof Prefs>(key: K) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      try {
        await saveNotificationPrefs(prefs)
        setFeedback({ ok: 'Preferences saved' })
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  function ToggleRow({ id, title, description, prefKey }: { id: string; title: string; description: string; prefKey: keyof Prefs }) {
    const value = prefs[prefKey]
    return (
      <li className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
        <div>
          <div className="text-gray-800 dark:text-gray-100 font-semibold">{title}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{description}</div>
        </div>
        <div className="flex items-center ml-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 italic mr-2">{value ? 'On' : 'Off'}</div>
          <div className="form-switch">
            <input type="checkbox" id={id} className="sr-only" checked={value} onChange={() => toggle(prefKey)} />
            <label htmlFor={id}>
              <span className="bg-white shadow-sm" aria-hidden="true"></span>
              <span className="sr-only">Toggle {title}</span>
            </label>
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className="grow">
      <form onSubmit={onSubmit}>
        <div className="p-6 space-y-6">
          <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-5">My Notifications</h2>

          <section>
            <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">In-app alerts</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Pick which activity shows up in your notification bell.
            </p>
            <ul>
              <ToggleRow id="np-comments" prefKey="comments" title={labels.comments.title} description={labels.comments.description} />
              <ToggleRow id="np-candidates" prefKey="candidates" title={labels.candidates.title} description={labels.candidates.description} />
              <ToggleRow id="np-offers" prefKey="offers" title={labels.offers.title} description={labels.offers.description} />
            </ul>
          </section>

          <section>
            <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Delivery</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              How these alerts reach you, on top of the bell.
            </p>
            <ul>
              <ToggleRow id="np-push-all" prefKey="pushEverything" title="Everything" description="Mobile + desktop pushes for all activity." />
              <ToggleRow id="np-push-email" prefKey="pushEmail" title="Email digest" description="Email a copy of these alerts to your inbox." />
              <ToggleRow id="np-push-nothing" prefKey="pushNothing" title="Pause all" description="Temporarily silence every alert (overrides others)." />
            </ul>
          </section>
        </div>

        <footer>
          <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
            {feedback?.error && (
              <div className="mb-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded">{feedback.error}</div>
            )}
            {feedback?.ok && (
              <div className="mb-3 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded">{feedback.ok}</div>
            )}
            <div className="flex self-end gap-3">
              <ActionButton variant="secondary" onClick={() => setPrefs(initial)}>Cancel</ActionButton>
              <ActionButton variant="primary" type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save Changes'}
              </ActionButton>
            </div>
          </div>
        </footer>
      </form>
    </div>
  )
}
