import 'server-only'
import { and, asc, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getCapability } from '@/lib/autonomy'
import { recordAction } from '@/lib/services/action-ledger'

/**
 * PROPOSALS + THE APPROVAL INBOX (Transformation Phase 2 — DESIGN.md "The
 * North Star", primitive #2). When the machine wants to act beyond its trust
 * level it files a proposal: a FINISHED piece of work awaiting a yes — the
 * drafted review reply, the written campaign — never a nudge that links to a
 * tool. Staff read it in plain English, optionally edit the work product,
 * and tap Approve; approval EXECUTES the work right here.
 *
 * THE LEDGER-BOUNDARY LAW for approved executions (decided with this phase,
 * per the round-3 backlog item): an approved proposal narrates EXACTLY ONCE
 * in the Action Ledger, under the PROPOSAL's capability, written by THIS
 * service after the executor succeeds. Executors therefore run with the
 * approver's userId wherever the underlying service takes an initiator
 * (e.g. sendCampaign) so the underlying automation's own ledger writer stays
 * silent — otherwise one yes would narrate twice. Declines and expiries
 * never ledger (nothing happened) — with ONE deliberate exception
 * (verification rounds 1–2): a RECOVERED expiry, where the evidence says a
 * stranded prior approve's work actually executed (our reply on the review,
 * our campaign row sent, our post's target published), writes the missing
 * entry exactly once, guarded by hasEntryForProposal. Without it, the
 * reconcile-reopen-retire loop turned narrate-once into narrate-zero.
 *
 * Dedupe law: `sourceKey` is unique per org — one proposal EVER per piece of
 * underlying work. A declined proposal is a human "no" and is never re-filed
 * for the same source (respect the no).
 */

export const PROPOSAL_BODY_MAX = 5000
export const PROPOSAL_TITLE_MAX = 200

export interface FileProposalInput {
  organizationId: string
  capability: string
  sourceKey: string
  title: string
  body: string
  patientId?: string | null
  payload?: Record<string, unknown> | null
  expiresAt?: Date | null
  isDemo?: boolean
}

export interface ProposalView {
  id: string
  capability: string
  capabilityLabel: string
  patientId: string | null
  title: string
  body: string
  payload: unknown
  status: string
  createdAt: Date
  expiresAt: Date | null
}

