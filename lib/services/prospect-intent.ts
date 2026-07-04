import 'server-only'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { bumpProspectingCounter, counterMonth, getProspectingConfig } from './prospecting'
import { PRODUCT_KNOWLEDGE_SHORT } from '@/lib/prospect-product-knowledge'

/**
 * Intent detection — the moment cold outreach turns into a phone call.
 *
 * Replies: inbound mail on the OUTREACH Gmail account (the connected inbox
 * cold emails are sent from / reply to) is matched by sender email → any
 * prospect with a live-or-recent enrollment, then AI-classified:
 *   interested / question  → stop the sequence, prospect → call_list with an
 *                            AI summary + talking points for the call
 *   not_interested / unsub → stop + permanent suppression
 *   out_of_office          → pause a week, then auto-resume
 *   wrong_person           → stop, disqualify (bad email ≠ bad prospect)
 *
 * Engagement: clicks promote to 'engaged' immediately; 3+ opens promote
 * too. Engagement never overrides a reply-based state (call_list,
 * suppressed, …) — reply signal always wins.
 *
 * Everything is best-effort and idempotent: each inbound message is acted
 * on at most once (outreach_event.meta.emailMessageId dedupe), and the
 * engagement rollup only ever promotes contacted → engaged.
 */

export const REPLY_CLASSIFICATIONS = [
  'interested',
  'question',
  'not_interested',
  'unsubscribe',
  'out_of_office',
  'wrong_person',
] as const
export type ReplyClassification = (typeof REPLY_CLASSIFICATIONS)[number]

// Keep the classification enum strict (it drives behavior) but the summary +
// talking points TOLERANT — a 420-char summary must never reject the parse and
// silently drop an interested reply off the call list. Clamped on success.
const classificationSchema = z.object({
  classification: z.enum(REPLY_CLASSIFICATIONS),
  summary: z.string().default(''),
  talkingPoints: z.array(z.string()).default([]),
})

async function classifyReply(input: {
  prospectName: string
  subject: string | null
  body: string
}): Promise<z.infer<typeof classificationSchema> | null> {
  if (!aiConfigured()) return null
  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 600,
      system:
        "You triage replies to cold outreach emails sent to dental practices by Dream Create (dental websites + CRM). Classify the reply: 'interested' (any buying signal, wants info/call/demo/pricing), 'question' (engaged but asking something first), 'not_interested' (polite or hard no), 'unsubscribe' (demands no further contact), 'out_of_office' (auto-reply, vacation), 'wrong_person' (bad address, not the decision maker, practice sold). summary: 1-2 sentences of what they actually said. talkingPoints: up to 4 short prompts for the sales call (only for interested/question; empty otherwise). Never invent facts.",
      messages: [
        {
          role: 'user',
          content: `Practice: ${input.prospectName}\nSubject: ${input.subject ?? '(none)'}\n\nReply:\n${input.body.slice(0, 4000)}`,
        },
      ],
      toolName: 'record_reply_triage',
      toolDescription: 'Record the classification of this outreach reply.',
      inputSchema: {
        type: 'object',
        properties: {
          classification: { type: 'string', enum: [...REPLY_CLASSIFICATIONS] },
          summary: { type: 'string' },
          talkingPoints: { type: 'array', items: { type: 'string' } },
        },
        required: ['classification', 'summary', 'talkingPoints'],
      },
    })
    const parsed = classificationSchema.safeParse(raw)
    if (!parsed.success) return null
    return {
      classification: parsed.data.classification,
      summary: parsed.data.summary.slice(0, 400),
      talkingPoints: parsed.data.talkingPoints.map((s) => s.slice(0, 160)).filter(Boolean).slice(0, 5),
    }
  } catch {
    return null
  }
}

function formatPhone(phone: string | null | undefined): string | null {
  if (!phone || phone.length < 10) return null
  return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
}

