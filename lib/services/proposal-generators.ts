import 'server-only'
import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { z } from 'zod'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { CORE_VOICE_RULES } from '@/lib/services/service-library-ai'
import { isAiUsageOverCap, bumpAiUsage } from '@/lib/services/ai-usage'
import {
  fileProposal,
  expireStaleProposals,
  reconcileStrandedApprovals,
  closeRecoveredProposal,
  autoExecuteProposal,
  machineHandlesCard,
  resolveGrantedCapabilities,
} from '@/lib/services/proposals'
import { recordFailure } from '@/lib/services/action-ledger'
import { clinicLocalHour } from '@/lib/clinic-timezone'
import { resolveTrialState } from '@/lib/trial'

/**
 * PROPOSAL GENERATORS (Transformation Phase 2). The machine notices work it
 * could do, FINISHES it (drafts the actual reply / post / campaign), and
 * files it as a proposal for the Approval Inbox. Four first types, per the
 * doctrine's build order: review replies, social posts, quiet-engine recall
 * campaigns, inquiry responses.
 *
 * Laws:
 *  - A proposal is finished work. AI-drafted types (review replies, inquiry
 *    answers, social posts) SKIP entirely when AI isn't configured — a
 *    generic template reply to a specific human being is worse than none.
 *    The recall campaign drafts from code-owned copy (like the retention
 *    automations') and needs no AI.
 *  - Idempotent + respectful: `sourceKey` files each piece of work at most
 *    once, ever — a decline is a "no" the machine never re-asks about.
 *    Cadence-shaped types (social, recall) key by calendar month, so the
 *    machine asks at most monthly.
 *  - Demo orgs never generate (their inbox is seeded — demo-clinic.ts).
 *  - Best-effort everywhere: one org's failure never stops the sweep, and a
 *    generator failure never blocks the others.
 */

const AI_KIND = 'proposal_draft'
// Flat monthly cap per org (NOT plan-branched — no-plan-gating convention).
export const PROPOSAL_DRAFT_MONTHLY_CAP = 300

// Per-run filing caps keep any single tick calm (and bound AI spend).
const MAX_REVIEW_REPLIES_PER_RUN = 2
const MAX_INQUIRY_RESPONSES_PER_RUN = 3

const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM' in the CLINIC's timezone — the cadence key for at-most-monthly
 *  proposal types. Clinic-local per the CLAUDE.md bucketing law: a UTC key
 *  rolled the month over up to 8h early for US clinics, so a decline on the
 *  evening of the local month's last day could be re-asked within hours
 *  (round-1 Phase-2 audit). */
export function monthKey(now: Date, timeZone: string): string {
  // en-CA formats YYYY-MM-DD; take the year-month.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).format(now)
}

/** Respect-the-no backstop for the cadence types: even across a month
 *  boundary, a decline in the last 14 days means the machine does not
 *  re-ask the same kind of question yet. */
async function recentlyDeclined(
  organizationId: string,
  capability: string,
  now: Date,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - 14 * DAY_MS)
  const rows = await db
    .select({ id: schema.proposal.id, decidedAt: schema.proposal.decidedAt })
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.capability, capability),
        eq(schema.proposal.status, 'declined'),
        gte(schema.proposal.decidedAt, cutoff),
      ),
    )
    .limit(1)
  return rows.length > 0
}

export interface GeneratorRunResult {
  orgsScanned: number
  filed: number
  expired: number
  /** Proposals the machine approved ITSELF under a standing human grant
   *  (Phase 3 — the ladder live). */
  autoExecuted: number
  errors: Array<{ organizationId: string; error: string }>
  /** Failures WRITTEN to a clinic's ledger this run (Phase 4). Fewer than
   *  `errors` by design: the same break is recorded once a day, not once an
   *  hour. Surfaced so the cron response distinguishes "recorded" from
   *  "suppressed as a repeat". */
  failuresRecorded: number
}

/* ── OBSERVABILITY (Transformation Phase 4) ──────────────────────────────
 * Until now a broken generator was a console line nobody reads. A clinic
 * whose review-reply drafting had been failing for a week saw an empty
 * Approval Inbox — indistinguishable from a week with nothing to approve —
 * and so did we. That is the exact blindness the Guardian exists to remove,
 * and the ledger's failure vocabulary (recordFailure, Phase 4 slice 1) is
 * where it goes: three strikes inside a week reads as `blocked`, and the
 * Guardian reports the practice to Dream Create.
 *
 * A break is recorded ONCE A DAY per capability. The cron runs hourly, so
 * without that window one stuck generator would write 24 rows a day into a
 * clinic's own story and trip the three-strike alarm before lunch on day
 * one. With it, a strike means a DAY of a broken thing.
 */
const FAILURE_DEDUPE_MS = DAY_MS