function newProposalId(): string {
  return `prop_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

/**
 * File a proposal, idempotent on (org, sourceKey) — refiling an existing
 * source (open OR already decided) is a silent no-op. Returns whether a new
 * proposal was actually created so generators can meter their AI spend.
 */
export async function fileProposal(input: FileProposalInput): Promise<{ filed: boolean; id: string | null }> {
  if (!getCapability(input.capability)) {
    console.warn(`[proposals] capability '${input.capability}' is not registered in lib/autonomy.ts CAPABILITIES`)
  }
  const title = input.title.trim().slice(0, PROPOSAL_TITLE_MAX)
  const body = input.body.trim().slice(0, PROPOSAL_BODY_MAX)
  if (!title || !body) return { filed: false, id: null }
  const id = newProposalId()
  const rows = await db
    .insert(schema.proposal)
    .values({
      id,
      organizationId: input.organizationId,
      capability: input.capability,
      sourceKey: input.sourceKey,
      title,
      body,
      patientId: input.patientId ?? null,
      payload: input.payload ?? null,
      expiresAt: input.expiresAt ?? null,
      isDemo: input.isDemo ? 1 : 0,
    })
    .onConflictDoNothing({ target: [schema.proposal.organizationId, schema.proposal.sourceKey] })
    .returning({ id: schema.proposal.id })
  return rows.length > 0 ? { filed: true, id } : { filed: false, id: null }
}

function toView(r: typeof schema.proposal.$inferSelect): ProposalView {
  return {
    id: r.id,
    capability: r.capability,
    capabilityLabel: getCapability(r.capability)?.label ?? r.capability,
    patientId: r.patientId,
    title: r.title,
    body: r.body,
    payload: r.payload,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }
}

/** Open, unexpired proposals — the Approval Inbox's list. SOONEST-TO-EXPIRE
 *  first (round-2 audit): newest-first buried the most urgent work — a 7-day
 *  inquiry draft sorted below a later-filed 30-day review reply, and the
 *  truncated tail was exactly the set about to expire unseen. Postgres ASC
 *  puts NULL expiries last; createdAt breaks ties oldest-first. */
export async function listOpenProposals(organizationId: string, limit = 12): Promise<ProposalView[]> {
  const now = new Date()
  const rows = await db
    .select()
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.status, 'open'),
        or(isNull(schema.proposal.expiresAt), gt(schema.proposal.expiresAt, now)),
      ),
    )
    .orderBy(asc(schema.proposal.expiresAt), asc(schema.proposal.createdAt))
    .limit(limit)
  return rows.map(toView)
}

/** How many proposals wait on a yes (drives the inbox count + the standup's
 *  "things only you can do" line). */
export async function countOpenProposals(organizationId: string): Promise<number> {
  const now = new Date()
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.status, 'open'),
        or(isNull(schema.proposal.expiresAt), gt(schema.proposal.expiresAt, now)),
      ),
    )
  return Number(row?.c ?? 0)
}

/** Sweep open proposals past their expiresAt into 'expired'. Org-scoped when
 *  given; the generator cron sweeps globally. */
export async function expireStaleProposals(organizationId?: string): Promise<number> {
  const now = new Date()
  const rows = await db
    .update(schema.proposal)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(schema.proposal.status, 'open'),
        lt(schema.proposal.expiresAt, now),
        ...(organizationId ? [eq(schema.proposal.organizationId, organizationId)] : []),
      ),
    )
    .returning({ id: schema.proposal.id })
  return rows.length
}

/**
 * Resolve approvals stranded by a process death: status='approved' with no
 * executedAt, decided long enough ago that no live executor can still be
 * running. Without this, a container replacement mid-approve (deploys do
 * this routinely) swallowed the yes forever — the card left the inbox, no
 * ledger entry wrote, and the claimed sourceKey blocked a re-file (round-3
 * audit). Verification round 2 taught the deeper law: RECONCILE MUST CLOSE
 * ATTRIBUTABLE WORK ITSELF. Blind reopening handed the row to the hourly
 * invalidation sweep, which expired it with no narration before anyone
 * could tap Approve — narrate-once became narrate-zero on a timer. So:
 *  - evidence says the prior attempt's work EXECUTED (our reply on the
 *    review / our campaign row active-or-completed / our post's target
 *    published or scheduled) → write the missing ledger entry (guarded by
 *    hasEntryForProposal) and close the row as executed;
 *  - no such evidence → reopen for a human retry, EXTENDING a passed or
 *    imminent expiry (a reopened row the inbox can't show is just a slower
 *    way to lose the yes — the expiresAt > now filter hid it and the next
 *    tick expired it, sourceKey still claimed). Executors self-guard the
 *    rerun. The one residual window (an inquiry email delivered in the
 *    same instant the process died, before markLeadContacted) is accepted:
 *    it needs three simultaneous failures, and inquiry work is not
 *    attributable from data (a lead status flip could be staff).
 */
export async function reconcileStrandedApprovals(
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000)
  const stranded = await db
    .select()
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.status, 'approved'),
        isNull(schema.proposal.executedAt),
        lt(schema.proposal.decidedAt, cutoff),
      ),
    )
  let resolved = 0
  for (const p of stranded) {
    try {
      const outcome = await closeRecoveredProposal(p, 'approved', now)
      if (outcome === 'skip') continue // transient — the next hourly pass retries
      if (outcome === 'not_ours') {
        const minExpiry = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
        const payload = (p.payload ?? {}) as Record<string, unknown>
        await db
          .update(schema.proposal)
          .set({
            status: 'open',
            decidedAt: null,
            decidedByUserId: null,
            // The reopened row WAS approved once — the marker lets later
            // attribution (the sweep's verbatim review match) know the
            // evidence can be ours (verification round 4's mis-credit
            // guard needs it to tell our stranded reply from a staff
            // member's hand-pasted one).
            payload: { ...payload, approveAttempted: true },
            ...(p.expiresAt && p.expiresAt > minExpiry ? {} : { expiresAt: minExpiry }),
            updatedAt: now,
          })
          .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.id, p.id)))
      }
      resolved++
    } catch (e) {
      console.error('[proposals] reconcile failed for', p.id, e)
    }
  }
  return resolved
}

/** The fields attribution + narration need — a structural pick so the
 *  reconcile (full rows) and the invalidation sweep (its slimmer select)
 *  can both close recovered work through the ONE implementation. */
export interface RecoverableProposal {
  id: string
  organizationId: string
  capability: string
  patientId: string | null
  body: string
  payload: unknown
  isDemo: number
  decidedByUserId?: string | null
  expiresAt?: Date | null
}

/**
 * Close a proposal whose work EVIDENTLY EXECUTED (attribution via
 * detectRecoveredWork): narrate once (hasEntryForProposal guard), then
 * ATOMICALLY expire with executedAt — conditional on the row still being
 * in the caller's expected status, so a concurrent approve can never be
 * clobbered to 'expired' (verification round 4). THE single home for
 * recovery-closing (verification round 3): the reconcile AND the
 * invalidation sweep both route through it.
 *
 * Three-state result (verification round 4 — a boolean conflated "not our
 * work" with "couldn't tell this pass", and a transient read failure
 * terminally closed real work unnarrated):
 *  - 'closed'   — ours, narrated (or already narrated), expired.
 *  - 'not_ours' — attribution says the evidence is NOT our own attempt's
 *                 work; the caller proceeds with its default handling.
 *  - 'skip'     — leave the row alone THIS PASS: the attribution or
 *                 narration read failed transiently, or a concurrent
 *                 approve claimed the row mid-close. The next hourly pass
 *                 retries; an un-closed rotten card for one hour is
 *                 harmless, a terminal narrate-zero is not.
 */
export async function closeRecoveredProposal(
  p: RecoverableProposal,
  expectedStatus: 'open' | 'approved',
  now: Date = new Date(),
): Promise<'closed' | 'not_ours' | 'skip'> {
  let recovered: { ledgerSummary: string; ledgerDetail?: Record<string, unknown> } | null
  try {
    // MIS-CREDIT GUARD (verification round 4): attribution needs evidence
    // of OUR OWN prior attempt, not just matching artifacts. An approved
    // row IS that evidence; an open row must carry the reopened-from-
    // approval marker — otherwise a staff member who copy-pasted the
    // drafted reply into Google by hand would earn the machine a false
    // "you approved it" story. (Social/campaign attribution already
    // implies our attempt: the payload ids are stamped by executors.)
    const payload = (p.payload ?? {}) as Record<string, unknown>
    const hadOwnAttempt = expectedStatus === 'approved' || payload.approveAttempted === true
    recovered = await detectRecoveredWork(p, hadOwnAttempt)
  } catch (e) {
    console.error('[proposals] recovery attribution failed — retrying next pass:', e)
    return 'skip'
  }
  if (!recovered) return 'not_ours'
  try {
    const { hasEntryForProposal } = await import('@/lib/services/action-ledger')
    if (!(await hasEntryForProposal(p.organizationId, p.id))) {
      const narrated = await recordAction({
        organizationId: p.organizationId,
        capability: p.capability,
        patientId: p.patientId,
        summary: recovered.ledgerSummary,
        detail: {
          proposalId: p.id,
          ...(p.decidedByUserId ? { approvedByUserId: p.decidedByUserId } : {}),
          recovered: true,
          ...recovered.ledgerDetail,
        },
      })
      // recordAction swallows its own errors — a false means no entry
      // landed; expiring now would be the terminal narrate-zero.
      if (!narrated) return 'skip'
    }
  } catch (e) {
    console.error('[proposals] recovery narration failed — retrying next pass:', e)
    return 'skip'
  }
  // Conditional close: 0 rows = a concurrent approve claimed the row
  // between our read and this write — leave it to that approve (its own
  // narration is suppressed by the same hasEntryForProposal guard).
  const closedRows = await db
    .update(schema.proposal)
    .set({ status: 'expired', executedAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.proposal.organizationId, p.organizationId),
        eq(schema.proposal.id, p.id),
        eq(schema.proposal.status, expectedStatus),
      ),
    )
    .returning({ id: schema.proposal.id })
  return closedRows.length > 0 ? 'closed' : 'skip'
}

/**
 * Evidence-based attribution for a stranded approve: did the PRIOR
 * attempt's work actually execute? Mirrors the executors' own recovered
 * branches (one law, two entry points — the tap and the reconcile).
 * Returns null when nothing attributable is found (inquiry always: a lead
 * status flip could be a staff member's own doing).
 */
async function detectRecoveredWork(
  p: RecoverableProposal,
  /** Whether a PRIOR APPROVE ATTEMPT is evidenced for this row (approved
   *  status, or the reopened-from-approval marker). Review attribution is
   *  a verbatim text match and needs this — without it, a hand-pasted
   *  draft would read as machine work (verification round 4). The
   *  social/campaign branches need no gate: their payload ids only exist
   *  once our own attempt started. */
  hadOwnAttempt = true,
): Promise<{ ledgerSummary: string; ledgerDetail?: Record<string, unknown> } | null> {
  const payload = (p.payload ?? {}) as Record<string, unknown>
  if (p.isDemo === 1) return null // demo approves simulate; nothing to recover
  if (p.capability === 'review_reply') {
    if (!hadOwnAttempt) return null
    const externalReviewId = str(payload.externalReviewId)
    if (!externalReviewId) return null
    const [review] = await db
      .select({
        replyComment: schema.platformReview.replyComment,
        reviewerName: schema.platformReview.reviewerName,
        starRating: schema.platformReview.starRating,
      })
      .from(schema.platformReview)
      .where(
        and(
          eq(schema.platformReview.organizationId, p.organizationId),
          eq(schema.platformReview.platform, 'googlebusiness'),
          eq(schema.platformReview.externalReviewId, externalReviewId),
        ),
      )
      .limit(1)
    if (!review?.replyComment || review.replyComment.trim() !== p.body.trim()) return null
    const who = review.reviewerName?.trim() || 'a patient'
    const stars = review.starRating ? `${review.starRating}-star ` : ''
    return {
      ledgerSummary: `Replied to ${who}’s ${stars}Google review — you approved it`,
      ledgerDetail: { externalReviewId },
    }
  }
  if (p.capability === 'social_post') {
    const priorPostId = str(payload.socialPostId)
    if (!priorPostId) return null
    const targets = await db
      .select({ status: schema.socialPostTarget.status })
      .from(schema.socialPostTarget)
      .where(
        and(
          eq(schema.socialPostTarget.organizationId, p.organizationId),
          eq(schema.socialPostTarget.socialPostId, priorPostId),
        ),
      )
    const landed = targets.filter((t) => t.status === 'published' || t.status === 'scheduled').length
    if (landed === 0) return null
    const snippet = p.body.length > 60 ? `${p.body.slice(0, 57)}…` : p.body
    return {
      ledgerSummary: `Published “${snippet}” to ${landed} ${landed === 1 ? 'channel' : 'channels'} — you approved it`,
      ledgerDetail: { publishedCount: landed, postId: priorPostId },
    }
  }
  if (p.capability === 'outreach_campaign') {
    const campaignId = typeof payload.campaignId === 'number' ? (payload.campaignId as number) : null
    const subject = str(payload.subject)
    if (campaignId == null || !subject) return null
    const [campaign] = await db
      .select({ status: schema.campaigns.status, sentAt: schema.campaigns.sentAt })
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.organizationId, p.organizationId)))
      .limit(1)
    // COMPLETION evidence only (verification round 4): 'active' is
    // sendCampaign's pre-send CLAIM flag — a stuck claim means nothing was
    // sent, and narrating it would credit a send that never happened. The
    // executor's own-row check repairs stuck claims at the next tap.
    if (!campaign || (campaign.status !== 'completed' && campaign.sentAt == null)) return null
    return {
      ledgerSummary: `Sent “${subject}” to your recall list — you approved it`,
      ledgerDetail: { campaignId },
    }
  }
  return null
}

export type DecideResult =
  | { ok: true; status: 'approved' | 'declined'; message?: string }
  /** expired: the card is DEAD (retired, or already decided by someone
   *  else) — the client clears it on this structured flag. Absent =
   *  reopened; the card stays live for a retry. */
  | { ok: false; error: string; expired?: boolean }

/** Decline — a human "no". The sourceKey stays claimed so the machine never
 *  re-asks about the same piece of work. Never ledgers (nothing happened). */
export async function declineProposal(
  organizationId: string,
  proposalId: string,
  userId: string,
): Promise<DecideResult> {
  const rows = await db
    .update(schema.proposal)
    .set({ status: 'declined', decidedAt: new Date(), decidedByUserId: userId, updatedAt: new Date() })
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.id, proposalId),
        eq(schema.proposal.status, 'open'),
      ),
    )
    .returning({ id: schema.proposal.id })
  if (rows.length === 0) return { ok: false, error: 'This one was already handled.', expired: true }
  return { ok: true, status: 'declined' }
}

/**
 * Approve — the big yes. Atomically claims the open proposal (a double-tap
 * or a second staff member racing loses cleanly), executes the work with the
 * (possibly staff-edited) body, then narrates ONCE in the ledger. If the
 * execution fails, the proposal REOPENS so the work is never silently lost.
 */
export async function approveProposal(
  organizationId: string,
  proposalId: string,
  userId: string,
  opts: { body?: string; subject?: string } = {},
): Promise<DecideResult> {
  const editedBody = opts.body?.trim()
  if (opts.body !== undefined && !editedBody) {
    return { ok: false, error: 'The message can’t be empty — edit it or decline instead.' }
  }
  if (editedBody && editedBody.length > PROPOSAL_BODY_MAX) {
    return { ok: false, error: `Keep it under ${PROPOSAL_BODY_MAX.toLocaleString()} characters.` }
  }
  // Subject edits (email-sending capabilities): the patient-facing subject
  // is part of the artifact the card shows — an edited one rides the
  // payload so the executor sends exactly what was approved (round-2 gap).
  const editedSubject = opts.subject?.trim()
  if (opts.subject !== undefined && !editedSubject) {
    return { ok: false, error: 'The subject can’t be empty.' }
  }
  if (editedSubject && editedSubject.length > 200) {
    return { ok: false, error: 'Keep the subject under 200 characters.' }
  }

  // The subject lives inside payload jsonb — merge it before the claim so
  // the executor (which reads the claimed row) sees the edit.
  if (editedSubject) {
    const [current] = await db
      .select({ payload: schema.proposal.payload })
      .from(schema.proposal)
      .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.id, proposalId)))
      .limit(1)
    if (current) {
      const payload = (current.payload ?? {}) as Record<string, unknown>
      await db
        .update(schema.proposal)
        .set({ payload: { ...payload, subject: editedSubject }, updatedAt: new Date() })
        .where(
          and(
            eq(schema.proposal.organizationId, organizationId),
            eq(schema.proposal.id, proposalId),
            eq(schema.proposal.status, 'open'),
          ),
        )
    }
  }

  // Atomic claim: open → approved. Losing the race = already handled.
  const now = new Date()
  const [claimed] = await db
    .update(schema.proposal)
    .set({
      status: 'approved',
      decidedAt: now,
      decidedByUserId: userId,
      ...(editedBody ? { body: editedBody } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.id, proposalId),
        eq(schema.proposal.status, 'open'),
      ),
    )
    .returning()
  // Losing the claim means the proposal is already decided — the card is
  // dead; the expired flag lets the client clear it (verification round:
  // the UI must act on this STRUCTURED signal, never regex the copy).
  if (!claimed) return { ok: false, error: 'This one was already handled.', expired: true }

  // The reopen-on-throw region covers ONLY the execution itself. Once the
  // executor reports success the work HAPPENED — the bookkeeping below must
  // never reopen the proposal, because a reopened-but-executed proposal
  // invites a second Approve and a duplicate send (round-1 Phase-2 audit).
  let exec: ExecResult
  try {
    exec = await executeProposal(claimed)
  } catch (e) {
    await reopen(claimed)
    // A raw exception message here is developer-speak ('Campaign missing
    // subject') on the most trust-critical card in the product — log it,
    // answer in the voice (round-3 audit). Executors that can fail in ways
    // worth explaining return ok:false with their own friendly text instead.
    console.error('[proposals] executor threw:', e)
    return { ok: false, error: 'Something went wrong on my side — nothing went out. Give it another try in a minute.' }
  }
  if (!exec.ok) {
    if (exec.expired) {
      if (exec.recovered) {
        // Narrate-EXACTLY-ONCE under recovery, NARRATION FIRST (verification
        // round 5 — this was the file's last stamp-before-narrate): a
        // stranded approve's work reached patients but no ledger entry
        // exists. Only a successful (or already-present) narration may
        // write the terminal expired+executedAt state; on a transient
        // narration failure the row stays 'approved' with executedAt NULL,
        // squarely inside the hourly reconcile's view, which re-attributes
        // and narrates — never a terminal unnarrated close.
        let narrated = false
        try {
          const { hasEntryForProposal } = await import('@/lib/services/action-ledger')
          if (await hasEntryForProposal(organizationId, proposalId)) {
            narrated = true
          } else {
            narrated = await recordAction({
              organizationId,
              capability: claimed.capability,
              patientId: claimed.patientId,
              summary: exec.recovered.ledgerSummary,
              detail: {
                proposalId: claimed.id,
                approvedByUserId: userId,
                recovered: true,
                ...exec.recovered.ledgerDetail,
              },
            })
          }
        } catch (e) {
          console.error('[proposals] recovery narration failed — the reconcile will retry:', e)
        }
        if (narrated) {
          await db
            .update(schema.proposal)
            .set({ status: 'expired', executedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.id, proposalId)))
        }
      } else {
        // The underlying work vanished (review already replied, inquiry
        // already handled) — retire the proposal instead of reopening it.
        await db
          .update(schema.proposal)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.id, proposalId)))
      }
      return { ok: false, error: exec.error, expired: true }
    }
    await reopen(claimed)
    return { ok: false, error: exec.error }
  }

  // Post-execution bookkeeping — best-effort by design (recordAction
  // swallows its own errors; the executedAt stamp gets the same posture).
  // NARRATE BEFORE STAMPING (verification round 3): a death between the
  // two statements must leave executedAt NULL so the reconcile can still
  // see the row — record-then-stamp is idempotent (hasEntryForProposal
  // guards the reconcile's narration), while stamp-then-record put the
  // one unnarrated window permanently outside the recovery machinery.
  // THE ONE ledger entry for this yes (see the boundary law up top).
  // Guarded (verification round 4): the sweep/reconcile recovery closer can
  // narrate this proposal in a race window — whoever narrates second is
  // suppressed, so one yes stays one entry. Guard-read failure falls back
  // to recording (favor narration over silence).
  let alreadyNarrated = false
  try {
    const { hasEntryForProposal } = await import('@/lib/services/action-ledger')
    alreadyNarrated = await hasEntryForProposal(organizationId, claimed.id)
  } catch {
    alreadyNarrated = false
  }
  if (!alreadyNarrated) {
    await recordAction({
      organizationId,
      capability: claimed.capability,
      patientId: claimed.patientId,
      summary: exec.ledgerSummary,
      detail: { proposalId: claimed.id, approvedByUserId: userId, ...exec.ledgerDetail },
    })
  }
  try {
    await db
      .update(schema.proposal)
      .set({ executedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.id, proposalId)))
  } catch (e) {
    console.error('[proposals] executedAt stamp failed (work already done):', e)
  }
  return { ok: true, status: 'approved', message: exec.ledgerSummary }
}

/** Reopen after a FAILED approve. Two laws learned across the audit ride
 *  here (verification round 4 — this was the reconcile-reopen's forgotten
 *  sibling): (1) stamp the approve-attempt marker so later attribution can
 *  tell our stranded work from a human's; (2) extend a passed/imminent
 *  expiry — "give it another try in a minute" is a lie when the reopened
 *  card is already invisible to the inbox and the next hourly tick expires
 *  it with the sourceKey burned. */
async function reopen(claimed: typeof schema.proposal.$inferSelect): Promise<void> {
  const now = new Date()
  const minExpiry = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  // RE-READ the payload — never write back the claim-time snapshot
  // (verification round 5): executors stamp campaignId/socialPostId into
  // the payload DURING execution, after the claim's .returning()
  // materialized `claimed`. Writing {...claimed.payload} back would erase
  // those stamps on every post-stamp failure — the retry would mint a
  // second campaign row, the stuck-claim repair could never fire, and
  // genuinely-sent work would be unattributable.
  const [current] = await db
    .select({ payload: schema.proposal.payload })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, claimed.organizationId), eq(schema.proposal.id, claimed.id)))
    .limit(1)
  const payload = ((current ? current.payload : claimed.payload) ?? {}) as Record<string, unknown>
  await db
    .update(schema.proposal)
    .set({
      status: 'open',
      decidedAt: null,
      decidedByUserId: null,
      payload: { ...payload, approveAttempted: true },
      ...(claimed.expiresAt && claimed.expiresAt > minExpiry ? {} : { expiresAt: minExpiry }),
      updatedAt: now,
    })
    .where(and(eq(schema.proposal.organizationId, claimed.organizationId), eq(schema.proposal.id, claimed.id)))
}

// ── Executors ─────────────────────────────────────────────────────────────────

type ExecResult =
  | { ok: true; ledgerSummary: string; ledgerDetail?: Record<string, unknown> }
  | {
      ok: false
      error: string
      expired?: boolean
      /** Set on an expired retire when the evidence says the PRIOR attempt's
       *  work actually went out (our reply is on the review, our campaign
       *  row is sent, our post has a published target) — the stranded-
       *  approve recovery loop (reconcile → re-approve → retire) must still
       *  satisfy the narrate-EXACTLY-ONCE law, so approveProposal writes
       *  this entry iff none exists for the proposal yet (verification
       *  round: without it, recovered work narrated ZERO times and the
       *  standup under-reported the week). */
      recovered?: { ledgerSummary: string; ledgerDetail?: Record<string, unknown> }
    }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

async function executeProposal(p: typeof schema.proposal.$inferSelect): Promise<ExecResult> {
  // Demo proposals SIMULATE: the inbox demoes the full approve flow without
  // networking (same demo-safe law as Zernio/PMS). The ledger entry is
  // written for shape + the resync cleanup sweep, and its summary doubles
  // as the approve toast — but NO surface reads it today (the standup is
  // the ledger's only reader and it narrates the PRIOR week; the demo
  // seeder backdates its own entries into that window). The summary
  // carries the demo hedge so the toast never claims real work went out
  // (verification round — the lead drawer's demo label is the standard).
  if (p.isDemo === 1) {
    return {
      ok: true,
      ledgerSummary: `${demoLedgerSummary(p)} · demo — nothing actually went out`,
      ledgerDetail: { simulated: true },
    }
  }
  const payload = (p.payload ?? {}) as Record<string, unknown>
  switch (p.capability) {
    case 'review_reply':
      return executeReviewReply(p, payload)
    case 'social_post':
      return executeSocialPost(p, payload)
    case 'inquiry_response':
      return executeInquiryResponse(p, payload)
    case 'outreach_campaign':
      return executeOutreachCampaign(p, payload)
    default:
      return { ok: false, error: 'I don’t know how to carry this one out yet.' }
  }
}

function demoLedgerSummary(p: typeof schema.proposal.$inferSelect): string {
  switch (p.capability) {
    case 'review_reply': return `Replied to a Google review — you approved it`
    case 'social_post': return `Published the post you approved`
    case 'inquiry_response': return `Answered a website inquiry — you approved it`
    case 'outreach_campaign': return `Sent the campaign you approved`
    default: return `Did the work you approved`
  }
}

async function executeReviewReply(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
): Promise<ExecResult> {
  const externalReviewId = str(payload.externalReviewId)
  if (!externalReviewId) return { ok: false, error: 'This proposal is missing its review reference.' }

  // Staleness: someone may have replied from /growth/reviews (or Google
  // directly, mirrored by the hourly sync) since this was filed.
  const [review] = await db
    .select({ replyComment: schema.platformReview.replyComment, reviewerName: schema.platformReview.reviewerName, starRating: schema.platformReview.starRating })
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, p.organizationId),
        eq(schema.platformReview.platform, 'googlebusiness'),
        eq(schema.platformReview.externalReviewId, externalReviewId),
      ),
    )
    .limit(1)
  if (!review) return { ok: false, error: 'That review is no longer available.', expired: true }
  if (review.replyComment) {
    // OUR OWN reply already on the review = the stranded-approve recovery
    // case — narrate the work that happened (once). Someone else's words =
    // handled at the counter; nothing of ours to narrate.
    const who = review.reviewerName?.trim() || 'a patient'
    const stars = review.starRating ? `${review.starRating}-star ` : ''
    if (review.replyComment.trim() === p.body.trim()) {
      return {
        ok: false,
        error: 'It turns out this reply already went out on the earlier approve — I recorded it. Nothing posted twice.',
        expired: true,
        recovered: {
          ledgerSummary: `Replied to ${who}’s ${stars}Google review — you approved it`,
          ledgerDetail: { externalReviewId },
        },
      }
    }
    return { ok: false, error: 'Someone already replied to this review — I tossed this draft.', expired: true }
  }

  const { replyToGoogleReview } = await import('@/lib/services/google-reviews')
  const r = await replyToGoogleReview(p.organizationId, externalReviewId, p.body)
  if (!r.ok) return { ok: false, error: r.error }
  const who = review.reviewerName?.trim() || 'a patient'
  const stars = review.starRating ? `${review.starRating}-star ` : ''
  return {
    ok: true,
    ledgerSummary: `Replied to ${who}’s ${stars}Google review — you approved it`,
    ledgerDetail: { externalReviewId },
  }
}

async function executeSocialPost(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
): Promise<ExecResult> {
  const accountIds = Array.isArray(payload.accountIds)
    ? (payload.accountIds as unknown[]).filter((v): v is string => typeof v === 'string' && !!v.trim())
    : []
  if (accountIds.length === 0) return { ok: false, error: 'This proposal is missing its channels.' }

  // OWN-WORK check FIRST — before any org-wide staleness read (verification
  // round 2: the org-wide check matched OUR OWN published target, whose
  // publishedAt is always after the proposal's createdAt, so the recovery
  // branch below was unreachable and stranded work narrated zero times).
  // ONE post history per proposal: a prior failed approve leaves a dead
  // 'failed' post row behind (createSocialPost persists parent + targets
  // BEFORE the network calls). Supersede it on retry — delete the fully-
  // failed row; if it has any non-failed target the work actually went out,
  // so retire the card (with the recovery narration) instead of
  // double-publishing (round-2 audit + verification rounds 1–2).
  const priorPostId = str(payload.socialPostId)
  if (priorPostId) {
    const priorTargets = await db
      .select({ status: schema.socialPostTarget.status })
      .from(schema.socialPostTarget)
      .where(
        and(
          eq(schema.socialPostTarget.organizationId, p.organizationId),
          eq(schema.socialPostTarget.socialPostId, priorPostId),
        ),
      )
    if (priorTargets.some((t) => t.status === 'published' || t.status === 'scheduled')) {
      // OUR OWN prior attempt's post landed — the stranded-approve recovery
      // case; narrate it (once) instead of letting real work vanish.
      const landed = priorTargets.filter((t) => t.status === 'published' || t.status === 'scheduled').length
      const snippet = p.body.length > 60 ? `${p.body.slice(0, 57)}…` : p.body
      return {
        ok: false,
        error: 'It turns out this post already went out on the earlier approve — I recorded it. Nothing posted twice.',
        expired: true,
        recovered: {
          ledgerSummary: `Published “${snippet}” to ${landed} ${landed === 1 ? 'channel' : 'channels'} — you approved it`,
          ledgerDetail: { accountIds, publishedCount: landed, postId: priorPostId },
        },
      }
    }
    await db
      .delete(schema.socialPost)
      .where(and(eq(schema.socialPost.organizationId, p.organizationId), eq(schema.socialPost.id, priorPostId)))
  }

  // Staleness at the tap (round-3 self-sweep — the campaign executor's
  // re-check, applied to its sibling): this card was filed on QUIET
  // channels. If anything published since it was drafted, or a post sits in
  // the queue, the premise is false — retire instead of stacking a second
  // post on channels the clinic just fed. Runs AFTER the own-work check, so
  // any match here is genuinely the clinic's own activity (our prior
  // attempt's live targets returned above; its dead row was just deleted).
  const [activity] = await db
    .select({ id: schema.socialPostTarget.id })
    .from(schema.socialPostTarget)
    .where(
      and(
        eq(schema.socialPostTarget.organizationId, p.organizationId),
        or(
          eq(schema.socialPostTarget.status, 'scheduled'),
          and(
            eq(schema.socialPostTarget.status, 'published'),
            gt(schema.socialPostTarget.publishedAt, p.createdAt),
          ),
        ),
      ),
    )
    .limit(1)
  if (activity) {
    return {
      ok: false,
      error: 'A post went out (or is queued) since I drafted this — I retired the card so your channels don’t double up.',
      expired: true,
    }
  }

  const { createSocialPost } = await import('@/lib/services/social-posts')
  const r = await createSocialPost(
    p.organizationId,
    {
      postType: 'standard',
      summary: p.body,
      accountIds,
    },
    {
      // Stamp the link the MOMENT the rows persist, before any network
      // publish (verification round 3): stamping after the call left a
      // death-mid-publish with real published targets and no way to
      // attribute them — narrate-once became narrate-zero, and the retire
      // copy blamed the clinic's own activity. A throw here aborts before
      // anything publishes.
      onPersisted: async (postId) => {
        await db
          .update(schema.proposal)
          .set({ payload: { ...payload, socialPostId: postId }, updatedAt: new Date() })
          .where(and(eq(schema.proposal.organizationId, p.organizationId), eq(schema.proposal.id, p.id)))
      },
    },
  )
  if (!r.ok) return { ok: false, error: r.error ?? 'The post didn’t go out — nothing was published.' }

  // Narrate what ACTUALLY published, never the requested channel list —
  // createSocialPost reports ok on partial success (ok ⇒ ≥1 non-failed
  // target) and silently drops channels that disconnected since the
  // proposal was filed (round-1 audit: the ledger must not over-claim).
  // Count the per-target rows; if the read fails, use the honest-vague form.
  let publishedCount: number | null = null
  try {
    if (r.postId) {
      const targets = await db
        .select({ status: schema.socialPostTarget.status })
        .from(schema.socialPostTarget)
        .where(
          and(
            eq(schema.socialPostTarget.organizationId, p.organizationId),
            eq(schema.socialPostTarget.socialPostId, r.postId),
          ),
        )
      publishedCount = targets.filter((t) => t.status === 'published' || t.status === 'scheduled').length
    }
  } catch {
    publishedCount = null
  }
  const snippet = p.body.length > 60 ? `${p.body.slice(0, 57)}…` : p.body
  const where =
    publishedCount == null
      ? 'your channels'
      : `${publishedCount} ${publishedCount === 1 ? 'channel' : 'channels'}`
  const partial =
    publishedCount != null && publishedCount < accountIds.length
      ? ` (${accountIds.length - publishedCount} ${accountIds.length - publishedCount === 1 ? 'channel' : 'channels'} didn’t take it)`
      : ''
  return {
    ok: true,
    ledgerSummary: `Published “${snippet}” to ${where}${partial} — you approved it`,
    ledgerDetail: { accountIds, publishedCount, postId: r.postId ?? null },
  }
}

async function executeInquiryResponse(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
): Promise<ExecResult> {
  const leadId = str(payload.leadId)
  const subject = str(payload.subject) ?? 'About your question'
  if (!leadId) return { ok: false, error: 'This proposal is missing its inquiry reference.' }

  const [lead] = await db
    .select({ id: schema.lead.id, name: schema.lead.name, email: schema.lead.email, status: schema.lead.status })
    .from(schema.lead)
    .where(and(eq(schema.lead.organizationId, p.organizationId), eq(schema.lead.id, leadId)))
    .limit(1)
  if (!lead) return { ok: false, error: 'That inquiry is no longer available.', expired: true }
  if (lead.status !== 'new') {
    return { ok: false, error: 'Someone already reached out to them — I tossed this draft.', expired: true }
  }
  if (!lead.email) return { ok: false, error: 'This inquiry has no email address to write to.', expired: true }

  const [{ getClinicSenderIdentity }, { deliver, authEmailShell }, { markLeadContacted }, { resolveClinicBookingUrl }] =
    await Promise.all([
      import('@/lib/services/clinic-sender'),
      import('@/lib/email'),
      import('@/lib/services/leads'),
      import('@/lib/services/marketing-send'),
    ])
  const sender = await getClinicSenderIdentity(p.organizationId)
  // The draft invites them to book — give the invitation somewhere to go
  // (verification round: this was the ONE patient-facing send in the
  // product without the booking link, aimed at the highest-intent person
  // in the funnel). Best-effort: no resolvable site → button-less.
  const bookingUrl = await resolveClinicBookingUrl(p.organizationId).catch(() => null)
  // The clinic's sign-off — the shell's own footer names the platform, and
  // the drafting prompt promises "the email template signs for the clinic",
  // so the template must actually do it (verification round 1). CONDITIONAL
  // (verification round 2): when staff already signed the draft themselves
  // (a last line starting with an em-dash — '— Dr. Reyes'), appending a
  // second sign-off would ship an email the card never showed; their words
  // win. The card's read-mode line discloses the appended sign-off.
  const lastLine = p.body.trim().split('\n').filter((l) => l.trim()).pop() ?? ''
  const alreadySigned = lastLine.trim().startsWith('—') || lastLine.trim().startsWith('-')
  const paragraphs =
    p.body
      .split(/\n{2,}/)
      .map((para) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333333;">${escapeHtml(para.trim()).replace(/\n/g, '<br/>')}</p>`)
      .join('') +
    (alreadySigned
      ? ''
      : `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333333;">— ${escapeHtml(sender.name)}</p>`)
  // deliver() maps transport failures to reader-safe messages
  // (friendlyEmailError) before throwing — catch here and return them as the
  // executor's own error so the approve wrapper reopens WITH that useful
  // text instead of genericizing it (round-3 audit: the wrapper's catch is
  // for unexpected throws only).
  try {
    await deliver({
      to: lead.email,
      subject,
      html: authEmailShell({
        heading: subject,
        introHtml: paragraphs,
        ...(bookingUrl ? { buttonUrl: bookingUrl, buttonLabel: 'Book a time' } : {}),
        footnoteHtml: `You asked us a question through our website — this is our reply. Call or write back any time.`,
      }),
      from: sender.from,
      replyTo: sender.replyTo,
      ...(sender.gmail ? { gmail: sender.gmail } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : ''
    return { ok: false, error: msg || 'The email didn’t go out — nothing was sent. Try again in a minute.' }
  }
  // The email is OUT — from here on, best-effort only. If the status flip
  // failed and this threw, the approve wrapper would reopen the proposal and
  // a second Approve would email the same person twice (round-1 audit).
  try {
    await markLeadContacted(p.organizationId, leadId)
  } catch (e) {
    console.warn('[proposals] markLeadContacted failed after the reply was sent:', e)
  }
  const first = lead.name.trim().split(/\s+/)[0] || 'them'
  return {
    ok: true,
    ledgerSummary: `Answered ${first}’s website inquiry by email — you approved it`,
    ledgerDetail: { leadId },
  }
}

async function executeOutreachCampaign(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
): Promise<ExecResult> {
  const audienceId = typeof payload.audienceId === 'number' ? payload.audienceId : null
  const subject = str(payload.subject)
  const name = str(payload.name) ?? subject ?? 'Outreach campaign'
  if (!audienceId || !subject) return { ok: false, error: 'This proposal is missing its audience or subject.' }

  const [{ createMarketingCampaign }, { sendCampaign }] = await Promise.all([
    import('@/lib/services/marketing-campaigns'),
    import('@/lib/services/marketing-send'),
  ])

  // ONE campaign row per proposal, ever: the id is stamped into the payload
  // BEFORE sending, so a failed approve that reopens never mints a second
  // campaign on retry — and a retry after a post-send failure runs into
  // sendCampaign's own duplicate-send claim instead of re-blasting the
  // audience through a fresh row (round-1 Phase-2 audit).
  // OWN-ROW check FIRST — before the org-wide staleness read (verification
  // round 2: getRecallStats.recentSends INCLUDES our own completed campaign,
  // so the staleness retire shadowed the recovery narration below and
  // stranded work narrated zero times).
  let campaignId = typeof payload.campaignId === 'number' ? (payload.campaignId as number) : null
  if (campaignId != null) {
    // REUSED row (a prior approve failed and reopened): sync the CURRENT
    // proposal body + subject onto it before sending — staff routinely edit
    // the copy between attempts, and "the edited text is what executes" is
    // the schema's contract (round-2 audit). Round-3 refinements: the sync
    // only touches rows sendCampaign could still send (draft/scheduled/
    // paused) — an 'active'/'completed' row already went out and its record
    // must never be rewritten to copy nobody received; and a row STAFF
    // DELETED (a stray draft from a failed approve looks like clutter)
    // un-stamps the id so the retry mints fresh instead of failing forever.
    const [existing] = await db
      .select({
        id: schema.campaigns.id,
        status: schema.campaigns.status,
        sentAt: schema.campaigns.sentAt,
        updatedAt: schema.campaigns.updatedAt,
      })
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.organizationId, p.organizationId)))
      .limit(1)
    let syncCopy = false
    if (!existing) {
      campaignId = null
    } else if (existing.status === 'completed' || existing.sentAt != null) {
      // COMPLETION evidence — sentAt/'completed' are written only by
      // sendCampaign's post-send block, never by its claim (verification
      // round 4: attributing from the 'active' CLAIM flag narrated a send
      // that a post-claim pre-send throw never made). Recovery-narrate the
      // work that really reached patients.
      return {
        ok: false,
        error: 'It turns out this campaign already went out on the earlier approve — I recorded it. Nobody was emailed twice.',
        expired: true,
        recovered: {
          ledgerSummary: `Sent “${subject}” to your recall list — you approved it`,
          ledgerDetail: { campaignId },
        },
      }
    } else if (existing.status === 'active') {
      // 'active' with NO completion evidence: either a claim left stuck by
      // a pre-send throw/death (nothing sent — the row would refuse every
      // future send and the month's recall would be silently lost), or a
      // concurrent send still running. Age decides: no legitimate send is
      // still mid-flight after 15 minutes.
      const staleClaim = !existing.updatedAt || existing.updatedAt < new Date(Date.now() - 15 * 60 * 1000)
      if (staleClaim) {
        await db
          .update(schema.campaigns)
          .set({ status: 'draft', updatedAt: new Date() })
          .where(
            and(
              eq(schema.campaigns.id, campaignId),
              eq(schema.campaigns.organizationId, p.organizationId),
              eq(schema.campaigns.status, 'active'),
            ),
          )
        syncCopy = true // repaired — proceed like a normal draft reuse
      } else {
        return {
          ok: false,
          error: 'This send looks like it’s still running from a moment ago — nothing extra went out. Try again in a few minutes.',
        }
      }
    } else if (existing.status === 'draft' || existing.status === 'scheduled' || existing.status === 'paused') {
      syncCopy = true
    }
    if (campaignId != null && syncCopy) {
      // REUSED row: sync the CURRENT proposal body + subject before sending
      // — staff routinely edit the copy between attempts, and "the edited
      // text is what executes" is the schema's contract (round-2 audit).
      // Never runs against a row with completion evidence (above).
      await db
        .update(schema.campaigns)
        .set({ subject, bodyHtml: textToCampaignHtml(p.body), updatedAt: new Date() })
        .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.organizationId, p.organizationId)))
    }
  }

  // Staleness (round-3 audit — the same at-the-tap re-check the review and
  // inquiry executors do): this card was filed on a QUIET recall engine. If
  // the clinic has since run a campaign of its own (or scheduled one), the
  // premise printed on the card is false and approving it would blast the
  // same recall patients twice — retire it instead. Runs AFTER the own-row
  // check, so a recentSends match here is genuinely the clinic's own
  // sending, never our stranded prior attempt. Best-effort: an unreadable
  // snapshot never blocks a send.
  try {
    const { getRecallStats } = await import('@/lib/services/recall-stats')
    const stats = await getRecallStats(p.organizationId)
    if (stats.recentSends.length > 0 || stats.upcomingSends.length > 0) {
      return {
        ok: false,
        error: 'A campaign already went out (or is scheduled) since I drafted this — I retired this card so nobody gets emailed twice.',
        expired: true,
      }
    }
  } catch {
    // fall through — the frequency cap still guards the send itself
  }

  if (campaignId == null) {
    const campaign = await createMarketingCampaign(
      p.organizationId,
      {
        name,
        subject,
        bodyHtml: textToCampaignHtml(p.body),
        audienceId,
        sendChannel: 'resend',
        recipientSource: 'patients',
      },
      p.decidedByUserId ?? 'machine',
    )
    campaignId = campaign.id
    await db
      .update(schema.proposal)
      .set({ payload: { ...payload, campaignId }, updatedAt: new Date() })
      .where(and(eq(schema.proposal.organizationId, p.organizationId), eq(schema.proposal.id, p.id)))
  }

  // The approver's id keeps sendCampaign's own campaign_send ledger writer
  // silent — this yes narrates once, here, as outreach_campaign.
  const r = await sendCampaign({
    organizationId: p.organizationId,
    campaignId,
    initiatedByUserId: p.decidedByUserId ?? undefined,
  })
  if (r.skipped === 'already_sending') {
    // Our own-row check saw a sendable status moments ago, so this is a
    // LIVE race: a concurrent approve won the claim and is sending right
    // now. Hold the card (no retire, no narration — the claim flag is not
    // completion evidence, verification round 4); once that send finishes,
    // the next tap or hourly pass sees sentAt and recovery-narrates.
    return {
      ok: false,
      error: 'Another approve looks like it’s sending this right now — nothing extra went out. Check back in a minute.',
    }
  }
  if (r.skipped) return { ok: false, error: r.error ?? 'The send was refused before anyone was emailed.' }
  // ZERO people reached is not a success — never ledger "Sent … to 0
  // patients" (round-1 audit). The campaign row stays/returns to 'draft'
  // (marketing-send resets it), so a later approve can retry cleanly.
  if (r.sent === 0) {
    return {
      ok: false,
      error:
        r.attempted === 0
          ? 'Nobody could receive it right now — everyone due was emailed recently or has opted out. I’ll hold onto it.'
          : 'The send didn’t go through — nothing reached anyone, so I’ll hold onto it and you can try again.',
    }
  }
  return {
    ok: true,
    ledgerSummary: `Sent “${subject}” to ${r.sent} ${r.sent === 1 ? 'patient' : 'patients'} — you approved it`,
    ledgerDetail: { campaignId, sent: r.sent, suppressed: r.suppressed ?? 0 },
  }
}

