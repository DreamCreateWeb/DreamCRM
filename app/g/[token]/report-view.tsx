import {
  GRADE_AXES,
  GRADE_AXIS_LABELS,
  isAxisHidden,
  projectedWithDreamCrm,
  type AxisGrade,
  type GradeAxis,
  type GradeCheck,
  type GradeFacts,
  type PracticeGradeResult,
} from '@/lib/practice-grade'
import type { PublicGradeView } from '@/lib/services/practice-grader'

/**
 * The grade report's VISUAL BODY (marketing-engine slice 2; design run
 * 2026-08-27, owner directive: "state-of-the-art tech design, not a basic
 * report card" — this page is a cold prospect's first impression of the
 * company).
 *
 * Design direction — a diagnostic INSTRUMENT, deliberately dark against
 * the white marketing site: deep blue-black canvas, glass cards, one
 * signature teal→sky gradient spent in exactly two places (the score ring,
 * the CTA), monospace micro-labels, Today→With-DreamCRM as a structural
 * two-column ledger, wins as chips, CSS-only staggered entrance honoring
 * prefers-reduced-motion.
 *
 * Pure presentational + framework-free (plain <a>, no next/link) so the
 * offline design harness can render it with react-dom/server; page.tsx
 * owns fetch/notFound/metadata. Every content law from v2 holds: findings
 * with shipped-feature afters, honest Not-graded axes, the stranger
 * disclosure, no projected reviews/rank.
 */

// ── The page's own palette (scoped — this page renders outside both the
//    dashboard and the marketing chrome). One accent; status is semantic. ──
const INK = '#e9eef6'
const INK_2 = '#9aa8bd'
const INK_3 = '#66738a'
const CANVAS = '#070b15'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

function statusColor(score: number): string {
  if (score >= 80) return '#34d399' // emerald-400
  if (score >= 55) return '#fbbf24' // amber-400
  return '#fb7185' // rose-400
}

const GRADE_TAGLINES: Record<string, string> = {
  A: 'Protect it',
  B: 'Close, and fixable',
  C: 'Fixable, all of it',
  D: 'Fixable, all of it',
  F: 'Fixable, all of it',
}

export default function ReportView({ view }: { view: PublicGradeView }) {
  const { result } = view
  const where = [view.city, view.state].filter(Boolean).join(', ')
  const projected = projectedWithDreamCrm(result)
  const visibleAxes = GRADE_AXES.filter((a) => !isAxisHidden(result.axes[a]))
  const gradedDate = new Date(result.computedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    // A public snapshot date — pinned to UTC on purpose (no clinic org
    // exists here to source a zone from; a fixed zone beats the server's).
    timeZone: 'UTC',
  })

  return (
    <div className="dg-root min-h-screen antialiased" style={{ background: CANVAS, color: INK }}>
      <style>{PAGE_CSS}</style>

      {/* Ambient glow — one radial wash anchored to the hero, nothing else. */}
      <div className="dg-glow" aria-hidden="true" />

      <header className="relative border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="text-sm font-semibold tracking-tight" style={{ color: INK }}>
            DreamCRM
          </a>
          <a href="/grade" className="dg-mono text-[color:#5eead4] hover:text-[color:#99f6e4]">
            GRADE ANOTHER PRACTICE →
          </a>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        {/* ── Hero: the verdict as an instrument readout ─────────────── */}
        <section className="dg-in grid items-center gap-10 py-12 sm:py-16 md:grid-cols-[1fr_auto]">
          <div>
            <p className="dg-mono" style={{ color: '#5eead4' }}>
              ONLINE PRESENCE REPORT · {gradedDate.toUpperCase()}
            </p>
            <h1
              className="mt-4 text-4xl font-semibold sm:text-5xl"
              style={{ letterSpacing: '-0.035em', lineHeight: 1.05, textWrap: 'balance' as const }}
            >
              {view.practiceName}
            </h1>
            {where && (
              <p className="mt-2 text-lg" style={{ color: INK_3 }}>
                {where}
              </p>
            )}
            <p className="mt-6 max-w-xl text-lg" style={{ color: INK_2, textWrap: 'balance' as const }}>
              {result.headline}
            </p>
            {/* Axis readout strip — the whole report in one glance. */}
            <div className="mt-8 flex flex-wrap gap-2.5">
              {visibleAxes.map((axis) => {
                const s = result.axes[axis].score
                return (
                  <a key={axis} href={`#${axis}`} className="dg-chip">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: s != null ? statusColor(s) : INK_3 }}
                      aria-hidden="true"
                    />
                    <span style={{ color: INK_2 }}>{GRADE_AXIS_LABELS[axis].replace('Your ', '')}</span>
                    <span className="dg-mono" style={{ color: s != null ? statusColor(s) : INK_3 }}>
                      {s != null ? s : '—'}
                    </span>
                  </a>
                )
              })}
            </div>
          </div>
          <ScoreRing result={result} />
        </section>

        <p className="dg-in dg-d1 mb-10 max-w-3xl text-sm" style={{ color: INK_3 }}>
          Each section shows <span style={{ color: INK_2 }}>today</span> beside{' '}
          <span style={{ color: '#5eead4' }}>what the same checks read with DreamCRM running</span> — we
          only project checks the product passes by construction, never your reviews or your rank.
        </p>

        {/* ── Axis panels ────────────────────────────────────────────── */}
        <div className="space-y-6">
          {visibleAxes.map((axis, i) => (
            <AxisPanel
              key={axis}
              axis={axis}
              grade={result.axes[axis]}
              projected={projected[axis]}
              facts={result.facts ?? null}
              delay={i}
            />
          ))}
        </div>

        {/* ── The close ──────────────────────────────────────────────── */}
        <section className="dg-in dg-d3 dg-cta mt-14 rounded-3xl p-8 text-center sm:p-12">
          <p className="dg-mono" style={{ color: '#5eead4' }}>
            THE FIX
          </p>
          <h2
            className="mx-auto mt-3 max-w-2xl text-2xl font-semibold sm:text-3xl"
            style={{ letterSpacing: '-0.025em', textWrap: 'balance' as const }}
          >
            Every “With DreamCRM” line above is shipped, not promised.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base" style={{ color: INK_2 }}>
            A website that books, a Google listing that’s watched, review asks that send themselves.
            $200/mo, no card to try it — and the trial is the whole product.
          </p>
          <a href="/signup" className="dg-btn mt-8">
            Start free — 7 days
          </a>
          <p className="mt-4 text-xs" style={{ color: INK_3 }}>
            Or keep the report and fix it yourself — it’s yours either way.
          </p>
        </section>

        <footer className="dg-mono mt-10 text-center" style={{ color: INK_3 }}>
          A SNAPSHOT, NOT A JUDGMENT — RUN IT AGAIN ANYTIME
        </footer>
      </main>
    </div>
  )
}