/** Which registered capability owns each step's failures, and how the
 *  machine says it went wrong — the clinic's side of the glass, plain, and
 *  never blaming them for our plumbing. `null` marks internal bookkeeping
 *  whose failure is real but is not a sentence a clinic's story should
 *  carry; those stay in `errors` for the platform. */
export const STEP_FAILURE: Record<string, { capability: string; summary: string } | null> = {
  review_reply: {
    capability: 'review_reply',
    summary: 'Couldn’t draft a reply to a new review just now — I’ll keep trying.',
  },
  inquiry_response: {
    capability: 'inquiry_response',
    summary: 'Couldn’t draft an answer to a website inquiry just now — I’ll keep trying.',
  },
  social_post: {
    capability: 'social_post',
    summary: 'Couldn’t draft a social post just now — I’ll keep trying.',
  },
  outreach_campaign: {
    capability: 'outreach_campaign',
    summary: 'Couldn’t line up a recall campaign just now — I’ll keep trying.',
  },
  autonomy: {
    capability: 'proposal_engine',
    summary: 'Couldn’t finish something you’d handed over to me — I’ll try it again shortly.',
  },
  reconcile: null,
  sweep: null,
}

/** The whole engine died for this org before any generator ran — the worst
 *  case, and the one a clinic can least see: no new work arrives, while
 *  reminders keep firing so nothing looks quiet. */
export const ENGINE_DOWN = {
  capability: 'proposal_engine',
  summary: 'Couldn’t look for new work to bring you just now — I’ll try again shortly.',
}

/** The cron entrypoint: sweep staleness, then run all four generators for
 *  every real (non-demo) clinic org. */
export async function runProposalGenerators(now: Date = new Date()): Promise<GeneratorRunResult> {
  const result: GeneratorRunResult = {
    orgsScanned: 0,
    filed: 0,
    expired: 0,
    autoExecuted: 0,
    errors: [],
    failuresRecorded: 0,
  }
  /** Write a break into the clinic's ledger where the Guardian can see it.
   *  Best-effort by construction: recordFailure never throws, and a run that
   *  cannot do its bookkeeping must still finish its work. */
  // ONE STRIKE PER ORG PER RUN (round-1 audit). `onceWithin` de-dups on
  // (org, capability), and the driver spreads its steps across five
  // different capabilities — so a single 30-second database blip mid-tick
  // threw in every step and wrote FIVE rows at once, instantly clearing
  // FAILURE_ALARM_COUNT and emailing the owner that the practice "tried and
  // couldn't 5 times this week". That is the crying-wolf failure this module
  // says it exists to avoid, and it broke the documented invariant that a
  // strike means a DAY of a broken thing. The per-run guard collapses a
  // one-fault-many-steps tick into a single honest strike; the per-capability
  // day window still separates genuinely different breaks across runs.
  /** Every step that broke for the org currently being swept — collected,
   *  then flushed as ONE strike when that org's pass ends. */
  const broken: Array<{ capability: string; summary: string }> = []
  /** Hand a generator a way to report a soft AI failure into the same
   *  collapse + window a thrown one gets. Deferred, not awaited inline:
   *  the generator is mid-loop and its bookkeeping must not reorder its
   *  work, so the flag is set here and flushed when the step returns. */
  const pendingSoft = new Set<string>()
  const softFailed = (step: string) => () => { pendingSoft.add(step) }
  const noteFailure = (f: { capability: string; summary: string }) => {
    broken.push(f)
  }
  /** ONE STRIKE PER ORG PER RUN, written at the END of that org's pass.
   *  Deferring is what makes the count meaningful: on the first failure we
   *  cannot yet know whether one thing broke or five. Round-2 audit found
   *  the eager version wrote whichever capability failed FIRST and dropped
   *  the rest, so a permanently broken review generator masked every other
   *  break forever. */
  const flushFailures = async (organizationId: string) => {
    if (broken.length === 0) return
    // Several at once is an ENGINE-level story, not any one capability's —
    // truer, and it unmasks the ones a single named strike would hide.
    const f = broken.length === 1 ? broken[0] : ENGINE_DOWN
    broken.length = 0
    const recorded = await recordFailure({
      organizationId,
      capability: f.capability,
      summary: f.summary,
      occurredAt: now,
      onceWithin: FAILURE_DEDUPE_MS,
    })
    if (recorded) result.failuresRecorded++
  }
  // TOP-LEVEL FAILURES (round-2 audit). These two statements run BEFORE any
  // per-org try, so a broken staleness sweep or an unreadable org list threw
  // straight out of the cron: no proposals filed for anybody, and not one
  // failure recorded anywhere, for any clinic. The whole platform's engine
  // could be down and the Guardian would report every practice healthy.
  try {
    result.expired += await expireStaleProposals()
  } catch (e) {
    result.errors.push({ organizationId: '-', error: `expireStale: ${(e as Error).message}` })
  }

  const orgs = await db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.organization)
    .where(and(eq(schema.organization.type, 'clinic'), eq(schema.organization.isDemo, false)))

  for (const org of orgs) {
    result.orgsScanned++
    // Per-org, always: a step that set the flag and THEN threw leaves it
    // behind, and a stale flag would charge the next clinic with a break
    // that was never theirs.
    pendingSoft.clear()
    broken.length = 0
    try {
      const { getClinicTimeZone } = await import('@/lib/services/clinic-timezone')
      const tz = await getClinicTimeZone(org.id)
      // PER-GENERATOR isolation (round-2 audit): one generator throwing must
      // never block its siblings — a review-draft AI blip once silenced the
      // AI-free recall generator too. Each failure is recorded and the pass
      // moves on ("best-effort everywhere", the law at the top of this file).
      const generators: Array<[string, () => Promise<number>]> = [
        // RECONCILE BEFORE SWEEP (verification round 2): a container death
        // mid-approve leaves status='approved' with no executedAt.
        // Reconcile closes attributable executed work WITH its narration —
        // running the sweep first let it expire the reopened row silently
        // (the sweep's premise-rot checks all match the stranded work's own
        // evidence), turning narrate-once into narrate-zero on a timer.
        ['reconcile', async () => (await reconcileStrandedApprovals(org.id, now), 0)],
        ['sweep', async () => ((result.expired += await sweepInvalidatedProposals(org.id)), 0)],
        ['review_reply', () => generateReviewReplyProposals(org.id, now, softFailed('review_reply'))],
        [
          'inquiry_response',
          () => generateInquiryResponseProposals(org.id, org.name, now, softFailed('inquiry_response')),
        ],
        ['social_post', () => generateSocialPostProposals(org.id, org.name, now, tz, softFailed('social_post'))],
        ['outreach_campaign', () => generateOutreachCampaignProposals(org.id, now, tz)],
        // THE LADDER LIVE (Phase 3): LAST, after the generators file — a
        // capability the clinic switched to automatic gets its open cards
        // executed by the machine itself, through the exact human-approve
        // flow (claim → staleness re-checks → execute → narrate once).
        // Only cards filed AT OR AFTER the grant ("from now on" means what
        // it says) and not already handed back; failures reopen and retry
        // next tick under the same guards a human retry gets.
        ['autonomy', async () => ((result.autoExecuted += await autoExecuteGrantedProposals(org.id, now)), 0)],
      ]
      for (const [name, run] of generators) {
        try {
          result.filed += await run()
          // A step that returned normally may still have failed softly.
          if (pendingSoft.delete(name)) {
            const f = STEP_FAILURE[name]
            if (f) {
              result.errors.push({ organizationId: org.id, error: `${name}: AI draft failed` })
              noteFailure(f)
            }
          }
        } catch (e) {
          result.errors.push({ organizationId: org.id, error: `${name}: ${(e as Error).message}` })
          // A step not in the map is either bookkeeping (explicit null) or
          // one somebody added without deciding — the latter falls back to
          // the engine-level line rather than disappearing (round-1 audit).
          const f = name in STEP_FAILURE ? STEP_FAILURE[name] : ENGINE_DOWN
          if (f) noteFailure(f)
        }
      }
    } catch (e) {
      result.errors.push({ organizationId: org.id, error: (e as Error).message })
      noteFailure(ENGINE_DOWN)
    }
    // One honest strike for this clinic, whatever broke and however.
    await flushFailures(org.id)
  }
  return result
}