/**
 * The approved inquiry reply, for the lead drawer's "What we sent" block
 * (round-3 audit): the inquiry executor is the one whose artifact lands on
 * no other surface — review replies live on the review, posts on
 * /growth/social, campaigns on their campaign row — so the proposal row
 * itself is the record. Keyed by the executor's own sourceKey; approved
 * rows only (a decline/expiry sent nothing).
 */
export async function getSentInquiryReply(
  organizationId: string,
  leadId: string,
): Promise<{ subject: string | null; body: string; sentAt: Date | null; simulated: boolean } | null> {
  const [row] = await db
    .select({
      body: schema.proposal.body,
      payload: schema.proposal.payload,
      executedAt: schema.proposal.executedAt,
      decidedAt: schema.proposal.decidedAt,
      isDemo: schema.proposal.isDemo,
    })
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.sourceKey, `inquiry_response:${leadId}`),
        eq(schema.proposal.status, 'approved'),
      ),
    )
    .limit(1)
  if (!row) return null
  const payload = (row.payload ?? {}) as Record<string, unknown>
  return {
    subject: typeof payload.subject === 'string' ? payload.subject : null,
    body: row.body,
    sentAt: row.executedAt ?? row.decidedAt,
    simulated: row.isDemo === 1,
  }
}

/** Plain text → simple campaign HTML. Supports the {{firstName}} and
 *  {{bookingUrl}} merge tokens the send path substitutes per recipient; adds
 *  a booking button when the draft didn't place the link itself. */
export function textToCampaignHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${escapeHtml(para.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('')
  const button = text.includes('{{bookingUrl}}')
    ? ''
    : `<p style="margin:18px 0 0;"><a href="{{bookingUrl}}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:bold;">Book a time that works</a></p>`
  return paragraphs + button
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
