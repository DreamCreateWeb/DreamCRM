import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { buildWeeklyStandup } from '@/lib/services/standup'
import { listRunway, getLastCycleAt } from '@/lib/services/dream-team'
import { formatClinicDayTime } from '@/lib/format-datetime'
import RunwaySection from './runway-section'
import SandmanPanel from './sandman-panel'
import GoalsSection, { type GoalCardData } from './goals-section'
import { listGoals, seatedSince } from '@/lib/services/goals'
import { goalProgressLine } from '@/lib/goals'
import type { TenantContext } from '@/lib/auth/context'
import { readDemoSkin } from '@/lib/demo-skin'
import { cycleLabel } from '@/lib/types/dream-team'
import { PageHeader } from '@/components/ui/page-header'
import ApprovalInbox from '../dashboard/approval-inbox'
import TeamRoster from './team-roster'
import TeamStatusBand from './team-status-band'
import { loadApprovalInbox } from './load'

/**
 * THE DREAM TEAM (docs/ai-operations.md) — the clinic's AI staff, on one
 * page: the sign-here stack of finished work waiting on a yes, the
 * take-it-back strip, and (as later slices land) the veto runway, the
 * goals, the roster, and Sandman. The Overview keeps only a calm summons
 * strip; the sitting-down work happens here.
 *
 * A ctx-taking async component (the clinic-overview pattern) so the
 * whole-DOM suite can render it directly with mocked services.
 */
export default async function DreamTeamView({ ctx }: { ctx: TenantContext }) {
  const [timeZone, demoSkin, standup, lastCycleAt] = await Promise.all([
    getClinicTimeZone(ctx.organizationId).catch(() => 'America/New_York'),
    readDemoSkin(ctx),
    // The roster's last-week numbers ride the standup's per-capability
    // counts — real ledger work, the same window the Monday email reports.
    buildWeeklyStandup(ctx.organizationId).catch(() => null),
    // CYCLES (D7d) — the heartbeat, so "on the clock" points at a real one.
    getLastCycleAt(ctx.organizationId),
  ])
  // The veto runway (D4) — best-effort like every other read on this page.
  const runway = await listRunway(ctx.organizationId).catch(() => [])
  // GOALS (D6). Progress is computed per goal against ITS OWN baseline
  // instant, so a goal set today never claims last month's patients.
  const goalRows = await listGoals(ctx.organizationId).catch(() => [])
  const goalCards: GoalCardData[] = await Promise.all(
    goalRows
      .filter((g) => g.status !== 'retired')
      .map(async (g) => ({
        id: g.id,
        objective: g.objective,
        serviceFocus: g.serviceFocus,
        status: g.status as GoalCardData['status'],
        progressLine: goalProgressLine(
          g,
          await seatedSince(ctx.organizationId, g.baselineAt).catch(() => g.baselineNewPatients),
        ),
      })),
  )
  const name = demoSkin?.clinicName ?? ctx.organizationName
  const inbox = await loadApprovalInbox(ctx.organizationId, timeZone)
  const waiting = inbox.proposalCards.length
  const weeklyCounts = new Map<string, number>(
    (standup?.lines ?? []).map((l) => [l.capability, l.count]),
  )
  const grantedCapabilities = new Set(inbox.grants.map((g) => g.capability))
  const waitingCapabilities = new Set(inbox.proposalCards.map((p) => p.capability))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Daily · ${name}`}
        title="Dream Team"
        subtitle={
          waiting > 0
            ? 'Your AI staff. Finished work is below, waiting on your yes — read it, tweak it if you like, and tap approve.'
            : 'Your AI staff. When they finish something that needs your yes, it lands here — and what they handle on their own is reported below.'
        }
      />

      {/* The opening beat — is anything happening? — before the page asks
          anything of anyone (D7). */}
      <TeamStatusBand
        waiting={waiting}
        staged={runway.length}
        handledLastWeek={standup?.totalActions ?? 0}
        weekLabel={standup?.weekLabel ?? null}
        activeGoals={goalCards.filter((g) => g.status === 'active').length}
        lastCycle={cycleLabel(lastCycleAt)}
      />

      <div id="sign-here" className="scroll-mt-24">
      <ApprovalInbox
        proposals={inbox.proposalCards}
        totalOpen={inbox.totalOpen}
        clinicName={name}
        grants={inbox.grants}
        autonomousWork={inbox.autonomousWork}
        isDemo={ctx.isDemo}
      />
      </div>

      {/* A first-visit presence when the desk is truly empty — the page must
          never open onto nothing (the stack + strips all hide when quiet). */}
      {waiting === 0 && inbox.grants.length === 0 && inbox.autonomousWork.length === 0 && (
        <div className="v2-card p-8 text-center">
          <p className="text-3xl" aria-hidden="true">
            🌙
          </p>
          <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
            Here&rsquo;s what they&rsquo;re doing while you work.
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            They watch your reviews, inquiries, schedule, and content around the clock. Work that
            needs your sign-off lands here as a finished draft; the rest gets handled and reported.
          </p>
          <a
            href="#the-team"
            className="mt-3 inline-block text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
          >
            Meet the team ↓
          </a>
        </div>
      )}

      {/* THE VETO RUNWAY — staged work with its Stop (server-formats the
          go-times in the clinic's wall clock; the tz law). */}
      {runway.length > 0 && (
      <RunwaySection
        items={runway.map((r) => ({
          kind: r.kind,
          id: r.id,
          excerpt: r.excerpt,
          destination: r.destination,
          goesOutLabel: formatClinicDayTime(r.goesOutAt, timeZone),
        }))}
      />
      )}

      {/* GOALS — what the practice wants more of; the team aims here. */}
      <GoalsSection goals={goalCards} canEdit={ctx.role === 'owner' || ctx.role === 'admin'} />

      {/* SANDMAN — the chief of staff, in conversation. Sits above the
          roster: the team's face comes before its org chart. */}
      <SandmanPanel clinicName={name} />

      {/* THE ROSTER — the staff you hired, with last week's real numbers. */}
      <TeamRoster
        grantedCapabilities={grantedCapabilities}
        weeklyCounts={weeklyCounts}
        waitingCapabilities={waitingCapabilities}
      />
    </div>
  )
}
