import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGradeByToken } from '@/lib/services/practice-grader'
import {
  GRADE_AXES,
  GRADE_AXIS_LABELS,
  isAxisHidden,
  projectedWithDreamCrm,
  type AxisGrade,
  type GradeAxis,
} from '@/lib/practice-grade'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your practice’s online grade — DreamCRM',
  // Token-auth page: anyone with the link can read it, so crawlers must not
  // index it (robots.txt disallows /g/ too — belt + suspenders).
  robots: { index: false, follow: false },
}

/**
 * The public grade report — /g/<token>, token IS the auth (the /r /d
 * pattern). v2 tells the BEFORE/AFTER story: every axis shows today's bar
 * beside the with-DreamCRM projection (only where the product
 * deterministically passes the same checks — a review rating or a search
 * rank is never projected), and every finding carries its "With DreamCRM"
 * remedy. Standalone chrome (outside the marketing group) in the marketing
 * register.
 */
export default async function GradeReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await getGradeByToken(token)
  if (!view) notFound()
  const { result } = view
  const where = [view.city, view.state].filter(Boolean).join(', ')
  const projected = projectedWithDreamCrm(result)

  return (
    <div className="min-h-screen bg-white text-gray-950 antialiased">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-gray-900">
            DreamCRM
          </Link>
          <Link href="/grade" className="text-xs font-medium text-teal-700 hover:text-teal-800">
            Grade another practice →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
          Online presence report
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
          {view.practiceName}
          {where && <span className="text-gray-400"> · {where}</span>}
        </h1>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50/70 p-6">
          <div className="flex items-center gap-6">
            <div
              className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-5xl font-bold text-white ${letterTone(result.letter)}`}
              aria-label={result.letter ? `Overall grade ${result.letter}` : 'Not graded'}
            >
              {result.letter ?? '—'}
            </div>
            <div>
              {result.overall != null && (
                <p className="text-sm font-semibold text-gray-500 tabular-nums">{result.overall} / 100</p>
              )}
              <p className="mt-1 text-lg font-medium text-gray-900 text-balance">{result.headline}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            Each section below shows <span className="font-semibold text-gray-700">today</span> next to{' '}
            <span className="font-semibold text-teal-700">what the same checks read with DreamCRM running</span> —
            we only project the checks the product passes by construction, never your reviews or your rank.
          </p>
        </div>

        <div className="mt-8 space-y-5">
          {GRADE_AXES.map((axis) =>
            isAxisHidden(result.axes[axis]) ? null : (
              <AxisCard key={axis} axis={axis} grade={result.axes[axis]} projected={projected[axis]} />
            ),
          )}
        </div>

        <div className="mt-12 rounded-2xl bg-gray-950 p-8 text-center">
          <h2 className="text-xl font-semibold text-white text-balance">
            Every “With DreamCRM” line above is shipped, not promised.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-300">
            A website that books, a Google listing that’s watched, review asks that send themselves —
            $200/mo, no card to try it, and the trial is the whole product.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-teal-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
          >
            Start free — 7 days
          </Link>
          <p className="mt-3 text-xs text-gray-400">
            Or keep the report and fix it yourself — it’s yours either way.
          </p>
        </div>
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-10 text-center text-xs text-gray-400 sm:px-6">
        {/* A public snapshot date — pinned to UTC on purpose (no clinic org
            exists here to source a zone from; a fixed zone beats the
            server's). */}
        Graded {new Date(result.computedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} ·
        a snapshot, not a judgment — run it again anytime.
      </footer>
    </div>
  )
}

function letterTone(letter: string | null): string {
  if (letter === 'A' || letter === 'B') return 'bg-emerald-600'
  if (letter === 'C') return 'bg-amber-500'
  if (letter === 'D' || letter === 'F') return 'bg-rose-600'
  return 'bg-gray-400'
}

/** The paired Today / With-DreamCRM bars — one implicit 0–100 axis, thin
 *  marks, every bar direct-labeled so identity never rides color alone. */
function CompareBars({ today, projected }: { today: number; projected: number | null }) {
  return (
    <div className="mt-3 space-y-1.5">
      <BarRow label="Today" value={today} tone={barTone(today)} />
      {projected != null && <BarRow label="With DreamCRM" value={projected} tone="bg-teal-600" approx />}
    </div>
  )
}

function BarRow({ label, value, tone, approx = false }: { label: string; value: number; tone: string; approx?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-700">
        {approx ? `~${value}` : value}
      </span>
    </div>
  )
}

function barTone(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 55) return 'bg-amber-400'
  return 'bg-rose-500'
}

/** What replaces a projection the product refuses to fake. */
const GROWTH_NOTES: Partial<Record<GradeAxis, string>> = {
  reviews:
    'With DreamCRM: review asks send themselves after every completed visit — this number grows on its own, we don’t project it.',
  search:
    'With DreamCRM: a fast, structured, locally-tuned site climbs — a rank can’t honestly be promised, so we don’t.',
}

function AxisCard({ axis, grade, projected }: { axis: GradeAxis; grade: AxisGrade; projected: number | null }) {
  const growthNote = grade.score != null && projected == null ? GROWTH_NOTES[axis] : null
  return (
    <section className="rounded-2xl border border-gray-200 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{GRADE_AXIS_LABELS[axis]}</h2>
        <span className="text-sm font-semibold tabular-nums text-gray-500">
          {grade.score != null ? `${grade.score} / 100` : 'Not graded'}
        </span>
      </div>
      {grade.score != null && <CompareBars today={grade.score} projected={projected} />}
      {growthNote && <p className="mt-2 text-xs font-medium text-teal-700">{growthNote}</p>}
      {grade.findings.length > 0 && (
        <ul className="mt-4 space-y-3 text-sm text-gray-700">
          {grade.findings.map((finding) => (
            <li key={finding.text}>
              <div className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-rose-500" aria-hidden="true">
                  ●
                </span>
                <span>{finding.text}</span>
              </div>
              {finding.after && (
                <div className="mt-1 flex gap-2.5 pl-5">
                  <span className="mt-0.5 shrink-0 text-teal-600" aria-hidden="true">
                    ↳
                  </span>
                  <span className="text-teal-800">
                    <span className="font-semibold">With DreamCRM:</span> {finding.after}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {grade.wins.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-gray-500">
          {grade.wins.map((w) => (
            <li key={w} className="flex gap-2.5">
              <span className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true">
                ✓
              </span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
