/**
 * THE HEADS-UP (Transformation Phase 4 — the Guardian's clinic-facing half).
 *
 * The machine watches whether it is actually able to do its job, and when
 * the answer is no for a reason the practice can fix, it says so here — in
 * the morning huddle, where the front desk already looks.
 *
 * Deliberately NOT a proposal card: there is nothing to approve, nothing to
 * edit, and no yes to give. It is one sentence and a way to act on it, and
 * it disappears on its own when the thing it describes stops being true.
 * Deliberately not alarming either — amber, not red, and no exclamation
 * mark. The clinic is not in trouble; the machine is asking for a hand.
 */
import Link from 'next/link'
import type { ActiveGuardianNote } from '@/lib/services/guardian'

/** The next step belongs to the finding, not to the card: a switch note
 *  points at the switches, a slow month points at where patients come
 *  from. A single generic link would send half of them to the wrong page. */
const NEXT_STEP: Record<'blocked' | 'stalled', { href: string; label: string }> = {
  blocked: { href: '/settings/automations', label: 'Check your automatic messages' },
  stalled: { href: '/growth', label: 'See where new patients come from' },
}

export default function GuardianNoteCard({ note }: { note: ActiveGuardianNote | null }) {
  if (!note) return null
  const step = NEXT_STEP[note.state as 'blocked' | 'stalled'] ?? NEXT_STEP.blocked

  return (
    <section className="mb-6" aria-label="Heads up">
      <div className="rounded-[var(--r-lg)] border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <span className="text-base shrink-0" aria-hidden="true">
            💬
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
              Heads up
            </p>
            <p className="mt-1 text-sm text-gray-800 dark:text-gray-100">{note.summary}</p>
            <Link
              href={step.href}
              className="mt-2 inline-block text-xs font-medium text-amber-800 dark:text-amber-300 hover:underline"
            >
              {step.label} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
