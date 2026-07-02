'use client'

import { useState } from 'react'
import { submitChatMessage } from '@/app/site/[slug]/actions'
import FormTrustFields from '@/components/clinic-site/form-trust-fields'

/**
 * The "Message us" bubble on every public clinic page — the site's
 * lowest-friction contact path (Weave Text Connect / RevenueWell web chat
 * parity, email-reply channel for v1; SMS when the channel lands). Bottom-LEFT
 * so it never collides with SiteMobileActions' bottom-right stack. Message →
 * inbound thread in the clinic's /messages inbox; replies land in the
 * visitor's email. No account, no sign-in.
 */

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

export default function SiteChatWidget({
  slug,
  brand,
  clinicName,
}: {
  slug: string
  brand: string
  clinicName: string
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'pending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('slug', slug)
    setState('pending')
    setError('')
    try {
      await submitChatMessage(fd)
      setSentTo(fd.get('email')?.toString() ?? '')
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setState('error')
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 print:hidden">
      {open && (
        <div
          className="mb-3 w-[min(92vw,340px)] rounded-2xl shadow-xl overflow-hidden"
          style={{ backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}` }}
          role="dialog"
          aria-label={`Message ${clinicName}`}
        >
          <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: brand }}>
            <p className="text-sm font-semibold text-white">Message {clinicName}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="text-white/80 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>

          {state === 'sent' ? (
            <div className="p-5 text-center">
              <div className="text-3xl mb-2" aria-hidden="true">📬</div>
              <p className="text-sm font-semibold mb-1" style={{ color: INK }}>
                Got it — thanks!
              </p>
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                Your message is with our front desk. We&rsquo;ll reply to{' '}
                <strong style={{ color: INK }}>{sentTo}</strong>, usually within one business day.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="p-4 space-y-2.5">
              <FormTrustFields />
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                Questions about a visit, insurance, or anything else — we reply by email, usually
                within one business day.
              </p>
              <input
                name="name"
                type="text"
                required
                placeholder="Your name"
                autoComplete="name"
                className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2"
                style={{ color: INK, border: `1px solid ${BORDER}` }}
              />
              <input
                name="email"
                type="email"
                required
                placeholder="Email (for our reply)"
                autoComplete="email"
                inputMode="email"
                className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2"
                style={{ color: INK, border: `1px solid ${BORDER}` }}
              />
              <textarea
                name="message"
                required
                rows={3}
                maxLength={2000}
                placeholder="How can we help?"
                className="w-full px-3 py-2 rounded-xl text-sm resize-none focus:outline-none focus:ring-2"
                style={{ color: INK, border: `1px solid ${BORDER}` }}
              />
              {state === 'error' && error && (
                <p className="text-xs" style={{ color: '#B4231F' }} role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={state === 'pending'}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: brand }}
              >
                {state === 'pending' ? 'Sending…' : 'Send message'}
              </button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close the message widget' : `Message ${clinicName}`}
        className="inline-flex items-center gap-2 rounded-full pl-3.5 pr-4 py-3 shadow-lg transition hover:shadow-xl"
        style={{ backgroundColor: brand, color: '#FFFFFF' }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
          />
        </svg>
        <span className="text-sm font-semibold">{open ? 'Close' : 'Message us'}</span>
      </button>
    </div>
  )
}