// ── The hero gauge: one number, one gradient ─────────────────────────────
function ScoreRing({ result }: { result: PracticeGradeResult }) {
  const score = result.overall
  const R = 78
  const C = 2 * Math.PI * R
  const frac = score != null ? Math.max(0.02, score / 100) : 0
  return (
    <div className="mx-auto text-center md:mx-0">
      <div className="dg-ring-wrap relative inline-grid place-items-center">
        <svg width="216" height="216" viewBox="0 0 216 216" aria-label={score != null ? `Overall score ${score} out of 100, grade ${result.letter}` : 'Not graded'}>
          <defs>
            <linearGradient id="dg-ring" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          <circle cx="108" cy="108" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
          <circle
            className="dg-ring-arc"
            cx="108"
            cy="108"
            r={R}
            fill="none"
            stroke="url(#dg-ring)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            style={{ ['--dg-dash' as string]: `${C * (1 - frac)}`, ['--dg-circ' as string]: `${C}` }}
            transform="rotate(-90 108 108)"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-[68px] font-semibold" style={{ letterSpacing: '-0.04em', lineHeight: 1 }}>
              {result.letter ?? '—'}
            </div>
            <div className="dg-mono mt-2" style={{ color: INK_2 }}>
              {result.overall != null ? `${result.overall} / 100` : 'NOT GRADED'}
            </div>
          </div>
        </div>
      </div>
      {result.letter && (
        <div className="dg-mono mt-3" style={{ color: '#5eead4' }}>
          {(GRADE_TAGLINES[result.letter] ?? '').toUpperCase()}
        </div>
      )}
    </div>
  )
}

// ── One axis as an instrument panel ──────────────────────────────────────
const GROWTH_NOTES: Partial<Record<GradeAxis, string>> = {
  reviews:
    'Review asks send themselves after every completed visit — this number grows on its own, we don’t project it.',
  search:
    'A fast, structured, locally-tuned site climbs — a rank can’t honestly be promised, so we don’t.',
}

