'use client'

import { useEffect, useState } from 'react'

const SEEN_KEY = 'dc-studio-welcome-done'

/**
 * One-time first-open welcome for the Website Studio. The Studio's whole
 * power is invisible until you know the three moves (click text, hover
 * sections, ask the AI) — this names them once, then gets out of the way
 * forever (localStorage-flagged, per browser). Renders nothing on every
 * later visit; ESC or any button dismisses.
 */
export default function StudioWelcome() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SEEN_KEY) !== '1') setShow(true)
    } catch {
      /* privacy mode → skip the welcome rather than nag every visit */
    }
  }, [])

  function dismiss() {
    setShow(false)
    try {
      window.localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  if (!show) return null

  const tips: Array<{ icon: string; title: string; body: string }> = [
    {
      icon: '✏️',
      title: 'Click any text to edit it',
      body: 'Headlines, paragraphs, buttons — click, type, done. Every save is live.',
    },
    {
      icon: '🪄',
      title: 'Hover a section for its Edit button',
      body: 'Photos, your team, hours, FAQs — each section opens its own focused editor.',
    },
    {
      icon: '✨',
      title: 'Or just ask the AI',
      body: 'The bar at the bottom takes plain English — “make the headline warmer”, “add a stat about same-week visits”.',
    },
    {
      icon: '📱',
      title: 'Check the phone view',
      body: 'Most patients visit on a phone — the 📱 toggle up top shows exactly what they see.',
    },
  ]

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to the Website Studio"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-400 mb-2">
          Your website, editable in place
        </p>
        <h2 className="text-xl font-bold text-white mb-4">
          This is the real thing — edit it right here.
        </h2>
        <ul className="space-y-3.5 mb-6">
          {tips.map((t) => (
            <li key={t.title} className="flex items-start gap-3">
              <span aria-hidden="true" className="text-lg leading-6 shrink-0">
                {t.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-100 leading-snug">{t.title}</p>
                <p className="text-[13px] text-gray-400 leading-relaxed">{t.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={dismiss}
          autoFocus
          className="w-full rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold py-2.5 transition-colors"
        >
          Start editing
        </button>
      </div>
    </div>
  )
}