/**
 * Alert platform owner/admins that a prospect raised their hand — bell +
 * forced email — and fire-and-forget pre-warm the demo brief so the prep
 * page loads instantly. All best-effort: a failed alert never blocks the
 * classification write.
 */
async function alertCallList(
  prospect: ClassifiableProspect,
  classification: 'interested' | 'question' | 'demo_request',
  summary: string,
): Promise<void> {
  try {
    const { getPlatformOrgId } = await import('./gsc')
    const { notifyOrgMembers } = await import('./notifications')
    const orgId = await getPlatformOrgId()
    if (orgId) {
      const name = prospect.name ?? 'A prospect'
      const title =
        classification === 'question'
          ? `✉️ ${name} replied with a question`
          : classification === 'demo_request'
            ? `🔥 ${name} requested a demo`
            : `🔥 ${name} replied — they're interested`
      const phone = formatPhone(prospect.phone)
      await notifyOrgMembers(
        orgId,
        {
          bucket: 'comments',
          type: 'prospect_call_list',
          title,
          body: `${summary}${phone ? `\n\nPhone: ${phone}` : ''}`,
          linkPath: `/platform/prospecting/call-list?highlight=${prospect.id}`,
          linkLabel: 'Open the call list →',
          forceEmail: true,
        },
        { roles: ['owner', 'admin'] },
      )
    }
  } catch (err) {
    console.warn('[prospect-intent] call-list alert failed', err)
  }
  // Pre-warm the demo brief (cached on the prospect row) — non-blocking.
  import('./demo-brief')
    .then((m) => m.generateDemoBrief(prospect.id))
    .catch(() => {})
}

// Tolerant: accept any non-trivial draft and clamp the length rather than
// reject a good-but-slightly-long reply into no draft at all.
const replyDraftSchema = z.object({ draft: z.string() })

/**
 * Draft a reply to a prospect's question — warm, factual, sign-off-free
 * (the owner sends it from his own inbox). Budget-gated; failure → null,
 * never blocks the classification.
 */
async function draftReply(
  prospect: ClassifiableProspect,
  summary: string,
  replyBody: string,
): Promise<string | null> {
  if (!aiConfigured()) return null
  const verdict = (prospect.aiVerdict ?? null) as { weaknesses?: string[] } | null
  const gaps = verdict?.weaknesses?.slice(0, 4) ?? []
  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 500,
      system:
        PRODUCT_KNOWLEDGE_SHORT +
        "\n\nYou draft a short reply from Dustin at Dream Create to a dental practice that answered his cold email with a question. Answer their question directly and honestly using the product knowledge above plus the provided facts. Warm, plain, conversational — no hype, no exclamation marks, no pressure. Under 120 words. End by offering a quick call. A greeting line is fine; do NOT include a sign-off (added later). Never fabricate pricing, clients, or capabilities beyond the product knowledge — if they ask about something it doesn't do (e.g. SMS texting), say so honestly.",
      messages: [
        {
          role: 'user',
          content: `Practice: ${prospect.name ?? 'the practice'}\nTheir reply: ${replyBody.slice(0, 4000)}\nWhat they're asking (summary): ${summary}\nVerified gaps we can speak to: ${gaps.join('; ') || 'none recorded'}\nTheir Google review count: ${prospect.reviewCount ?? 'unknown'}`,
        },
      ],
      toolName: 'write_reply_draft',
      toolDescription: 'Emit the drafted reply body.',
      inputSchema: {
        type: 'object',
        properties: { draft: { type: 'string' } },
        required: ['draft'],
      },
    })
    const parsed = replyDraftSchema.safeParse(raw)
    if (!parsed.success) return null
    const draft = parsed.data.draft.trim()
    if (draft.length < 10) return null // too short to be a usable reply
    await bumpProspectingCounter(counterMonth(), 'ai_reply_draft')
    return draft.slice(0, 1200)
  } catch {
    return null
  }
}

