import Link from 'next/link'
import type { ClinicEngineReport, GuardianSweep } from '@/lib/services/guardian'
import {
  clinicActionable,
  clinicNote,
  guardianHeartbeatStale,
  GUARDIAN_STALE_DAYS,
  type EngineState,
  type GuardianAudience,
  type GuardianHeartbeat,
} from '@/lib/guardian'
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
  /** The lock's value could not be READ (round-15 audit, second pass). The
   *  control one screen-region up was taught to claim nothing about the
   *  machine on this path; these rows were not, so with the lock stored
   *  OPEN and the overview's config read failing, every flagged row told
   *  the owner "If you let practices hear it, they'd read …" — about
   *  practices who are being told, right now, by a cron that does its own
   *  read. Routing is unknowable here, so this says nothing about it. */
  audienceUnknown,
}: {
  report: ClinicEngineReport
  audience: GuardianAudience
  audienceUnknown: boolean
}) {
  const style = STATE_STYLE[report.verdict.state]
  // Which WAY this finding is routed. Deliberately phrased as routing, not
  // delivery (round-2 audit): the panel computes this from the routing rule
  // and never checks that a note actually landed, so "I told them directly"
  // was a claim it could not support — the ledger write can fail, and the
  // cadence may not have fired yet. It can honestly say where a finding
  // goes; it cannot say it arrived.
  const goesToThem =
    !audienceUnknown && audience === 'clinic' && clinicActionable(report.verdict.state, report.signals)
  // A DRY RUN, while the lock is closed (round-9 in-phase gap). The one
  // control on this panel decides whether the machine starts addressing
  // customers, and the routing split above only rendered AFTER the decision
  // — so the owner's first sight of the sentence a practice would read was
  // going to be a practice reading it. `clinicNote` is pure and the row
  // already carries the signals, so showing it costs nothing.
  const wouldSay =
    !audienceUnknown && audience === 'platform'
      ? clinicNote(report.verdict.state, report.signals)
      : null
  return (
    <li className="rounded-[var(--r-lg)] border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-4">
      <div className="flex items-start gap-3">
        <span className="text-base shrink-0" aria-hidden="true">
          {style.glyph}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* THE FRONT DOOR TO THE CALL (round-9 in-phase gap). Round 1
                removed a link that carried a `?q=` the clinics list never
                read — right to remove, but it stopped at "no link" while a
                real per-clinic page existed at /ecommerce/customers/[id],
                keyed by the very id this row carries. Every recommendation
                here is an instruction to go do something with ONE practice,
                and the panel was the only surface in the product that named
                an entity and refused to let you open it. */}
            <Link
              href={`/ecommerce/customers/${report.organizationId}`}
              className="text-sm font-semibold text-gray-800 dark:text-gray-100 hover:underline"
            >
              {report.clinicName}
            </Link>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.chip}`}>
              {style.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
            {report.verdict.headline}
          </p>
          {/* HOW LONG (round-11 in-phase gap). A practice silent for two
              months and one silent since Tuesday rendered identically, and
              chronicity is the difference between a churn conversation and
              a shrug.
              ITS OWN LINE, AND ITS OWN WORDS (round-13 audit). Round 12
              redefined the clock to measure the practice's unbroken RUN of
              trouble, which may change shape inside it — so glued to the
              headline as "· 41 days now" it read as "these switches have
              been off for 41 days" when they were flipped yesterday. The
              emails were re-worded in that commit; this was not. */}
          {report.troubleForDays !== null && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Needing attention {report.troubleForDays}{' '}
              {report.troubleForDays === 1 ? 'day' : 'days'} straight now &mdash; not always for
              this reason.
            </p>
          )}
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
          {!audienceUnknown && audience === 'clinic' && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {goesToThem
                ? 'This one goes to them directly, in their own activity.'
                : 'This one is only with you. It is ours to fix, not theirs to notice.'}
            </p>
          )}
          {wouldSay && (
            <p className="mt-2 rounded-[var(--r-md)] bg-gray-50 dark:bg-gray-900/40 p-2 text-xs text-gray-500 dark:text-gray-400">
              If you let practices hear it, they&rsquo;d read:{' '}
              <span className="italic text-gray-600 dark:text-gray-300">
                &ldquo;{wouldSay}&rdquo;
              </span>
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

/** The watcher's own last run. "Has not run yet" is a real answer and the
 *  one that matters — a dead cron rule otherwise looks exactly like a
 *  healthy platform, because the panel renders live either way. */
function HeartbeatLine({ beat, unreadable }: { beat: GuardianHeartbeat; unreadable: boolean }) {
  // "I could not read it" is not "it never ran" (round-10 audit). Round 9
  // wired this to a read that swallows its own errors, so the amber "never
  // ran" line was what a DB blip rendered — a false claim about the cron on
  // the one surface that exists to tell the truth about the cron.
  if (unreadable) {
    return (
      <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
        (I couldn&rsquo;t read my own run log just now.)
      </span>
    )
  }
  if (!beat.ranAt) {
    return (
      <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
        I haven&rsquo;t completed a daily check yet.
      </span>
    )
  }
  // STOPPED, not merely never-started (round-10 in-phase gap). After the
  // first run this is the only real failure mode, and it is the one this
  // repo has actually had.
  const stale = guardianHeartbeatStale(beat, new Date())
  const when = new Date(beat.ranAt)
  const label = Number.isNaN(when.getTime())
    ? null
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
        when,
      )
  return (
    <span
      className={`text-xs font-normal ${
        stale || beat.blind || beat.undelivered > 0
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      {label ? `Last checked ${label}` : 'Last check recorded'}
      {/* What that RUN saw, not what this page sees — they diverge exactly
          when it matters (a blind or partial sweep under a healthy page),
          and storing a number nothing renders is the defect slice 4 was
          pulled up for. */}
      {` · ${beat.scanned} ${beat.scanned === 1 ? 'practice' : 'practices'}`}
      {beat.flagged > 0 && `, ${beat.flagged} flagged`}
      {stale && ` · nothing since — the daily check has not run in over ${GUARDIAN_STALE_DAYS} days`}
      {beat.blind && ' · that run couldn’t see'}
      {beat.undelivered > 0 &&
        ` · ${beat.undelivered} report${beat.undelivered === 1 ? '' : 's'} couldn’t be delivered`}
      {/* PRACTICES THE RUN GAVE UP ON (round-14 in-phase gap). A
          half-provisioned clinic is skipped by the alerting half forever
          while this panel renders it as a flagged row telling the owner to
          audit its integrations — the worst-shaped practice on the
          platform, previously visible in nothing. */}
      {beat.skipped > 0 &&
        ` · ${beat.skipped} practice${beat.skipped === 1 ? '' : 's'} skipped (no profile row)`}
      {/* THE CENSUS (Phase 4 open item #5). `scanned` counted what came
          BACK, and nothing compared it to what went in — so a clinic whose
          own read threw was logged and then silently absent from every
          total. Only shown when it does NOT add up, because a reconciled
          census is not news. */}
      {beat.unreadable > 0 &&
        ` · ${beat.unreadable} of ${beat.eligible} couldn’t be read at all`}
      {/* AND WHY (round-14 in-phase gap). "1 report couldn't be delivered"
          with no reason left the owner unable to tell a mail outage from
          having nobody to email; the reasons were written in seven places
          and handed to EventBridge, which discards them. */}
      {/* WHO IT ACTUALLY REACHED (round-16 in-phase gap). The lock had a
          preview and no receipt, so the owner who opened it had to read
          individual clinics' ledgers to learn what their machine said in
          their name. */}
      {(beat.told.length > 0 || beat.emailed.length > 0) && (
        <span className="block mt-0.5 text-gray-500 dark:text-gray-400">
          That run{beat.told.length > 0 ? ` told ${beat.told.join(', ')} directly` : ''}
          {beat.told.length > 0 && beat.emailed.length > 0 ? ', and' : ''}
          {beat.emailed.length > 0 ? ` emailed you about ${beat.emailed.join(', ')}` : ''}.
        </span>
      )}
      {beat.problems.length > 0 && (
        <span className="block mt-0.5 text-amber-700 dark:text-amber-400">
          Trouble on that run: {beat.problems.join('; ')}.
        </span>
      )}
    </span>
  )
}