/** Clinic-local hours inside which the machine may send to a patient's
 *  inbox on its own — mid-morning through early evening. The same daylight
 *  INTENT as the retention automations, which aim their sends at
 *  the LEARNED send hour (the shared brain's, clinic-local); this is a hard WINDOW, not a
 *  target — automationSendAt falls back to "now" when that hour has passed, so
 *  it bounds nothing on its own (round-3 audit corrected the earlier claim
 *  that this rule already existed there). */
export const SEND_WINDOW_START_HOUR = 8
export const SEND_WINDOW_END_HOUR = 19
/** The granted capabilities whose execution puts mail in a patient's inbox. */
export const PATIENT_INBOX_CAPABILITIES: string[] = ['outreach_campaign', 'inquiry_response']

/** Whether the machine may send to patient inboxes right now, in the
 *  clinic's own wall clock. Exported so the card's copy and the driver
 *  answer from the same rule. */
export function insidePatientSendWindow(now: Date, timeZone: string | null | undefined): boolean {
  const hour = clinicLocalHour(now, timeZone)
  return hour >= SEND_WINDOW_START_HOUR && hour < SEND_WINDOW_END_HOUR
}

/**
 * Execute the open proposals of every capability this clinic has switched
 * to automatic (Phase 3 — "always do this for me"). READS the stored trust
 * only; nothing here can widen it. Each proposal runs through
 * autoExecuteProposal — the same claim/staleness/recovery/narrate-once
 * machinery as a human approve — so autonomy inherits every guard the
 * audit hardened. Per-proposal isolation: one failure reopens that card
 * (it retries next tick, and stays visible to humans meanwhile) and never
 * blocks its siblings.
 */
