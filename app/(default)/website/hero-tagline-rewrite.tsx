'use client'

import { useState } from 'react'
import { aiRewriteSection } from './ai-actions'
import { saveInlineField } from './website-actions'
import type { AiUsageSnapshot } from '@/lib/types/ai-website'

/**
 * Hero-tagline "✨ Rewrite with AI" affordance for the Website Studio top bar.
 *
 * The hero tagline edits INLINE on the canvas (no section modal), so its AI
 * affordance lives in the chrome. It generates a draft, shows it for REVIEW in a
 * small popover, and only writes it when the owner clicks "Use this" (never
 * auto-saves). Gates gracefully when the monthly allowance is spent. Shares the
 * lifted usage counter with the rest of the Studio.
 */
export default function HeroTaglineRewrite({
  currentTagline,
  usage,
  onUsage,
  onSaved,
}: {
  currentTagline: string | null
  usage: AiUsageSnapshot
  onUsage: (next: AiUsageSnapshot) => void
  /** Called after the chosen tagline is persisted, so the canvas can reload. */
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const outOfRewrites = usage.remaining <= 0

  async function generate() {
    setBusy(true)
    setError(null)
    setDraft(null)
    setOpen(true)
    try {
      const res = await aiRewriteSection('hero')
      if (res.ok && res.content.section === 'hero') {
        onUsage(res.usage)
        setDraft(res.content.tagline)
      } else if (!res.ok && res.reason === 'limit') {
        onUsage(res.usage)
        setError('✨ 0 left — resets on the 1st; edit the tagline by hand.')
      } else if (!res.ok) {
        setError(res.error)
      }
    } catch {
      setError('AI request failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  async function useDraft() {
    if (!draft) return
    setSaving(true)
    try {
      const res = await saveInlineField('tagline', draft)
      if (res.ok) {
        setOpen(false)
        setDraft(null)
        onSaved()
      } else {
        setError(res.error)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void generate())}
        disabled={busy}
        title={outOfRewrites ? 'No AI rewrites left this month' : 'Rewrite your hero tagline with AI'}
        className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-200 hover:bg-white/10 transition disabled:opacity-50"
        data-testid="hero-tagline-rewrite"
      >
        {busy ? 'Writing…' : '✨ Tagline'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-[var(--r-lg)] bg-gray-900/95 backdrop-blur-xl border border-white/10 shadow-[var(--shadow-modal)] p-3 text-gray-100 z-[80]">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">Suggested tagline</p>
          {busy && <p className="text-sm text-gray-300">Writing a fresh tagline…</p>}
          {!busy && draft && (
            <>
              <p className="text-sm font-medium text-white mb-1">“{draft}”</p>
              {currentTagline && (
                <p className="text-[11px] text-gray-400 mb-2 line-clamp-1">
                  Now: {currentTagline}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={useDraft}
                  disabled={saving}
                  className="inline-flex items-center rounded-full bg-teal-500 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Use this'}
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy || outOfRewrites}
                  className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-gray-200 hover:bg-white/10 disabled:opacity-40"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-auto text-xs text-gray-400 hover:text-white"
                >
                  Discard
                </button>
              </div>
              <p className="mt-2 text-[10px] text-gray-500">
                {usage.remaining} AI rewrite{usage.remaining === 1 ? '' : 's'} left this month
              </p>
            </>
          )}
          {!busy && error && <p className="text-xs text-amber-300">{error}</p>}
        </div>
      )}
    </div>
  )
}
