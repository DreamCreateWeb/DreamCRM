'use client'

import { useState } from 'react'
import { aiRewriteSection } from './ai-actions'
import type { AiUsageSnapshot, AiWebsiteSection, GeneratedContent } from '@/lib/types/ai-website'

/**
 * Shared "✨ Rewrite with AI" affordance for the Website Studio section modals.
 *
 * Calls `aiRewriteSection(section)` and hands the generated draft to `onContent`
 * so the OPEN modal's editor fields fill for REVIEW — it never auto-saves. The
 * owner reviews, tweaks, then clicks the modal's normal Save. The control shows
 * the remaining monthly allowance (from the action's returned snapshot) and
 * gates gracefully when the allowance is spent (it never auto-charges).
 *
 * Usage is lifted to the Studio shell so this button and the floating AI command
 * bar draw down the SAME monthly counter — `usage`/`onUsage` keep them in sync.
 */
export default function RewriteWithAiButton({
  section,
  usage,
  onUsage,
  onContent,
}: {
  section: AiWebsiteSection
  usage: AiUsageSnapshot
  onUsage: (next: AiUsageSnapshot) => void
  /** Receives the generated draft to fill the open form's fields for review. */
  onContent: (content: GeneratedContent) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const outOfRewrites = usage.remaining <= 0

  async function run() {
    if (busy || outOfRewrites) return
    setBusy(true)
    setError(null)
    try {
      const res = await aiRewriteSection(section)
      if (res.ok) {
        onUsage(res.usage)
        onContent(res.content)
      } else if (res.reason === 'limit') {
        onUsage(res.usage)
        // No form change — the gate copy renders from `outOfRewrites` next paint.
      } else {
        setError(res.error)
      }
    } catch {
      setError('AI request failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (outOfRewrites) {
    return (
      <p
        className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-md px-2.5 py-1.5"
        data-testid="ai-rewrite-gate"
      >
        ✨ 0 left — resets on the 1st; edit freely by hand.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 dark:border-violet-400/40 px-2.5 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/15 disabled:opacity-50 transition"
        data-testid="ai-rewrite-button"
      >
        {busy ? 'Writing…' : '✨ Rewrite with AI'}
      </button>
      <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="ai-rewrite-remaining">
        {usage.remaining} AI rewrite{usage.remaining === 1 ? '' : 's'} left
      </span>
      {error && <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  )
}