export async function autoExecuteGrantedProposals(
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const [profile] = await db
    .select({
      autonomy: schema.clinicProfile.autonomy,
      timezone: schema.clinicProfile.timezone,
      trialEndsAt: schema.clinicProfile.trialEndsAt,
      subscriptionStatus: schema.clinicProfile.subscriptionStatus,
      stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!profile) return 0
  // THE TAKE-BACK MUST BE REACHABLE (round-3 audit). A clinic whose trial
  // lapsed or whose subscription is canceled has its whole dashboard
  // replaced by the billing wall — and the Overview strip is the ONLY place
  // autonomy can be handed back. Acting on its behalf while it cannot stop
  // us breaks "trust is reversible always", and the work is public and
  // patient-facing. A walled clinic goes back to being asked; its cards
  // simply wait, and countOpenProposals applies the SAME billing gate so
  // they are counted as waiting on a human again rather than subtracted for
  // a machine that will never touch them.
  if (resolveTrialState(profile, now).expired) return 0
  const granted = resolveGrantedCapabilities(profile.autonomy)
  if (granted.length === 0) return 0
  // THE SEND WINDOW (round-1 Phase-3 audit). Under "ask" the hour a patient
  // email went out was implicitly human-gated — staff tap Approve during
  // office hours. Autonomy removes the human, and this cron runs on a UTC
  // clock, so a granted recall campaign filed on the 10:00 UTC tick lands in
  // a Pacific clinic's patients' inboxes at 3 AM. Patient-facing sends wait
  // for daylight; the card simply stays open until the next tick inside the
  // window. (Public replies and posts have no inbox to wake and stay
  // immediate — a 1-star review answered at midnight is a good thing.)
  const runnable = insidePatientSendWindow(now, profile.timezone)
    ? granted
    : granted.filter((g) => !PATIENT_INBOX_CAPABILITIES.includes(g.capability))
  if (runnable.length === 0) return 0
  // THE one law for "in my hands": granted, filed at or after the grant,
  // and not already given up on. Shared with the badge count and the
  // card's copy so the three can never disagree.
  const mine = machineHandlesCard(runnable)
  if (!mine) return 0

  const open = await db
    .select({ id: schema.proposal.id, capability: schema.proposal.capability })
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.status, 'open'),
        or(isNull(schema.proposal.expiresAt), gte(schema.proposal.expiresAt, now)),
        mine,
      ),
    )
  let executed = 0
  for (const p of open) {
    try {
      const r = await autoExecuteProposal(organizationId, p.id)
      if (r.ok) executed++
      // ok:false is a normal outcome here — a retire (someone handled the
      // work) or a reopen (transient failure; next tick retries). Both are
      // already narrated/guarded inside the decide flow.
    } catch (e) {
      console.error('[proposal-generators] auto-execute failed for', p.id, e)
    }
  }
  return executed
}

/**
 * Expire open proposals whose underlying work vanished out from under them —
 * a review replied to at the counter, an inquiry someone already called
 * back. Approval re-checks too; this keeps the inbox honest between taps.
 */