async function stopLiveEnrollment(prospectId: string, status: string, reason: string) {
  await db
    .update(schema.outreachEnrollment)
    .set({ status, stoppedAt: new Date(), stopReason: reason })
    .where(
      and(
        eq(schema.outreachEnrollment.prospectId, prospectId),
        inArray(schema.outreachEnrollment.status, ['active', 'paused_ooo']),
      ),
    )
}

interface ClassifiableProspect {
  id: string
  name?: string
  email: string | null
  phone?: string | null
  aiVerdict?: unknown
  reviewCount?: number | null
}

async function applyClassification(
  prospect: ClassifiableProspect,
  verdict: z.infer<typeof classificationSchema>,
  replyBody = '',
): Promise<void> {
  const now = new Date()
  switch (verdict.classification) {
    case 'interested':
    case 'question': {
      await stopLiveEnrollment(prospect.id, 'stopped_reply', verdict.classification)
      // Question replies get an AI-drafted response waiting on the call card
      // (the owner sends it from his own inbox — we never auto-send).
      const aiDraft =
        verdict.classification === 'question'
          ? await draftReply(prospect, verdict.summary, replyBody)
          : null
      // When self-booking is on, weave the prospect's own booking link into
      // the draft so a single reply the owner sends moves them straight to a
      // booked demo (we still never auto-send — the owner sends it).
      let bookingUrl: string | null = null
      const bookingConfig = await getProspectingConfig().catch(() => null)
      if (bookingConfig?.booking.enabled) {
        const { getOrCreateBookingLink } = await import('./prospect-meetings')
        const link = await getOrCreateBookingLink(prospect.id).catch(() => null)
        bookingUrl = link?.url ?? null
      }
      const bookingLine = bookingUrl ? `Prefer to just grab a time? Pick one here: ${bookingUrl}` : null
      const replyDraft = aiDraft
        ? bookingLine
          ? `${aiDraft}\n\n${bookingLine}`
          : aiDraft
        : bookingLine // interested replies get a ready one-liner with the link
      await db
        .update(schema.prospect)
        .set({
          status: 'call_list',
          intentSignal: verdict.classification === 'interested' ? 'reply_interested' : 'reply_question',
          intentAt: now,
          intentSummary: verdict.summary,
          talkingPoints: verdict.talkingPoints,
          ...(replyDraft ? { replyDraft } : {}),
          updatedAt: now,
        })
        .where(eq(schema.prospect.id, prospect.id))
      // Alert the owner (bell + forced email) + pre-warm the demo brief so the
      // prep page is instant when they click through. Both best-effort.
      await alertCallList(prospect, verdict.classification, verdict.summary)
      break
    }
    case 'not_interested':
    case 'unsubscribe': {
      await stopLiveEnrollment(
        prospect.id,
        verdict.classification === 'unsubscribe' ? 'stopped_unsub' : 'stopped_reply',
        verdict.classification,
      )
      if (prospect.email) {
        await db
          .insert(schema.prospectSuppression)
          .values({
            id: newId('psup'),
            email: prospect.email.toLowerCase(),
            domain: prospect.email.split('@')[1]?.toLowerCase() ?? null,
            reason: verdict.classification === 'unsubscribe' ? 'unsub' : 'reply_not_interested',
            prospectId: prospect.id,
          })
          .onConflictDoNothing()
      }
      await db
        .update(schema.prospect)
        .set({
          status: verdict.classification === 'unsubscribe' ? 'suppressed' : 'not_interested',
          suppressedReason: verdict.classification,
          suppressedAt: now,
          intentSummary: verdict.summary,
          updatedAt: now,
        })
        .where(eq(schema.prospect.id, prospect.id))
      break
    }
    case 'out_of_office': {
      // Pause a week; the sweep's resume pass reactivates after ooo lapses.
      await db
        .update(schema.outreachEnrollment)
        .set({
          status: 'paused_ooo',
          nextSendAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        })
        .where(
          and(
            eq(schema.outreachEnrollment.prospectId, prospect.id),
            eq(schema.outreachEnrollment.status, 'active'),
          ),
        )
      break
    }
    case 'wrong_person': {
      await stopLiveEnrollment(prospect.id, 'stopped_reply', 'wrong_person')
      await db
        .update(schema.prospect)
        .set({ status: 'disqualified', intentSummary: verdict.summary, updatedAt: now })
        .where(eq(schema.prospect.id, prospect.id))
      break
    }
  }
}

