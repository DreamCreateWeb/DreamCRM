import 'server-only'
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
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
 * never ledger (nothing happened).
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

/** Open, unexpired proposals, newest first — the Approval Inbox's list. */
export async function listOpenProposals(organizationId: string, limit = 8): Promise<ProposalView[]> {
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
    .orderBy(desc(schema.proposal.createdAt))
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

export type DecideResult =
  | { ok: true; status: 'approved' | 'declined'; message?: string }
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
  if (rows.length === 0) return { ok: false, error: 'This one was already handled.' }
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
  opts: { body?: string } = {},
): Promise<DecideResult> {
  const editedBody = opts.body?.trim()
  if (opts.body !== undefined && !editedBody) {
    return { ok: false, error: 'The message can’t be empty — edit it or decline instead.' }
  }
  if (editedBody && editedBody.length > PROPOSAL_BODY_MAX) {
    return { ok: false, error: `Keep it under ${PROPOSAL_BODY_MAX.toLocaleString()} characters.` }
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
  if (!claimed) return { ok: false, error: 'This one was already handled.' }

  // The reopen-on-throw region covers ONLY the execution itself. Once the
  // executor reports success the work HAPPENED — the bookkeeping below must
  // never reopen the proposal, because a reopened-but-executed proposal
  // invites a second Approve and a duplicate send (round-1 Phase-2 audit).
  let exec: ExecResult
  try {
    exec = await executeProposal(claimed)
  } catch (e) {
    await reopen(organizationId, proposalId)
    return { ok: false, error: (e as Error).message || 'Something went wrong — nothing was sent.' }
  }
  if (!exec.ok) {
    if (exec.expired) {
      // The underlying work vanished (review already replied, inquiry
      // already handled) — retire the proposal instead of reopening it.
      await db
        .update(schema.proposal)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.id, proposalId)))
      return { ok: false, error: exec.error, expired: true }
    }
    await reopen(organizationId, proposalId)
    return { ok: false, error: exec.error }
  }

  // Post-execution bookkeeping — best-effort by design (recordAction already
  // swallows its own errors; the executedAt stamp gets the same posture).
  try {
    await db
      .update(schema.proposal)
      .set({ executedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.id, proposalId)))
  } catch (e) {
    console.error('[proposals] executedAt stamp failed (work already done):', e)
  }

  // THE ONE ledger entry for this yes (see the boundary law up top).
  await recordAction({
    organizationId,
    capability: claimed.capability,
    patientId: claimed.patientId,
    summary: exec.ledgerSummary,
    detail: { proposalId: claimed.id, approvedByUserId: userId, ...exec.ledgerDetail },
  })
  return { ok: true, status: 'approved', message: exec.ledgerSummary }
}

async function reopen(organizationId: string, proposalId: string): Promise<void> {
  await db
    .update(schema.proposal)
    .set({ status: 'open', decidedAt: null, decidedByUserId: null, updatedAt: new Date() })
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.id, proposalId)))
}

// ── Executors ─────────────────────────────────────────────────────────────────

type ExecResult =
  | { ok: true; ledgerSummary: string; ledgerDetail?: Record<string, unknown> }
  | { ok: false; error: string; expired?: boolean }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

async function executeProposal(p: typeof schema.proposal.$inferSelect): Promise<ExecResult> {
  // Demo proposals SIMULATE: the inbox demoes the full approve flow without
  // networking (same demo-safe law as Zernio/PMS). The ledger entry still
  // writes, so the demo standup tells the story too.
  if (p.isDemo === 1) {
    return { ok: true, ledgerSummary: demoLedgerSummary(p), ledgerDetail: { simulated: true } }
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

  const { createSocialPost } = await import('@/lib/services/social-posts')
  const r = await createSocialPost(p.organizationId, {
    postType: 'standard',
    summary: p.body,
    accountIds,
  })
  if (!r.ok) return { ok: false, error: r.error ?? 'The post didn’t go out — nothing was published.' }

  // Narrate what ACTUALLY published, never the requested channel list —
  // createSocialPost reports ok on partial success and silently drops
  // channels that disconnected since the proposal was filed (round-1
  // Phase-2 audit: the ledger must not over-claim). Count the per-target
  // rows; if the count read fails, fall back to the honest-vague form.
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
  if (publishedCount === 0) {
    return { ok: false, error: 'None of the channels accepted the post — nothing was published.' }
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

  const [{ getClinicSenderIdentity }, { deliver, authEmailShell }, { markLeadContacted }] = await Promise.all([
    import('@/lib/services/clinic-sender'),
    import('@/lib/email'),
    import('@/lib/services/leads'),
  ])
  const sender = await getClinicSenderIdentity(p.organizationId)
  const paragraphs = p.body
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333333;">${escapeHtml(para.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('')
  // deliver() throws on transport failure — the approve wrapper catches and
  // reopens the proposal, so a failed send is never silently lost.
  await deliver({
    to: lead.email,
    subject,
    html: authEmailShell({
      heading: subject,
      introHtml: paragraphs,
      footnoteHtml: `You asked us a question through our website — this is our reply. Call or write back any time.`,
    }),
    from: sender.from,
    replyTo: sender.replyTo,
    ...(sender.gmail ? { gmail: sender.gmail } : {}),
  })
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
  let campaignId = typeof payload.campaignId === 'number' ? (payload.campaignId as number) : null
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
    // A reused campaign that already went out (a prior approve's send
    // succeeded but its bookkeeping failed) — never re-blast; retire the card.
    return { ok: false, error: 'It looks like this campaign already went out — I retired this card.', expired: true }
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