export async function sweepInvalidatedProposals(organizationId: string): Promise<number> {
  let expired = 0
  const open = await db
    .select({
      id: schema.proposal.id,
      capability: schema.proposal.capability,
      payload: schema.proposal.payload,
      createdAt: schema.proposal.createdAt,
      // The attribution fields (verification round 3): before expiring on
      // premise-rot evidence, the sweep must check whether that evidence IS
      // our own completed work — the verbatim reply / our sent campaign /
      // our published post — and close it WITH its narration instead.
      body: schema.proposal.body,
      patientId: schema.proposal.patientId,
      isDemo: schema.proposal.isDemo,
    })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.status, 'open')))
  if (open.length === 0) return 0

  const toExpire: string[] = []
  const reviewIds = new Map<string, string>() // externalReviewId → proposalId
  const leadIds = new Map<string, string>()
  const socialProposals: Array<{ id: string; createdAt: Date }> = []
  const campaignProposals: string[] = []
  for (const p of open) {
    const payload = (p.payload ?? {}) as Record<string, unknown>
    if (p.capability === 'review_reply' && typeof payload.externalReviewId === 'string') {
      reviewIds.set(payload.externalReviewId, p.id)
    } else if (p.capability === 'inquiry_response' && typeof payload.leadId === 'string') {
      leadIds.set(payload.leadId, p.id)
    } else if (p.capability === 'social_post') {
      socialProposals.push({ id: p.id, createdAt: p.createdAt })
    } else if (p.capability === 'outreach_campaign') {
      campaignProposals.push(p.id)
    }
  }
  if (reviewIds.size > 0) {
    const rows = await db
      .select({ externalReviewId: schema.platformReview.externalReviewId, replyComment: schema.platformReview.replyComment })
      .from(schema.platformReview)
      .where(
        and(
          eq(schema.platformReview.organizationId, organizationId),
          eq(schema.platformReview.platform, 'googlebusiness'),
          inArray(schema.platformReview.externalReviewId, Array.from(reviewIds.keys())),
        ),
      )
    const present = new Set<string>()
    for (const r of rows) {
      present.add(r.externalReviewId)
      if (r.replyComment) toExpire.push(reviewIds.get(r.externalReviewId)!)
    }
    // Review row gone entirely → the draft has nothing to attach to.
    for (const [rid, pid] of Array.from(reviewIds.entries())) if (!present.has(rid)) toExpire.push(pid)
  }
  if (leadIds.size > 0) {
    const rows = await db
      .select({ id: schema.lead.id, status: schema.lead.status })
      .from(schema.lead)
      .where(and(eq(schema.lead.organizationId, organizationId), inArray(schema.lead.id, Array.from(leadIds.keys()))))
    const present = new Set<string>()
    for (const r of rows) {
      present.add(r.id)
      if (r.status !== 'new') toExpire.push(leadIds.get(r.id)!)
    }
    for (const [lid, pid] of Array.from(leadIds.entries())) if (!present.has(lid)) toExpire.push(pid)
  }
  // The cadence types' premises can rot too (round-3 audit — the sweep
  // covered only half the capabilities):
  //  - a "your channels have been quiet" card is stale the moment the clinic
  //    publishes or schedules a post itself;
  //  - a "the recall engine is quiet" card is stale once a campaign goes out
  //    or gets scheduled — approving it later would double-blast the same
  //    recall patients. (executeOutreachCampaign re-checks at the tap too;
  //    this keeps the card honest BETWEEN taps, same as reviews/inquiries.)
  if (socialProposals.length > 0) {
    const oldest = socialProposals.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b))
    const [activity] = await db
      .select({ id: schema.socialPostTarget.id })
      .from(schema.socialPostTarget)
      .where(
        and(
          eq(schema.socialPostTarget.organizationId, organizationId),
          or(
            eq(schema.socialPostTarget.status, 'scheduled'),
            and(
              eq(schema.socialPostTarget.status, 'published'),
              gte(schema.socialPostTarget.publishedAt, oldest.createdAt),
            ),
          ),
        ),
      )
      .limit(1)
    if (activity) {
      for (const sp of socialProposals) toExpire.push(sp.id)
    }
  }
  if (campaignProposals.length > 0) {
    try {
      const { getRecallStats } = await import('@/lib/services/recall-stats')
      const stats = await getRecallStats(organizationId)
      if (stats.recentSends.length > 0 || stats.upcomingSends.length > 0) {
        toExpire.push(...campaignProposals)
      }
    } catch {
      // Best-effort: an unreadable stats snapshot never expires real work.
    }
  }

  if (toExpire.length > 0) {
    // NARRATE-ONCE UNDER RECOVERY, in the sweep too (verification round 3):
    // the rot-evidence above can be OUR OWN completed work — a reply that
    // posted to Google before the local write failed, a stranded approve's
    // sent campaign or published post. closeRecoveredProposal (THE single
    // recovery-closing home) attributes and, when it's ours, writes the
    // missing ledger entry and expires with executedAt; only unattributable
    // rot falls through to the silent batch expiry.
    const byId = new Map(open.map((p) => [p.id, p]))
    const plainExpire: string[] = []
    for (const id of toExpire) {
      const p = byId.get(id)
      let outcome: 'closed' | 'not_ours' | 'skip' = 'not_ours'
      if (p) {
        try {
          outcome = await closeRecoveredProposal(
            {
              id: p.id,
              organizationId,
              capability: p.capability,
              patientId: p.patientId,
              body: p.body,
              payload: p.payload,
              isDemo: p.isDemo,
            },
            'open',
          )
        } catch {
          // A failed close must never turn into a silent expire — leave the
          // row for the next hourly pass (verification round 4).
          outcome = 'skip'
        }
      }
      if (outcome === 'closed') expired++
      else if (outcome === 'not_ours') plainExpire.push(id)
      // 'skip' → neither: the row stays as-is for the next pass.
    }
    if (plainExpire.length > 0) {
      await db
        .update(schema.proposal)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(
          and(
            eq(schema.proposal.organizationId, organizationId),
            eq(schema.proposal.status, 'open'),
            inArray(schema.proposal.id, plainExpire),
          ),
        )
      expired += plainExpire.length
    }
  }
  return expired
}

// ── Shared AI drafting helper ────────────────────────────────────────────────

const DraftSchema = z.object({ text: z.string().min(1).max(2000) })

/** Typed failure channel (round-3 audit — the review generator's round-2
 *  lesson, applied to its shared helper): callers in a loop must be able to
 *  tell an ORG-GLOBAL refusal (AI off, over the monthly cap — stop the pass)
 *  from a PER-ITEM failure (model hiccup, schema miss — skip just this one).
 *  A bare null conflated them and one un-draftable inquiry froze the loop. */
type DraftTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'not_configured' | 'no_allowance' | 'failed' | 'unusable' }

async function draftText(
  organizationId: string,
  opts: { system: string; user: string; maxTokens?: number },
): Promise<DraftTextResult> {
  if (!aiConfigured()) return { ok: false, reason: 'not_configured' }
  if (await isAiUsageOverCap(organizationId, AI_KIND, PROPOSAL_DRAFT_MONTHLY_CAP)) {
    return { ok: false, reason: 'no_allowance' }
  }
  let raw: unknown
  try {
    raw = await runClaudeJson({
      model: 'sonnet',
      maxTokens: opts.maxTokens ?? 500,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      toolName: 'draft_text',
      toolDescription: 'Return the drafted text for a staff member to review.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The drafted text.' } },
        required: ['text'],
      },
    })
  } catch (err) {
    console.warn('[proposal-generators] AI draft failed', err)
    return { ok: false, reason: 'failed' }
  }
  const parsed = DraftSchema.safeParse(raw)
  // 'unusable', not 'failed': the provider answered, this ONE draft was no
  // good. Only a provider break is an engine-level signal (round-2 audit).
  if (!parsed.success) return { ok: false, reason: 'unusable' }
  await bumpAiUsage(organizationId, AI_KIND)
  return { ok: true, text: parsed.data.text.trim() }
}

/** Cheap existence check so we never spend an AI draft on an already-claimed
 *  sourceKey (fileProposal would just no-op after the money was spent). */
async function sourceKeyTaken(organizationId: string, sourceKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.proposal.id })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.sourceKey, sourceKey)))
    .limit(1)
  return !!row
}

// ── 1. Review replies ────────────────────────────────────────────────────────

/**
 * A soft AI failure — the provider refused, timed out, or 429'd.
 *
 * ROUND-1 AUDIT, the deepest finding of the phase. Slice 4 wired
 * `recordFailure` into the driver's CATCH blocks, but the AI helpers are
 * deliberately hardened never to throw (review-reply-ai.ts: "Caught, never
 * thrown"), so they return `{ ok:false, reason:'failed' }` and every caller
 * quietly `continue`s. A revoked or rate-limited ANTHROPIC_API_KEY therefore
 * broke all three AI generators SILENTLY and forever: the Approval Inbox went
 * permanently empty, `failures7` stayed 0, reminders kept firing so the
 * Guardian reported `healthy`, and neither the clinic nor Dream Create ever
 * learned. The observability slice could not see the failure mode most
 * likely to actually happen.
 *
 * So soft failures get an explicit channel to the driver, where they meet the
 * same per-run collapse and daily window as a thrown one.
 */
export type OnSoftFailure = () => void

export async function generateReviewReplyProposals(
  organizationId: string,
  now: Date = new Date(),
  onSoftFailure?: OnSoftFailure,
): Promise<number> {
  if (!aiConfigured()) return 0
  // Unreplied Google reviews, worst-first (a 1–2★ deserves the fastest
  // answer), then newest.
  const reviews = await db
    .select({
      externalReviewId: schema.platformReview.externalReviewId,
      reviewerName: schema.platformReview.reviewerName,
      starRating: schema.platformReview.starRating,
      comment: schema.platformReview.comment,
    })
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, organizationId),
        eq(schema.platformReview.platform, 'googlebusiness'),
        isNull(schema.platformReview.replyComment),
      ),
    )
    .orderBy(
      sql`case when ${schema.platformReview.starRating} <= 2 then 0 else 1 end`,
      desc(sql`COALESCE(${schema.platformReview.reviewCreatedAt}, ${schema.platformReview.createdAt})`),
    )
    .limit(10)

  // THE ONE drafting home: lib/services/review-reply-ai.ts — the hardened
  // public+HIPAA prompt ("never mention any visit, treatment, date, or
  // clinical detail — even when the review does") and the one
  // review_reply_draft meter. Round-1 Phase-2 audit: this generator briefly
  // forked its own weaker prompt + a second meter; never again.
  const { draftGoogleReviewReply } = await import('@/lib/services/review-reply-ai')

  let filed = 0
  for (const r of reviews) {
    if (filed >= MAX_REVIEW_REPLIES_PER_RUN) break
    const sourceKey = `review_reply:${r.externalReviewId}`
    if (await sourceKeyTaken(organizationId, sourceKey)) continue

    const who = r.reviewerName?.trim() || 'A patient'
    const stars = r.starRating ? `${r.starRating}-star` : 'unrated'
    const lowStar = (r.starRating ?? 5) <= 2
    const draft = await draftGoogleReviewReply({
      organizationId,
      externalReviewId: r.externalReviewId,
      planTier: undefined,
    })
    if (!draft.ok) {
      // Org-global reasons (AI off / over the shared monthly cap) end the
      // pass; a PER-REVIEW failure (model refusal, schema miss) skips just
      // that review — one un-draftable rant must not freeze the whole
      // generator behind the deterministic ordering (round-2 audit).
      if (draft.reason === 'not_configured' || draft.reason === 'no_allowance') break
      // Only a PROVIDER break is an engine failure. 'unusable'/'not_found'
      // are about this one review and must never reach the Guardian.
      if (draft.reason === 'failed') onSoftFailure?.()
      continue
    }

    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'review_reply',
      sourceKey,
      title: lowStar
        ? `Reply to ${who}’s ${stars} review — worth answering today`
        : `Reply to ${who}’s ${stars} Google review`,
      body: draft.draft,
      payload: {
        externalReviewId: r.externalReviewId,
        // The thing being answered, quoted on the approval card — staff
        // never approve a public reply blind (round-1 in-phase gap).
        context: {
          kind: 'review',
          author: r.reviewerName,
          starRating: r.starRating,
          text: r.comment,
        },
      },
      expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    })
    if (ok) filed++
  }
  return filed
}

