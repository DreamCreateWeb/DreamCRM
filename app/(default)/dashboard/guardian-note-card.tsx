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

/**
 * Where the next step actually goes.
 *
 * ROUND-1 AUDIT: this shipped pointing `blocked` at `/settings/automations`,
 * which is a 404 — that directory holds only an `emails/` child, no page of
 * its own. The card's single call to action, on the one surface where the
 * machine admits it cannot do its job, was a dead link. (My pre-audit check
 * confirmed the DIRECTORY existed, which proves nothing about a route.)
 *
 * And one destination was never enough: the two switches live in different
 * places entirely — reminders in the Emails hub, review requests on the
 * Growth reviews page — so half of these notes would have sent the front
 * desk to a page that cannot turn the thing back on.
 */
const REMINDERS_STEP = {
  href: '/settings/automations/emails?email=appointment_reminder',
  label: 'Turn appointment reminders back on',
}
const REVIEWS_STEP = { href: '/growth/reviews', label: 'Turn review requests back on' }
const STALL_STEP = { href: '/growth', label: 'See where new patients come from' }

function nextStep(note: ActiveGuardianNote): { href: string; label: string } {
  if (note.state === 'stalled') return STALL_STEP
  // Reminders first when both are off: it is the one that touches a patient
  // who has an appointment tomorrow.
  if (note.remindersOn === false) return REMINDERS_STEP
  if (note.reviewRequestsOn === false) return REVIEWS_STEP
  return REMINDERS_STEP
}

export default function GuardianNoteCard({ note }: { note: ActiveGuardianNote | null }) {
  if (!note) return null
  const step = nextStep(note)

  return (
    <section className="mb-6" aria-label="Heads up">
      <div className="rounded-[var(--r-lg)] bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 p-4">
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
