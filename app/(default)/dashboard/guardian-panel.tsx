import type { ClinicEngineReport, GuardianSweep } from '@/lib/services/guardian'
import { clinicActionable, type EngineState, type GuardianAudience } from '@/lib/guardian'
import GuardianAudienceControl from './guardian-audience-control'

/**
 * THE GUARDIAN's report (Transformation Phase 4 — DESIGN.md primitive #5).
 *
 * DreamCRM promises a clinic that their practice grows while they barely
 * touch it. A clinic cannot audit that promise from the inside — a quiet
 * dashboard looks identical whether the machine is idle or dead. So the
 * platform watches, and this is where the owner reads it.
 *
 * Built as a REPORT, not a console: it names the practices that need a
 * human, says why in plain English, and says what to do. There is nothing
 * here to operate, no filters, no thresholds to tune. When every engine is
 * running it says so in one line and gets out of the way — an all-clear is
 * information, not an empty state.
 */

/** Tone carries meaning here, but never alone: every row is fully labelled
 *  with its own sentence, and the glyph repeats the state in text form. */
const STATE_STYLE: Record<EngineState, { glyph: string; chip: string; label: string }> = {
  silent: {
    glyph: '🔇',
    chip: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    label: 'Nothing running',
  },
  blocked: {
    glyph: '⛔',
    chip: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    label: 'Blocked',
  },
  stalled: {
    glyph: '📉',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    label: 'Growth stalled',
  },
  quiet: {
    glyph: '🌙',
    chip: 'bg-gray-500/15 text-gray-700 dark:text-gray-300',
    label: 'Quiet',
  },
  healthy: {
    glyph: '✅',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    label: 'Running',
  },
}

function ReportRow({
  report,
  audience,
}: {
  report: ClinicEngineReport
  audience: GuardianAudience
}) {
  const style = STATE_STYLE[report.verdict.state]
  // Which WAY this finding is routed. Deliberately phrased as routing, not
  // delivery (round-2 audit): the panel computes this from the routing rule
  // and never checks that a note actually landed, so "I told them directly"
  // was a claim it could not support — the ledger write can fail, and the
  // cadence may not have fired yet. It can honestly say where a finding
  // goes; it cannot say it arrived.
  const goesToThem = audience === 'clinic' && clinicActionable(report.verdict.state, report.signals)
  return (
    <li className="rounded-[var(--r-lg)] border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-4">
      <div className="flex items-start gap-3">
        <span className="text-base shrink-0" aria-hidden="true">
          {style.glyph}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Plain text, not a link (round-1 audit): this used to carry a
                ?q= the clinics list never reads, so it looked like a
                drill-in and was really just "go to the clinics page". A
                dead-end link is a worse promise than no link. */}
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {report.clinicName}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.chip}`}>
              {style.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{report.verdict.headline}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{report.verdict.why}</p>
          {report.failureCauses.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {report.failureCauses.map((c) => (
                <li key={c} className="text-xs text-gray-600 dark:text-gray-300">
                  &bull; {c}
                </li>
              ))}
            </ul>
          )}
          {report.verdict.recommendation && (
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">What I&rsquo;d do:</span> {report.verdict.recommendation}
            </p>
          )}
          {audience === 'clinic' && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {goesToThem
                ? 'This one goes to them directly, in their own activity.'
                : 'This one is only with you. It is ours to fix, not theirs to notice.'}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

export default function GuardianPanel({
  sweep,
  audience,
}: {
  sweep: GuardianSweep
  audience: GuardianAudience
}) {
  // No clinics yet: the guardian has nothing to REPORT, and a loud empty
  // state would be noise on a brand-new platform. But the audience lock's
  // only control lives in this header, and hiding it means the owner cannot
  // open or close the lock until at least one clinic exists — a setting
  // unreachable exactly when they are setting the platform up (round-2
  // audit). Keep the control, drop the report.
  const nothingToReport = sweep.reports.length === 0

  return (
    <section className="mb-8" aria-label="Engine health">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Engine health
          <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
            {sweep.summary}
          </span>
        </h2>
        <GuardianAudienceControl audience={audience} />
      </div>

      {nothingToReport ? (
        <p className="rounded-[var(--r-lg)] border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-4 text-sm text-gray-600 dark:text-gray-300">
          No practices to watch yet.
        </p>
      ) : sweep.flagged.length === 0 ? (
        // ALL CLEAR is news, not emptiness — it is the guarantee holding.
        <p className="rounded-[var(--r-lg)] border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-4 text-sm text-gray-600 dark:text-gray-300">
          Every practice&rsquo;s machine is running. Nothing needs you today.
        </p>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sweep.flagged.map((r) => (
            <ReportRow key={r.organizationId} report={r} audience={audience} />
          ))}
        </ul>
      )}
    </section>
  )
}