// ── 2. Inquiry responses ─────────────────────────────────────────────────────

export async function generateInquiryResponseProposals(
  organizationId: string,
  clinicName: string,
  now: Date = new Date(),
  onSoftFailure?: OnSoftFailure,
): Promise<number> {
  if (!aiConfigured()) return 0
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
  const leads = await db
    .select({
      id: schema.lead.id,
      name: schema.lead.name,
      email: schema.lead.email,
      message: schema.lead.message,
      preferredDate: schema.lead.preferredDate,
      createdAt: schema.lead.createdAt,
    })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.status, 'new'),
        gte(schema.lead.createdAt, weekAgo),
      ),
    )
    .orderBy(desc(schema.lead.createdAt))
    .limit(10)

  let filed = 0
  for (const lead of leads) {
    if (filed >= MAX_INQUIRY_RESPONSES_PER_RUN) break
    if (!lead.email?.trim()) continue // phone-only inquiries stay on the Leads board
    const sourceKey = `inquiry_response:${lead.id}`
    if (await sourceKeyTaken(organizationId, sourceKey)) continue

    const first = lead.name.trim().split(/\s+/)[0] || 'there'
    const draft = await draftText(organizationId, {
      system: `You are the front desk of ${clinicName}, a dental clinic, drafting an email reply to someone who wrote in through the website. A staff member reviews and edits before it sends. ${CORE_VOICE_RULES}
Additional rules:
- 2–4 sentences. Answer their actual question as far as you honestly can; where you can't, say a team member will confirm the specifics.
- Warmly invite them to book a visit. Do not fabricate available times, prices, or insurance answers.
- No signature block — the email template signs for the clinic.`,
      user: `Their name: ${lead.name}\n${lead.preferredDate ? `Preferred date they mentioned: ${lead.preferredDate}\n` : ''}Their message:\n${lead.message?.trim() || '(no message — they just left contact details)'}\n\nDraft the reply email body.`,
    })
    if (!draft.ok) {
      // Same law as the review generator (round-2/3 audits): org-global
      // refusals end the pass; one un-draftable inquiry skips only itself —
      // otherwise the newest-first ordering lets a single poisoned lead
      // starve every older inquiry behind it for its whole 7-day window.
      if (draft.reason === 'not_configured' || draft.reason === 'no_allowance') break
      // 'failed' is the provider breaking; 'unusable' is this one lead being
      // awkward, and a clinic must never be reported broken for that.
      if (draft.reason === 'failed') onSoftFailure?.()
      continue
    }

    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'inquiry_response',
      sourceKey,
      title: `Answer ${first}’s website inquiry`,
      body: draft.text,
      payload: {
        leadId: lead.id,
        subject: `Your question for ${clinicName}`,
        // The inquiry itself, quoted on the approval card (round-1 gap).
        context: {
          kind: 'inquiry',
          author: lead.name,
          text: lead.message,
          preferredDate: lead.preferredDate,
        },
      },
      expiresAt: new Date(now.getTime() + 7 * DAY_MS),
    })
    if (ok) filed++
  }
  return filed
}

// ── 3. Social posts (quiet channels) ─────────────────────────────────────────

const SOCIAL_QUIET_DAYS = 14