export interface IntentSweepResult {
  matched: number
  classified: number
  callList: number
  suppressed: number
  resumed: number
  skipped?: string
}

/**
 * Match recent inbound mail on the outreach Gmail account to prospects and
 * act on each reply once. Safe to call from both the mailbox push hook and
 * the outreach cron (idempotent per message).
 */
export async function processInboundForOutreach(opts?: {
  sinceHours?: number
}): Promise<IntentSweepResult> {
  const out: IntentSweepResult = { matched: 0, classified: 0, callList: 0, suppressed: 0, resumed: 0 }
  const accountId = process.env.OUTREACH_GMAIL_ACCOUNT_ID?.trim()
  if (!accountId) return { ...out, skipped: 'no_outreach_account' }

  // Resume lapsed OOO pauses regardless of new mail.
  const resumed = await db
    .update(schema.outreachEnrollment)
    .set({ status: 'active' })
    .where(
      and(
        eq(schema.outreachEnrollment.status, 'paused_ooo'),
        sql`${schema.outreachEnrollment.nextSendAt} <= now()`,
      ),
    )
    .returning({ id: schema.outreachEnrollment.id })
  out.resumed = resumed.length

  const since = new Date(Date.now() - (opts?.sinceHours ?? 72) * 60 * 60 * 1000)
  const inbound = await db
    .select({
      id: schema.emailMessage.id,
      fromEmail: schema.emailMessage.fromEmail,
      subject: schema.emailMessage.subject,
      bodyText: schema.emailMessage.bodyText,
      snippet: schema.emailMessage.snippet,
    })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.accountId, accountId),
        eq(schema.emailMessage.folder, 'inbox'),
        gte(schema.emailMessage.createdAt, since),
      ),
    )
    .orderBy(desc(schema.emailMessage.createdAt))
    .limit(100)
  if (inbound.length === 0) return out

  const month = counterMonth()
  for (const msg of inbound) {
    const fromEmail = msg.fromEmail.toLowerCase()
    const [prospect] = await db
      .select({
        id: schema.prospect.id,
        name: schema.prospect.name,
        email: schema.prospect.email,
        phone: schema.prospect.phone,
        status: schema.prospect.status,
        aiVerdict: schema.prospect.aiVerdict,
        reviewCount: schema.prospect.reviewCount,
      })
      .from(schema.prospect)
      .where(sql`lower(${schema.prospect.email}) = ${fromEmail}`)
      .limit(1)
    if (!prospect) continue
    // Only outreach-touched prospects — a random email from a dentist we
    // never contacted is not a "reply".
    if (!['contacted', 'engaged', 'queued', 'call_list'].includes(prospect.status)) continue
    out.matched++

    // Idempotency: one action per inbound message, ever.
    const existing = await db
      .select({ id: schema.outreachEvent.id })
      .from(schema.outreachEvent)
      .where(
        and(
          eq(schema.outreachEvent.prospectId, prospect.id),
          eq(schema.outreachEvent.type, 'reply'),
          sql`${schema.outreachEvent.meta} ->> 'emailMessageId' = ${msg.id}`,
        ),
      )
      .limit(1)
    if (existing.length > 0) continue

    const body = msg.bodyText || msg.snippet || ''
    const verdict = await classifyReply({
      prospectName: prospect.name,
      subject: msg.subject,
      body,
    })
    await db.insert(schema.outreachEvent).values({
      id: newId('oevt'),
      prospectId: prospect.id,
      type: 'reply',
      meta: {
        emailMessageId: msg.id,
        classification: verdict?.classification ?? 'unclassified',
      },
    })
    if (!verdict) continue // AI down: recorded the reply, next sweep won't re-act
    out.classified++
    await bumpProspectingCounter(month, 'ai_classify')
    await applyClassification(prospect, verdict, body)
    if (verdict.classification === 'interested' || verdict.classification === 'question') {
      out.callList++
    }
    if (verdict.classification === 'not_interested' || verdict.classification === 'unsubscribe') {
      out.suppressed++
    }
  }
  return out
}