function AxisPanel({
  axis,
  grade,
  projected,
  facts,
  delay,
}: {
  axis: GradeAxis
  grade: AxisGrade
  projected: number | null
  facts: GradeFacts | null
  delay: number
}) {
  // The growth note replaces a refused projection — but only when no
  // finding below already carries the same story (the search axis's
  // "isn't on page one" finding says it better in context).
  const growthNote =
    grade.score != null && projected == null && grade.findings.length === 0 ? GROWTH_NOTES[axis] : null
  return (
    <section id={axis} className={`dg-in dg-d${Math.min(delay + 1, 3)} dg-card rounded-3xl p-6 sm:p-8`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold" style={{ letterSpacing: '-0.02em' }}>
          {GRADE_AXIS_LABELS[axis]}
        </h2>
        {grade.score != null ? (
          <span className="dg-mono text-base" style={{ color: statusColor(grade.score) }}>
            {grade.score}
            <span style={{ color: INK_3 }}> / 100</span>
          </span>
        ) : (
          <span className="dg-mono" style={{ color: INK_3 }}>
            NOT GRADED
          </span>
        )}
      </div>

      {grade.score != null && (
        <div className="mt-5 space-y-2">
          <BarRow label="TODAY" value={grade.score} color={statusColor(grade.score)} />
          {projected != null && <BarRow label="WITH DREAMCRM" value={projected} gradient approx />}
          {growthNote && (
            <div className="flex items-start gap-3 pt-1">
              <span className="dg-mono w-28 shrink-0 pt-0.5 sm:w-36" style={{ color: '#5eead4' }}>
                WITH DREAMCRM
              </span>
              <p className="text-sm" style={{ color: INK_2 }}>
                {growthNote}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── The instruments: real sensor data, or nothing ───────────── */}
      {axis === 'website' && facts?.checks && facts.checks.length > 0 && <ScanMatrix checks={facts.checks} />}
      {axis === 'search' && facts?.serp && facts.serp.hosts.length > 0 && <PageOneBoard serp={facts.serp} />}
      {axis === 'reviews' && grade.score != null && facts?.reviews?.rating != null && (
        <ReviewsMeter rating={facts.reviews.rating} count={facts.reviews.count ?? 0} />
      )}

      {grade.findings.length > 0 && (
        <div className="mt-6">
          {/* Column headers carry the ledger's two voices ONCE per panel on
              desktop; the inline label below stays for mobile stacking. */}
          <div className="mb-2 hidden gap-6 px-4 md:grid md:grid-cols-2">
            <span className="dg-mono" style={{ color: INK_3 }}>
              TODAY
            </span>
            <span className="dg-mono md:pl-6" style={{ color: '#5eead4' }}>
              WITH DREAMCRM
            </span>
          </div>
          <div className="space-y-3">
            {grade.findings.map((finding) => (
              <div key={finding.text} className="dg-row grid gap-3 rounded-2xl p-4 md:grid-cols-2 md:gap-6">
                <div className="flex gap-3">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#fb7185' }} aria-hidden="true" />
                  <p className="text-[0.95rem]" style={{ color: INK }}>
                    {finding.text}
                  </p>
                </div>
                {finding.after ? (
                  <div className="dg-after flex gap-3 md:border-l md:border-white/[0.07] md:pl-6">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#2dd4bf' }} aria-hidden="true" />
                    <p className="text-[0.95rem]" style={{ color: INK_2 }}>
                      <span className="dg-mono mr-2 md:hidden" style={{ color: '#5eead4' }}>
                        WITH DREAMCRM
                      </span>
                      {finding.after}
                    </p>
                  </div>
                ) : (
                  <div aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {grade.wins.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {grade.wins.map((w) => (
            <span key={w} className="dg-win">
              <span style={{ color: '#34d399' }}>✓</span> {w}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function BarRow({
  label,
  value,
  color,
  gradient = false,
  approx = false,
}: {
  label: string
  value: number
  color?: string
  gradient?: boolean
  approx?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="dg-mono w-28 shrink-0 sm:w-36" style={{ color: gradient ? '#5eead4' : INK_3 }}>
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
        <div
          className="dg-bar h-full rounded-full"
          style={{
            width: `${value}%`,
            background: gradient ? 'linear-gradient(90deg,#2dd4bf,#38bdf8)' : color,
          }}
        />
      </div>
      <span className="dg-mono w-10 shrink-0 text-right" style={{ color: INK_2 }}>
        {approx ? `~${value}` : value}
      </span>
    </div>
  )
}

// ── Gadget 1 · the site-scan matrix (website axis): every check as an LED
//    cell — pass glows emerald, fail glows rose, unknowable stays unlit. ──
function ScanMatrix({ checks }: { checks: GradeCheck[] }) {
  const passed = checks.filter((c) => c.ok === true).length
  const counted = checks.filter((c) => c.ok !== null).length
  return (
    <div className="mt-6">
      <div className="dg-mono mb-2 flex items-baseline justify-between" style={{ color: INK_3 }}>
        <span>SITE SCAN</span>
        <span>
          <span style={{ color: passed === counted ? '#34d399' : passed >= counted - 2 ? '#fbbf24' : '#fb7185' }}>
            {passed}
          </span>
          /{counted} PASS
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {checks.map((c, i) => (
          <div key={c.id} className="dg-cell" style={{ ['--dg-i' as string]: i }}>
            <span
              className={`dg-led ${c.ok === true ? 'dg-led-ok' : c.ok === false ? 'dg-led-bad' : ''}`}
              aria-hidden="true"
            />
            <span className="dg-mono" style={{ color: c.ok === false ? '#fda4af' : INK_2 }}>
              {c.label}
            </span>
            <span className="dg-mono" style={{ color: INK_3 }}>
              {c.detail ?? (c.ok === true ? 'PASS' : c.ok === false ? 'FAIL' : 'N/A')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Gadget 2 · the page-one board (search axis): the REAL ten slots for
//    the query, competitors named, with your row lit — or the dashed slot
//    you don't hold yet. ──────────────────────────────────────────────────
function PageOneBoard({ serp }: { serp: { query: string; position: number | null; hosts: string[] } }) {
  const rows = serp.hosts.slice(0, 10)
  const youIndex = serp.position != null && serp.position <= rows.length ? serp.position - 1 : null
  return (
    <div className="mt-6">
      <div className="dg-mono mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1" style={{ color: INK_3 }}>
        <span>GOOGLE PAGE ONE</span>
        <span>“{serp.query.toUpperCase()}”</span>
      </div>
      <ol className="space-y-1.5">
        {rows.map((host, i) => {
          const you = i === youIndex
          return (
            <li
              key={`${host}-${i}`}
              className={`dg-slot ${you ? 'dg-slot-you' : ''}`}
              style={{ ['--dg-i' as string]: i }}
            >
              <span className="dg-mono w-6 shrink-0 text-right" style={{ color: you ? '#5eead4' : INK_3 }}>
                {i + 1}
              </span>
              <span className="min-w-0 truncate text-sm" style={{ color: you ? INK : INK_2 }}>
                {host.replace(/^www\./, '')}
              </span>
              {you && <span className="dg-you">YOU</span>}
            </li>
          )
        })}
        {youIndex === null && (
          <li className="dg-slot dg-slot-miss" style={{ ['--dg-i' as string]: rows.length }}>
            <span className="dg-mono w-6 shrink-0 text-right" style={{ color: INK_3 }}>
              —
            </span>
            <span className="min-w-0 truncate text-sm" style={{ color: INK_2 }}>
              your practice
            </span>
            <span className="dg-you dg-you-miss">NOT ON PAGE ONE</span>
          </li>
        )}
      </ol>
    </div>
  )
}

// ── Gadget 3 · the reviews meter (reviews axis): the rating as stars, the
//    count against what actually wins the map pack. No projection — the
//    benchmark is the instrument. ─────────────────────────────────────────
const REVIEW_BENCHMARK = 100 // what map-pack winners typically carry

function ReviewsMeter({ rating, count }: { rating: number; count: number }) {
  const scale = Math.max(count, REVIEW_BENCHMARK) * 1.2
  const countPct = Math.min(100, (count / scale) * 100)
  const tickPct = Math.min(96, (REVIEW_BENCHMARK / scale) * 100)
  return (
    <div className="mt-6 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
      <div className="flex items-center gap-4">
        <span className="text-[44px] font-semibold" style={{ letterSpacing: '-0.03em', lineHeight: 1 }}>
          {rating.toFixed(1)}
        </span>
        <Stars rating={rating} />
      </div>
      <div>
        <div className="dg-mono mb-2 flex flex-wrap justify-between gap-x-4 gap-y-1" style={{ color: INK_3 }}>
          <span style={{ color: INK_2 }}>
            {count} REVIEW{count === 1 ? '' : 'S'}
          </span>
          <span>MAP-PACK WINNERS · {REVIEW_BENCHMARK}+</span>
        </div>
        <div className="relative h-2 rounded-full bg-white/[0.06]">
          <div
            className="dg-bar h-full rounded-full"
            style={{
              width: `${countPct}%`,
              background:
                count >= REVIEW_BENCHMARK ? 'linear-gradient(90deg,#2dd4bf,#38bdf8)' : '#fbbf24',
            }}
          />
          <span
            className="absolute top-[-3px] bottom-[-3px] w-px bg-white/35"
            style={{ left: `${tickPct}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  )
}

function Stars({ rating }: { rating: number }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100))
  return (
    <span
      className="relative inline-block text-xl leading-none tracking-[0.12em]"
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      <span style={{ color: 'rgba(255,255,255,0.14)' }} aria-hidden="true">
        ★★★★★
      </span>
      <span
        className="absolute inset-0 overflow-hidden whitespace-nowrap"
        style={{ width: `${pct}%`, color: '#fbbf24' }}
        aria-hidden="true"
      >
        ★★★★★
      </span>
    </span>
  )
}

// ── Page CSS: tokens, glass, motion (reduced-motion safe) ────────────────
const PAGE_CSS = `
.dg-root { font-feature-settings: 'tnum'; }
.dg-mono { font-family: ${MONO}; font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; }
.dg-glow { position: absolute; inset: 0 0 auto 0; height: 620px; pointer-events: none;
  background: radial-gradient(640px 420px at 80% 150px, rgba(45,212,191,0.17), transparent 70%),
              radial-gradient(560px 360px at 12% 30px, rgba(56,189,248,0.10), transparent 70%); }
.dg-ring-wrap::before { content: ''; position: absolute; inset: -28px; border-radius: 999px;
  background: radial-gradient(closest-side, rgba(45,212,191,0.16), transparent 72%); }
.dg-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 48px -32px rgba(0,0,0,0.6); }
.dg-row { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
.dg-chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09); font-size: 13px;
  text-decoration: none; transition: border-color .15s ease; }
.dg-chip:hover { border-color: rgba(94,234,212,0.45); }
.dg-win { display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px; border-radius: 999px;
  background: rgba(52,211,153,0.06); border: 1px solid rgba(52,211,153,0.18); font-size: 12.5px; color: #b6c2d4; }
.dg-cta { position: relative; background:
    radial-gradient(480px 220px at 50% 0%, rgba(45,212,191,0.12), transparent 70%),
    rgba(255,255,255,0.02);
  border: 1px solid rgba(94,234,212,0.22); }
.dg-btn { display: inline-block; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;
  color: #04211d; background: linear-gradient(90deg,#2dd4bf,#38bdf8);
  box-shadow: 0 12px 32px -12px rgba(45,212,191,0.55); text-decoration: none; transition: filter .15s ease; }
.dg-btn:hover { filter: brightness(1.08); }
.dg-cell { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 14px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
.dg-led { width: 8px; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.18); }
.dg-led-ok { background: #34d399; box-shadow: 0 0 10px rgba(52,211,153,0.75); }
.dg-led-bad { background: #fb7185; box-shadow: 0 0 10px rgba(251,113,133,0.65); }
.dg-slot { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 12px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
.dg-slot-you { background: rgba(45,212,191,0.08); border-color: rgba(94,234,212,0.35); }
.dg-slot-miss { border-style: dashed; border-color: rgba(251,113,133,0.35); background: rgba(251,113,133,0.04); }
.dg-you { margin-left: auto; flex-shrink: 0; padding: 2px 9px; border-radius: 999px;
  font-family: ${MONO}; font-size: 12px; font-weight: 600; letter-spacing: 0.08em;
  color: #04211d; background: linear-gradient(90deg,#2dd4bf,#38bdf8); }
.dg-you-miss { color: #fecdd3; background: rgba(251,113,133,0.14); border: 1px solid rgba(251,113,133,0.3); }
@media (prefers-reduced-motion: no-preference) {
  .dg-in { animation: dgUp .6s cubic-bezier(.2,.7,.2,1) both; }
  .dg-d1 { animation-delay: .08s; } .dg-d2 { animation-delay: .16s; } .dg-d3 { animation-delay: .24s; }
  .dg-ring-arc { animation: dgRing 1.1s cubic-bezier(.3,.6,.2,1) .2s both; }
  .dg-bar { animation: dgBar .9s cubic-bezier(.3,.6,.2,1) .3s both; transform-origin: left; }
  .dg-cell, .dg-slot { animation: dgUp .45s cubic-bezier(.2,.7,.2,1) both;
    animation-delay: calc(.25s + var(--dg-i, 0) * 45ms); }
}
@keyframes dgUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes dgRing { from { stroke-dashoffset: var(--dg-circ); } to { stroke-dashoffset: var(--dg-dash); } }
@keyframes dgBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
`