export async function generateSocialPostProposals(
  organizationId: string,
  clinicName: string,
  now: Date,
  timeZone: string,
  onSoftFailure?: OnSoftFailure,
): Promise<number> {
  if (!aiConfigured()) return 0
  const sourceKey = `social_post:${monthKey(now, timeZone)}`
  if (await sourceKeyTaken(organizationId, sourceKey)) return 0
  if (await recentlyDeclined(organizationId, 'social_post', now)) return 0

  const { getComposerChannels } = await import('@/lib/services/social-posts')
  const channels = await getComposerChannels(organizationId)
  if (channels.length === 0) return 0

  // Quiet = nothing published in the window AND nothing waiting in the
  // queue. A clinic that just scheduled a month of posts has published
  // nothing lately, but its channels are the opposite of quiet — proposing
  // an immediate post would contradict work they can see queued on
  // /growth/social (round-2 audit; the recall generator's upcomingSends
  // twin check, applied here).
  const since = new Date(now.getTime() - SOCIAL_QUIET_DAYS * DAY_MS)
  const [recent] = await db
    .select({ id: schema.socialPostTarget.id })
    .from(schema.socialPostTarget)
    .where(
      and(
        eq(schema.socialPostTarget.organizationId, organizationId),
        eq(schema.socialPostTarget.status, 'published'),
        gte(schema.socialPostTarget.publishedAt, since),
      ),
    )
    .limit(1)
  if (recent) return 0
  const [queued] = await db
    .select({ id: schema.socialPostTarget.id })
    .from(schema.socialPostTarget)
    .where(
      and(
        eq(schema.socialPostTarget.organizationId, organizationId),
        eq(schema.socialPostTarget.status, 'scheduled'),
      ),
    )
    .limit(1)
  if (queued) return 0

  const draft = await draftText(organizationId, {
    system: `You write short social posts for ${clinicName}, a dental clinic. A staff member reviews and edits before anything publishes. ${CORE_VOICE_RULES}
Additional rules:
- 2–4 sentences, no hashtag walls (at most one natural hashtag, or none).
- Evergreen and warm: a genuinely useful dental-health tip, a note about what a first visit is like, or a friendly reminder that the practice welcomes new patients.
- NEVER invent events, offers, staff names, or anything clinic-specific you weren't told.`,
    user: `Draft one post the clinic could publish this week.`,
  })
  if (!draft.ok) {
    if (draft.reason === 'failed') onSoftFailure?.()
    return 0
  }

  const { filed } = await fileProposal({
    organizationId,
    capability: 'social_post',
    sourceKey,
    title: `Your channels have been quiet — post this?`,
    body: draft.text,
    payload: {
      accountIds: channels.map((c) => c.accountId),
      // The DESTINATIONS, named on the card (verification round: "posts to
      // 3 channels" hid that one of them is the clinic's Google Business
      // listing — the destination is the other half of a public post).
      // accountIds stays the executor's source of truth.
      channels: channels.map((c) => ({ accountId: c.accountId, label: c.label })),
    },
    expiresAt: new Date(now.getTime() + 21 * DAY_MS),
  })
  return filed ? 1 : 0
}

// ── 4. Quiet-engine recall campaign ──────────────────────────────────────────

const RECALL_MIN_REACHABLE = 10

// Code-owned default copy (same posture as the retention automations'
// defaults): deterministic, anti-shame, edited by staff in the inbox.
// {{firstName}} and {{bookingUrl}} are per-recipient merge tokens.
export const RECALL_PROPOSAL_SUBJECT = 'Time for a cleaning? We’d love to see you'
export const RECALL_PROPOSAL_BODY = `Hi {{firstName}},

It’s been a while since your last visit, and a regular cleaning is the easiest way to keep small things small.

No judgment — life gets busy. Pick a time that works and we’ll take care of the rest.`

export async function generateOutreachCampaignProposals(
  organizationId: string,
  now: Date,
  timeZone: string,
): Promise<number> {
  const sourceKey = `outreach_campaign:recall:${monthKey(now, timeZone)}`
  if (await sourceKeyTaken(organizationId, sourceKey)) return 0
  if (await recentlyDeclined(organizationId, 'outreach_campaign', now)) return 0

  const { getRecallStats } = await import('@/lib/services/recall-stats')
  const stats = await getRecallStats(organizationId)
  // The engine is QUIET: enough reachable due patients, nothing sent in the
  // last 30 days, nothing already scheduled to go.
  if (stats.recallDueReachableCount < RECALL_MIN_REACHABLE) return 0
  if (stats.recentSends.length > 0) return 0
  if (stats.upcomingSends.length > 0) return 0

  const { ensureOutreachTierAudiences } = await import('@/lib/services/outreach-tiers')
  const audienceIds = await ensureOutreachTierAudiences(organizationId)
  const audienceId = audienceIds.get('recall_due')
  if (!audienceId) return 0

  const n = stats.recallDueReachableCount
  const { filed } = await fileProposal({
    organizationId,
    capability: 'outreach_campaign',
    sourceKey,
    title: `${n} patients are due for a cleaning — I wrote the campaign. Send it?`,
    body: RECALL_PROPOSAL_BODY,
    payload: {
      audienceId,
      subject: RECALL_PROPOSAL_SUBJECT,
      name: `Recall — ${monthKey(now, timeZone)}`,
      recipientCount: n,
    },
    expiresAt: new Date(now.getTime() + 14 * DAY_MS),
  })
  return filed ? 1 : 0
}
