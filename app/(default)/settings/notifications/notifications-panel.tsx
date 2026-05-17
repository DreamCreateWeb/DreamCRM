'use client'

import { useState, useTransition } from 'react'
import { saveNotificationPrefs } from '../actions'

interface Prefs {
  comments: boolean
  candidates: boolean
  offers: boolean
  pushEverything: boolean
  pushEmail: boolean
  pushNothing: boolean
}

export default function NotificationsPanel({ initial }: { initial: Prefs }) {
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
          <div className="text-sm">{description}</div>
        </div>
        <div className="flex items-center ml-4">
          <div className="text-sm text-gray-400 dark:text-gray-500 italic mr-2">{value ? 'On' : 'Off'}</div>
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
            <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Email</h3>
            <ul>
              <ToggleRow id="np-comments" prefKey="comments" title="Comments and replies" description="When someone comments on your posts or replies to your threads." />
              <ToggleRow id="np-candidates" prefKey="candidates" title="Candidates" description="New leads, applicants and people you might want to follow up with." />
              <ToggleRow id="np-offers" prefKey="offers" title="Offers and product news" description="Occasional product announcements and special offers." />
            </ul>
          </section>

          <section>
            <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Push notifications</h3>
            <ul>
              <ToggleRow id="np-push-all" prefKey="pushEverything" title="Everything" description="Mobile + desktop pushes for all activity." />
              <ToggleRow id="np-push-email" prefKey="pushEmail" title="Email digest" description="Daily digest of activity to your inbox." />
              <ToggleRow id="np-push-nothing" prefKey="pushNothing" title="Pause all" description="Temporarily silence every notification (overrides others)." />
            </ul>
          </section>
        </div>

        <footer>
          <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
            {feedback?.error && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{feedback.error}</div>
            )}
            {feedback?.ok && (
              <div className="mb-3 text-sm text-green-700 bg-green-50 dark:bg-green-500/10 px-3 py-2 rounded">{feedback.ok}</div>
            )}
            <div className="flex self-end">
              <button type="button" onClick={() => setPrefs(initial)} className="btn dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300">Cancel</button>
              <button type="submit" disabled={pending} className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-3 disabled:opacity-60">
                {pending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </footer>
      </form>
    </div>
  )
}
