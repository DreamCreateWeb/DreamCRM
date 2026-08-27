import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGradeByToken } from '@/lib/services/practice-grader'
import { GRADE_AXES, GRADE_AXIS_LABELS, type AxisGrade } from '@/lib/practice-grade'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your practice’s online grade — DreamCRM',
  // Token-auth page: anyone with the link can read it, so crawlers must not
  // index it (robots.txt disallows /g/ too — belt + suspenders).
  robots: { index: false, follow: false },
}

/**
 * The public grade report — /g/<token>, token IS the auth (the /r /d
 * pattern). Renders the stored PracticeGradeResult: the letter, the three
 * axes with findings + wins, and the one CTA. Standalone chrome (outside
 * the marketing group) in the marketing register.
 */
export default async function GradeReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await getGradeByToken(token)
  if (!view) notFound()
  const { result } = view
  const where = [view.city, view.state].filter(Boolean).join(', ')

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

        <div className="mt-8 flex items-center gap-6 rounded-2xl border border-gray-200 bg-gray-50/70 p-6">
          <div
            className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-5xl font-bold text-white ${letterTone(result.letter)}`}
            aria-label={result.letter ? `Overall grade ${result.letter}` : 'Not graded'}
          >
            {result.letter ?? '—'}
          </div>
          <div>
            {result.overall != null && (
              <p className="text-sm font-semibold text-gray-500">{result.overall} / 100</p>
            )}
            <p className="mt-1 text-lg font-medium text-gray-900 text-balance">{result.headline}</p>
          </div>
        </div>

        <div className="mt-8 space-y-5">
          {GRADE_AXES.map((axis) => (
            <AxisCard key={axis} label={GRADE_AXIS_LABELS[axis]} grade={result.axes[axis]} />
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-gray-950 p-8 text-center">
          <h2 className="text-xl font-semibold text-white text-balance">
            Everything on this list is work DreamCRM does for you.
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

function AxisCard({ label, grade }: { label: string; grade: AxisGrade }) {
  return (
    <section className="rounded-2xl border border-gray-200 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{label}</h2>
        <span className="text-sm font-semibold tabular-nums text-gray-500">
          {grade.score != null ? `${grade.score} / 100` : 'Not graded'}
        </span>
      </div>
      {grade.score != null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <div className={`h-full rounded-full ${barTone(grade.score)}`} style={{ width: `${grade.score}%` }} />
        </div>
      )}
      {grade.findings.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          {grade.findings.map((f) => (
            <li key={f} className="flex gap-2.5">
              <span className="mt-0.5 shrink-0 text-rose-500" aria-hidden="true">
                ●
              </span>
              <span>{f}</span>
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

function barTone(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 55) return 'bg-amber-400'
  return 'bg-rose-500'
}