export default function GuardianPanel({
  sweep,
  audience,
  heartbeat,
  heartbeatUnreadable = false,
}: {
  sweep: GuardianSweep
  audience: GuardianAudience
  heartbeat: GuardianHeartbeat
  heartbeatUnreadable?: boolean
}) {
  // No clinics yet: the guardian has nothing to REPORT, and a loud empty
  // state would be noise on a brand-new platform. But the audience lock's
  // only control lives in this header, and hiding it means the owner cannot
  // open or close the lock until at least one clinic exists — a setting
  // unreachable exactly when they are setting the platform up (round-2
  // audit). Keep the control, drop the report.
  //
  // A BLIND SWEEP IS NOT AN EMPTY ONE (round-9 audit). Both arrive as zero
  // reports, and reading the second as the first printed a confident
  // all-clear on precisely the day the watcher could not see. The service
  // says which it is; this asks.
  const nothingToReport = !sweep.blind && sweep.reports.length === 0
  // How many practices have something they'd be told if the lock opened —
  // the number the confirm step needs to stop being a blind decision.
  //
  // NOT "today" (round-10 audit). Delivery needs the ROUTING rule (this) AND
  // the CADENCE rule (`shouldAlert`), and the panel has no access to the
  // second: at the moment the lock opens, every flagged clinic already
  // carries its current state from earlier owner-audience runs, so nothing
  // is "new" for any of them and the first notes land as each one's weekly
  // cadence comes round — by design, so an already-reported problem finishes
  // its week before the new audience hears it. The count is right; the word
  // "today" was the false part, on the phase's single most consequential
  // control.
  const wouldHear = sweep.flagged.filter((r) =>
    clinicActionable(r.verdict.state, r.signals),
  ).length

  return (
    <section className="mb-8" aria-label="Engine health">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Engine health
          <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
            {sweep.summary}
          </span>
          <span className="ml-2">
            <HeartbeatLine beat={heartbeat} unreadable={heartbeatUnreadable} />
          </span>
        </h2>
        <GuardianAudienceControl
          audience={audience}
          wouldHear={sweep.blind ? null : wouldHear}
          unreadable={heartbeatUnreadable}
        />
      </div>

      {sweep.blind ? (
        <p className="rounded-[var(--r-lg)] border border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          I couldn&rsquo;t look just now — the activity log didn&rsquo;t come back. This is about
          me, not about them; nothing here means a practice is fine or isn&rsquo;t.
        </p>
      ) : nothingToReport ? (
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
            <ReportRow
              key={r.organizationId}
              report={r}
              audience={audience}
              audienceUnknown={heartbeatUnreadable}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