/**
 * Promote engagement signals: any click → engaged; 3+ opens → engaged.
 * Only ever lifts contacted → engaged — reply-driven states are untouchable.
 */
export async function rollupEngagementSignals(): Promise<{ promoted: number }> {
  const candidates = await db
    .select({ id: schema.prospect.id, name: schema.prospect.name })
    .from(schema.prospect)
    .where(eq(schema.prospect.status, 'contacted'))
    .limit(500)
  let promoted = 0
  const names: string[] = []
  for (const p of candidates) {
    const events = await db
      .select({ type: schema.outreachEvent.type, n: sql<number>`count(*)::int` })
      .from(schema.outreachEvent)
      .where(
        and(
          eq(schema.outreachEvent.prospectId, p.id),
          inArray(schema.outreachEvent.type, ['open', 'click']),
        ),
      )
      .groupBy(schema.outreachEvent.type)
    const clicks = events.find((e) => e.type === 'click')?.n ?? 0
    const opens = events.find((e) => e.type === 'open')?.n ?? 0
    const signal = clicks > 0 ? 'clicked' : opens >= 3 ? 'opens' : null
    if (!signal) continue
    await db
      .update(schema.prospect)
      .set({ status: 'engaged', intentSignal: signal, intentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.prospect.id, p.id), eq(schema.prospect.status, 'contacted')))
    promoted++
    if (names.length < 3) names.push(p.name)
  }
  // ONE aggregate bell for the whole rollup (engaged is a soft signal — a
  // per-prospect email here would flood the inbox). No forceEmail.
  if (promoted > 0) {
    try {
      const { getPlatformOrgId } = await import('./gsc')
      const { notifyOrgMembers } = await import('./notifications')
      const orgId = await getPlatformOrgId()
      if (orgId) {
        await notifyOrgMembers(
          orgId,
          {
            bucket: 'comments',
            type: 'prospect_engaged',
            title: `🔥 ${promoted} prospect${promoted === 1 ? '' : 's'} heating up`,
            body: `${names.join(', ')}${promoted > names.length ? ` and ${promoted - names.length} more` : ''} opened or clicked your outreach.`,
            linkPath: '/platform/prospecting?status=engaged',
          },
          { roles: ['owner', 'admin'] },
        )
      }
    } catch (err) {
      console.warn('[prospect-intent] engaged rollup alert failed', err)
    }
  }
  return { promoted }
}

/**
 * External warm signal (e.g. a matching inbound demo request or signup) —
 * jump the prospect straight onto the call list. Best-effort by contract.
 */
export async function promoteProspectByEmail(
  email: string,
  signal: 'demo_request',
): Promise<boolean> {
  const [prospect] = await db
    .select({
      id: schema.prospect.id,
      name: schema.prospect.name,
      phone: schema.prospect.phone,
      status: schema.prospect.status,
    })
    .from(schema.prospect)
    .where(sql`lower(${schema.prospect.email}) = ${email.toLowerCase()}`)
    .limit(1)
  if (!prospect) return false
  if (['converted', 'suppressed', 'not_interested', 'disqualified'].includes(prospect.status)) {
    return false
  }
  await stopLiveEnrollment(prospect.id, 'stopped_reply', signal)
  await db
    .update(schema.prospect)
    .set({ status: 'call_list', intentSignal: signal, intentAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.prospect.id, prospect.id))
  await alertCallList(
    { id: prospect.id, name: prospect.name, email: email, phone: prospect.phone },
    'demo_request',
    'Requested a demo from the marketing site.',
  )
  return true
}
