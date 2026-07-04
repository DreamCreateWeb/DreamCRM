import 'server-only'
import { Resend } from 'resend'
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { encodeToken } from '@/lib/marketing/tokens'
import { z } from 'zod'
import type {
  OutreachSegment,
  ProspectAiVerdict,
  ProspectCrawlSignals,
  ProspectingConfig,
} from '@/lib/types/prospecting'
import { segmentForProspect } from '@/lib/prospect-segment'
import { assessDeliverability } from '@/lib/prospect-deliverability'
import {
  getProspectingConfig,
  updateProspectingConfig,
  bumpProspectingCounter,
  getProspectingCounter,
  counterMonth,
  counterDay,
  isKnownContact,
} from './prospecting'

/**
 * Cold-outreach drip engine — the compliance-critical heart of prospecting.
 *
 * Non-negotiables, enforced HERE (not just at enrollment):
 *  - suppression list + known-contact dedupe re-checked AT SEND TIME
 *  - CAN-SPAM: truthful from, postal address footer, working one-click unsub
 *  - warm-up ramp: daily cap grows from startPerDay by incrementPerWeek to
 *    ceilingPerDay — protects the sending domain's reputation
 *  - business-hours sending in the PROSPECT's timezone, weekdays only (the
 *    window gate simply skips a due touch; the next 30m tick retries, so
 *    weekend touches naturally send Monday morning)
 *  - per-touch idempotency: unique(enrollmentId, stepNumber) touch-log
 *    insert is the atomic claim — concurrent runs can never double-send
 *  - DRY-RUN by default: until OUTREACH_EMAIL_FROM or OUTREACH_GMAIL_ACCOUNT_ID
 *    is configured AND config.dryRun is off, everything renders + logs with
 *    channel='dry_run' and nothing sends. The whole loop is testable before
 *    a sending domain exists.
 *
 * Sending NEVER uses dreamcreatestudio.com — OUTREACH_EMAIL_FROM must live
 * on a dedicated domain (deliverability blast radius).
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.dreamcreatestudio.com'
const MARKETING_SITE = 'https://www.dreamcreatestudio.com'
const BATCH_CEILING = 50 // per cron run, before the daily cap

export const DEFAULT_SEQUENCE_ID = 'oseq_default'

// ── Default sequence seed (idempotent — deterministic ids) ─────────────────

const DEFAULT_TOUCHES = [
  {
    stepNumber: 1,
    dayOffset: 0,
    subject: 'Quick question about {{clinicName}}',
    body: `Hi {{firstName}},

I run Dream Create — we build websites and patient-communication software just for dental practices.

I was looking at practices in {{city}} and noticed a couple of things about {{clinicName}}'s online presence that are probably costing you new patients.

Worth a two-minute look? Here's what we do: ${MARKETING_SITE}`,
  },
  {
    stepNumber: 2,
    dayOffset: 3,
    subject: 'Re: quick question about {{clinicName}}',
    body: `Hi {{firstName}},

Following up on my note earlier this week. The short version: patients pick dentists online now — the practices showing up with a modern site, easy online booking, and fresh reviews are pulling ahead.

Happy to send over a free, no-strings look at how {{clinicName}} compares to the practices around you.`,
  },
  {
    stepNumber: 3,
    dayOffset: 8,
    subject: 'How practices like {{clinicName}} fill their chairs',
    body: `Hi {{firstName}},

One of the clinics we work with was in the same spot — solid dentistry, quiet online presence. New site, automated reminders, and a review loop later, they're booking more new patients every month without lifting a finger.

If that's the kind of result you'd want for {{clinicName}}, I'd love to show you how it works: ${MARKETING_SITE}`,
  },
  {
    stepNumber: 4,
    dayOffset: 15,
    subject: 'Closing the loop',
    body: `Hi {{firstName}},

I'll stop nudging after this one. If growing {{clinicName}}'s online presence ever makes it onto the to-do list, my inbox is open — just hit reply.

Wishing you and the team a great rest of the year.`,
  },
]

/** Seed the default 4-touch sequence (idempotent, safe on every boot). The
 *  default IS the weak-website pitch — self-healed to segment 'weak_website'
 *  + a clearer name by ensureAllSequences. */
export async function ensureDefaultSequence(): Promise<void> {
  await db
    .insert(schema.outreachSequence)
    .values({
      id: DEFAULT_SEQUENCE_ID,
      name: 'Weak website — rebuild pitch',
      status: 'active',
      segment: 'weak_website',
      description: 'Intro → follow-up → case study → breakup (days 0/3/8/15).',
    })
    .onConflictDoNothing()
  for (const t of DEFAULT_TOUCHES) {
    await db
      .insert(schema.outreachTouchTemplate)
      .values({
        id: `otpl_default_${t.stepNumber}`,
        sequenceId: DEFAULT_SEQUENCE_ID,
        stepNumber: t.stepNumber,
        dayOffset: t.dayOffset,
        subjectTemplate: t.subject,
        bodyTemplate: t.body,
        aiPersonalize: 1,
      })
      .onConflictDoNothing()
  }
}

// ── Segment sequences — one pitch per prospect reality ─────────────────────

interface SequenceSeed {
  id: string
  name: string
  segment: string
  description: string
  touches: Array<{ stepNumber: number; dayOffset: number; subject: string; body: string }>
}

const SEGMENT_SEEDS: SequenceSeed[] = [
  {
    id: 'oseq_no_website',
    name: 'No website — full pitch',
    segment: 'no_website',
    description: 'No site at all — patients cannot find them. Days 0/3/8/15.',
    touches: [
      {
        stepNumber: 1,
        dayOffset: 0,
        subject: "Patients can't find {{clinicName}} online",
        body: `Hi {{firstName}},

I run Dream Create — websites and patient software built just for dental practices.

I went looking for {{clinicName}} online the way a new patient in {{city}} would, and couldn't find a website. Most people pick a dentist from a search now; without a site, they call whoever shows up instead.

We build the site and run everything behind it. Two-minute look: ${MARKETING_SITE}`,
      },
      {
        stepNumber: 2,
        dayOffset: 3,
        subject: "Re: patients can't find {{clinicName}} online",
        body: `Hi {{firstName}},

The short version of my last note: every practice around you with a site and online booking is quietly picking up the patients who searched for you first.

We handle the whole thing — site, booking, reminders, reviews — so nothing lands on your front desk. Happy to send a free mockup of what {{clinicName}}'s site would look like.`,
      },
      {
        stepNumber: 3,
        dayOffset: 8,
        subject: 'We build it — you keep doing dentistry',
        body: `Hi {{firstName}},

The usual worry is "I don't have time to deal with a website." That's the point of us: we design it, write it, host it, keep it current, and wire it to automatic reminders and a Google-review loop.

You do dentistry; the site does the finding. ${MARKETING_SITE}`,
      },
      {
        stepNumber: 4,
        dayOffset: 15,
        subject: 'Last note from me',
        body: `Hi {{firstName}},

I'll stop here. If getting {{clinicName}} findable online ever makes the list, just hit reply — the offer of a free mockup stands.

Wishing you and the team a great rest of the year.`,
      },
    ],
  },
  {
    id: 'oseq_weak_presence',
    name: 'Weak presence — reviews & social',
    segment: 'weak_presence',
    description: 'Decent site, quiet reviews/social — reviews on autopilot. Days 0/3/8/15.',
    touches: [
      {
        stepNumber: 1,
        dayOffset: 0,
        subject: "{{clinicName}}'s reviews vs. the practice down the street",
        body: `Hi {{firstName}},

Your website does its job. But when patients in {{city}} compare practices, they read reviews and check who looks active, and right now that side of {{clinicName}}'s presence is quiet. Quiet reads as "not sure."

We fix exactly that, automatically. ${MARKETING_SITE}`,
      },
      {
        stepNumber: 2,
        dayOffset: 3,
        subject: 'Reviews on autopilot',
        body: `Hi {{firstName}},

How it works with us: a patient finishes a visit, they get one friendly text or email, happy patients land on Google. No front-desk scripts, no chasing.

Practices running this loop add fresh reviews every week without thinking about it.`,
      },
      {
        stepNumber: 3,
        dayOffset: 8,
        subject: 'What a month of this looks like',
        body: `Hi {{firstName}},

A month in: steady new Google reviews, social posts going out on schedule, and your front desk doing nothing extra. That's the compounding part — every review makes the next patient's decision easier.

Worth a look at how it'd run for {{clinicName}}: ${MARKETING_SITE}`,
      },
      {
        stepNumber: 4,
        dayOffset: 15,
        subject: 'Last one from me',
        body: `Hi {{firstName}},

I'll leave it here. If keeping {{clinicName}}'s reviews and social alive ever becomes the project, my inbox is open — reply any time.`,
      },
    ],
  },
]

/** Seed the segment sequences (idempotent, deterministic ids). */
export async function ensureSegmentSequences(): Promise<void> {
  for (const seed of SEGMENT_SEEDS) {
    await db
      .insert(schema.outreachSequence)
      .values({
        id: seed.id,
        name: seed.name,
        status: 'active',
        segment: seed.segment,
        description: seed.description,
      })
      .onConflictDoNothing()
    for (const t of seed.touches) {
      await db
        .insert(schema.outreachTouchTemplate)
        .values({
          id: `otpl_${seed.segment}_${t.stepNumber}`,
          sequenceId: seed.id,
          stepNumber: t.stepNumber,
          dayOffset: t.dayOffset,
          subjectTemplate: t.subject,
          bodyTemplate: t.body,
          aiPersonalize: 1,
        })
        .onConflictDoNothing()
    }
  }
}

/**
 * Seed the full sequence set (default + segments) and self-heal the legacy
 * default row onto segment 'weak_website' + its clearer name. Idempotent;
 * replaces the bare ensureDefaultSequence() call at every site.
 */
export async function ensureAllSequences(): Promise<void> {
  await ensureDefaultSequence()
  await ensureSegmentSequences()
  // Self-heal: the default predates the segment column — stamp it once.
  await db
    .update(schema.outreachSequence)
    .set({ segment: 'weak_website', name: 'Weak website — rebuild pitch', updatedAt: new Date() })
    .where(and(eq(schema.outreachSequence.id, DEFAULT_SEQUENCE_ID), isNull(schema.outreachSequence.segment)))
}

// ── Pure helpers (exported for tests) ───────────────────────────────────────

/** Today's send allowance under the warm-up ramp. */
export function warmupDailyCap(config: ProspectingConfig, now: Date): number {
  const { startPerDay, incrementPerWeek, ceilingPerDay, startedAt } = config.warmup
  if (!startedAt) return startPerDay
  const started = new Date(startedAt).getTime()
  if (!Number.isFinite(started) || started > now.getTime()) return startPerDay
  const weeks = Math.floor((now.getTime() - started) / (7 * 24 * 60 * 60 * 1000))
  return Math.min(ceilingPerDay, startPerDay + incrementPerWeek * weeks)
}

/** Is `now` a weekday inside the prospect-local send window? */
export function withinSendWindow(
  now: Date,
  timezone: string | null,
  window: { startHour: number; endHour: number },
): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'America/New_York',
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(now)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value)
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
    if (weekday === 'Sat' || weekday === 'Sun') return false
    return hour >= window.startHour && hour < window.endHour
  } catch {
    return false // bad tz = fail closed, never "send anyway"
  }
}

/** {{token}} substitution; unknown tokens strip (never leak braces). */
export function mergeTemplate(input: string, fields: Record<string, string>): string {
  return input
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => fields[key] ?? '')
    .replace(/[ \t]+\n/g, '\n')
}

/** Plain-text paragraphs → personal-looking tracked HTML email. */
export function renderOutreachEmail(opts: {
  paragraphs: string[]
  prospectId: string
  touchLogId: string
  email: string
  senderName: string
  postalAddress: string
}): { html: string; text: string; unsubUrl: string } {
  const tokenBase = { e: opts.email.toLowerCase(), pr: opts.prospectId, tl: opts.touchLogId }
  const unsubUrl = `${APP_URL}/api/unsub/${encodeToken({ ...tokenBase, p: 'u' })}`
  const pixelUrl = `${APP_URL}/api/track/open/${encodeToken({ ...tokenBase, p: 'o' })}`

  const linkify = (text: string): string =>
    text.replace(/https?:\/\/[^\s<>"']+/g, (url) => {
      const tracked = `${APP_URL}/api/track/click/${encodeToken({ ...tokenBase, p: 'k', u: url })}`
      const label = url.replace(/^https?:\/\/(www\.)?/, '')
      return `<a href="${tracked}" style="color:#0f766e;">${label}</a>`
    })

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const bodyHtml = opts.paragraphs
    .map((p) => `<p style="margin:0 0 16px;">${linkify(escape(p))}</p>`)
    .join('\n')

  // Deliberately personal-looking: no logo header, no marketing shell — a
  // cold email that looks like a blast gets deleted. Compliance footer is
  // small but real: sender identity, postal address, working unsubscribe.
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c1917;max-width:560px;padding:24px;">
${bodyHtml}
<p style="margin:0 0 16px;">${escape(opts.senderName)}<br><span style="color:#78716c;">Dream Create</span></p>
<div style="margin-top:32px;padding-top:12px;border-top:1px solid #e7e5e4;font-size:12px;color:#a8a29e;">
${escape(opts.postalAddress)}<br>
Don&rsquo;t want these? <a href="${unsubUrl}" style="color:#a8a29e;">Unsubscribe</a> and you&rsquo;ll never hear from us again.
</div>
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;" />
</div></body></html>`

  const text = `${opts.paragraphs.join('\n\n')}\n\n${opts.senderName}\nDream Create\n\n${opts.postalAddress}\nUnsubscribe: ${unsubUrl}`
  return { html, text, unsubUrl }
}

// ── AI personalization ──────────────────────────────────────────────────────

const personalizedSchema = z.object({
  subject: z.string().min(3).max(120),
  paragraphs: z.array(z.string().min(1)).min(1).max(5),
})

async function personalizeTouch(input: {
  template: { subjectTemplate: string; bodyTemplate: string; aiPersonalize: number }
  fields: Record<string, string>
  verdict: ProspectAiVerdict | null
  reviewCount: number | null
  aiBudgetLeft: boolean
}): Promise<{ subject: string; paragraphs: string[]; aiUsed: boolean }> {
  const mergedSubject = mergeTemplate(input.template.subjectTemplate, input.fields)
  const mergedBody = mergeTemplate(input.template.bodyTemplate, input.fields)
  const fallback = {
    subject: mergedSubject,
    paragraphs: mergedBody.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    aiUsed: false,
  }
  const weaknesses = input.verdict?.weaknesses?.slice(0, 4) ?? []
  if (!input.template.aiPersonalize || !aiConfigured() || !input.aiBudgetLeft || weaknesses.length === 0) {
    return fallback
  }
  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 800,
      system:
        "You write short, warm, personal cold emails for Dream Create, a company selling websites + patient-communication software to dental practices. Rewrite the skeleton email so it references 1-2 of the practice's SPECIFIC verified gaps (provided). Rules: under 130 words total; plain conversational tone, no hype, no exclamation marks; never fabricate anything beyond the provided facts; keep any URL from the skeleton exactly as-is; keep the greeting line personal; sign-off is added later so do not include one.",
      messages: [
        {
          role: 'user',
          content: `Skeleton subject: ${mergedSubject}\n\nSkeleton body:\n${mergedBody}\n\nVerified gaps for this practice: ${weaknesses.join('; ')}${input.reviewCount != null ? `\nGoogle review count: ${input.reviewCount}` : ''}`,
        },
      ],
      toolName: 'write_outreach_email',
      toolDescription: 'Emit the personalized subject and body paragraphs.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
        },
        required: ['subject', 'paragraphs'],
      },
    })
    const parsed = personalizedSchema.safeParse(raw)
    if (!parsed.success) return fallback
    return { ...parsed.data, aiUsed: true }
  } catch {
    return fallback // AI never blocks a touch
  }
}

// ── Enrollment ──────────────────────────────────────────────────────────────

/**
 * Resolve the active-or-paused sequence for a segment (paused = a hold, not
 * a rejection — the send engine already holds paused sequences). Falls back
 * to the default when no segment sequence exists.
 */
async function sequenceForSegment(segment: OutreachSegment): Promise<string> {
  const [row] = await db
    .select({ id: schema.outreachSequence.id })
    .from(schema.outreachSequence)
    .where(eq(schema.outreachSequence.segment, segment))
    .orderBy(asc(schema.outreachSequence.createdAt))
    .limit(1)
  return row?.id ?? DEFAULT_SEQUENCE_ID
}

export async function enrollProspect(
  prospectId: string,
  sequenceId?: string,
): Promise<{ ok: true; sequenceId: string } | { ok: false; error: string }> {
  const [p] = await db
    .select()
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (!p) return { ok: false, error: 'Prospect not found.' }
  if (!p.email) return { ok: false, error: 'No email on file — this one is phone-only.' }
  if (['suppressed', 'converted', 'not_interested', 'disqualified'].includes(p.status)) {
    return { ok: false, error: `Cannot enroll a ${p.status.replace(/_/g, ' ')} prospect.` }
  }
  // Fail-closed dedupe: existing customers/clinics/suppressed are UNTOUCHABLE.
  if (
    await isKnownContact({
      email: p.email,
      phone: p.phone,
      websiteDomain: p.websiteUrl ? new URL(p.websiteUrl).hostname : null,
    })
  ) {
    return { ok: false, error: 'known_contact' }
  }
  // Route to the segment-matched pitch unless the caller forced a sequence.
  const chosenSequenceId =
    sequenceId ??
    (await sequenceForSegment(
      segmentForProspect(
        (p.aiVerdict ?? null) as ProspectAiVerdict | null,
        (p.enrichment ?? null) as ProspectCrawlSignals | null,
      ),
    ))
  try {
    await db.insert(schema.outreachEnrollment).values({
      id: newId('oenr'),
      prospectId,
      sequenceId: chosenSequenceId,
      status: 'active',
      currentStep: 0,
      nextSendAt: new Date(),
    })
  } catch {
    return { ok: false, error: 'Already enrolled in a live sequence.' }
  }
  await db
    .update(schema.prospect)
    .set({ status: 'queued', updatedAt: new Date() })
    .where(eq(schema.prospect.id, prospectId))
  return { ok: true, sequenceId: chosenSequenceId }
}

export async function stopEnrollment(prospectId: string): Promise<void> {
  await db
    .update(schema.outreachEnrollment)
    .set({ status: 'stopped_manual', stoppedAt: new Date(), stopReason: 'manual' })
    .where(
      and(
        eq(schema.outreachEnrollment.prospectId, prospectId),
        inArray(schema.outreachEnrollment.status, ['active', 'paused_ooo']),
      ),
    )
}

// ── Sequence management (settings surface) ─────────────────────────────────

export interface SequenceWithTouches {
  id: string
  name: string
  status: string
  description: string | null
  segment: OutreachSegment | null
  touches: Array<{
    id: string
    stepNumber: number
    dayOffset: number
    subjectTemplate: string
    bodyTemplate: string
    aiPersonalize: boolean
    stats: { sent: number; uniqueOpens: number; uniqueClicks: number }
  }>
  liveEnrollments: number
  totalSent: number
  replies: number
  replyRatePct: number | null
}

export async function listSequencesWithStats(): Promise<SequenceWithTouches[]> {
  await ensureAllSequences()
  const sequences = await db
    .select()
    .from(schema.outreachSequence)
    .orderBy(asc(schema.outreachSequence.createdAt))
  const out: SequenceWithTouches[] = []
  for (const seq of sequences) {
    const touches = await db
      .select()
      .from(schema.outreachTouchTemplate)
      .where(eq(schema.outreachTouchTemplate.sequenceId, seq.id))
      .orderBy(asc(schema.outreachTouchTemplate.stepNumber))
    const [live] = await db
      .select({ n: sqlCount() })
      .from(schema.outreachEnrollment)
      .where(
        and(
          eq(schema.outreachEnrollment.sequenceId, seq.id),
          inArray(schema.outreachEnrollment.status, ['active', 'paused_ooo']),
        ),
      )
    // Sent per step.
    const sentByStep = await db
      .select({ step: schema.outreachTouchLog.stepNumber, n: sqlCount() })
      .from(schema.outreachTouchLog)
      .innerJoin(
        schema.outreachEnrollment,
        eq(schema.outreachEnrollment.id, schema.outreachTouchLog.enrollmentId),
      )
      .where(
        and(
          eq(schema.outreachEnrollment.sequenceId, seq.id),
          eq(schema.outreachTouchLog.status, 'sent'),
        ),
      )
      .groupBy(schema.outreachTouchLog.stepNumber)
    // Unique opens/clicks per step (DISTINCT touch_log_id — 6 opens of one
    // email count once).
    const engByStep = await db
      .select({
        step: schema.outreachTouchLog.stepNumber,
        type: schema.outreachEvent.type,
        n: sql<number>`count(distinct ${schema.outreachEvent.touchLogId})::int`,
      })
      .from(schema.outreachEvent)
      .innerJoin(
        schema.outreachTouchLog,
        eq(schema.outreachTouchLog.id, schema.outreachEvent.touchLogId),
      )
      .innerJoin(
        schema.outreachEnrollment,
        eq(schema.outreachEnrollment.id, schema.outreachTouchLog.enrollmentId),
      )
      .where(
        and(
          eq(schema.outreachEnrollment.sequenceId, seq.id),
          inArray(schema.outreachEvent.type, ['open', 'click']),
        ),
      )
      .groupBy(schema.outreachTouchLog.stepNumber, schema.outreachEvent.type)

    const sentMap = new Map(sentByStep.map((r) => [r.step, r.n]))
    const openMap = new Map(engByStep.filter((r) => r.type === 'open').map((r) => [r.step, r.n]))
    const clickMap = new Map(engByStep.filter((r) => r.type === 'click').map((r) => [r.step, r.n]))
    const totalSent = sentByStep.reduce((a, r) => a + r.n, 0)

    // Sequence-level replies (reply events carry no step) + reply rate over
    // enrollments that got at least one send.
    const [replies] = await db
      .select({ n: sql<number>`count(distinct ${schema.outreachEvent.prospectId})::int` })
      .from(schema.outreachEvent)
      .innerJoin(schema.outreachEnrollment, eq(schema.outreachEnrollment.prospectId, schema.outreachEvent.prospectId))
      .where(
        and(
          eq(schema.outreachEnrollment.sequenceId, seq.id),
          eq(schema.outreachEvent.type, 'reply'),
        ),
      )
    const [enrolledWithSend] = await db
      .select({ n: sql<number>`count(distinct ${schema.outreachTouchLog.enrollmentId})::int` })
      .from(schema.outreachTouchLog)
      .innerJoin(
        schema.outreachEnrollment,
        eq(schema.outreachEnrollment.id, schema.outreachTouchLog.enrollmentId),
      )
      .where(and(eq(schema.outreachEnrollment.sequenceId, seq.id), eq(schema.outreachTouchLog.status, 'sent')))
    const denom = enrolledWithSend?.n ?? 0
    const replyCount = replies?.n ?? 0

    out.push({
      id: seq.id,
      name: seq.name,
      status: seq.status,
      description: seq.description,
      segment: (seq.segment ?? null) as OutreachSegment | null,
      touches: touches.map((t) => ({
        id: t.id,
        stepNumber: t.stepNumber,
        dayOffset: t.dayOffset,
        subjectTemplate: t.subjectTemplate,
        bodyTemplate: t.bodyTemplate,
        aiPersonalize: t.aiPersonalize === 1,
        stats: {
          sent: sentMap.get(t.stepNumber) ?? 0,
          uniqueOpens: openMap.get(t.stepNumber) ?? 0,
          uniqueClicks: clickMap.get(t.stepNumber) ?? 0,
        },
      })),
      liveEnrollments: live?.n ?? 0,
      totalSent,
      replies: replyCount,
      replyRatePct: denom > 0 ? Math.round((replyCount / denom) * 1000) / 10 : null,
    })
  }
  return out
}

export async function updateTouchTemplate(
  templateId: string,
  patch: { subjectTemplate: string; bodyTemplate: string; aiPersonalize: boolean; dayOffset: number },
): Promise<void> {
  await db
    .update(schema.outreachTouchTemplate)
    .set({
      subjectTemplate: patch.subjectTemplate,
      bodyTemplate: patch.bodyTemplate,
      aiPersonalize: patch.aiPersonalize ? 1 : 0,
      dayOffset: patch.dayOffset,
      updatedAt: new Date(),
    })
    .where(eq(schema.outreachTouchTemplate.id, templateId))
}

export async function setSequenceStatus(
  sequenceId: string,
  status: 'active' | 'paused',
): Promise<void> {
  await db
    .update(schema.outreachSequence)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.outreachSequence.id, sequenceId))
}

function sqlCount() {
  return sql<number>`count(*)::int`
}

// ── The engine ──────────────────────────────────────────────────────────────

export interface OutreachRunResult {
  scanned: number
  sent: number
  dryRun: boolean
  windowSkipped: number
  guardSkipped: number
  completed: number
  errors: number
  skipped?: string
}

interface OutreachSender {
  kind: 'resend' | 'gmail' | 'dry_run'
  from?: string
  gmailAccountId?: string
}

function resolveOutreachSender(config: ProspectingConfig): OutreachSender {
  const from = process.env.OUTREACH_EMAIL_FROM?.trim()
  const gmailAccountId = process.env.OUTREACH_GMAIL_ACCOUNT_ID?.trim()
  if (config.dryRun || (!from && !gmailAccountId)) return { kind: 'dry_run' }
  // Gmail preferred when both exist: replies land in the connected inbox
  // (which also powers intent detection) and cold email from a real mailbox
  // survives filters better than API blasts.
  if (gmailAccountId) return { kind: 'gmail', gmailAccountId, from }
  return { kind: 'resend', from }
}

// ── The hunter: auto-enrollment ─────────────────────────────────────────────

export interface AutoEnrollResult {
  scanned: number
  enrolled: number
  guardSkipped: number
  skipped?: string
}

/**
 * The autonomous hunter — routes enriched, emailed, in-band prospects into
 * their segment-matched sequence without a human clicking Enroll. Runs even
 * in dry-run (enrollments are DB-only and reversible; the send pass stays
 * dry until dryRun flips), so the owner can watch it work before going live.
 * Every existing guard (isKnownContact, retired-status, live-enrollment
 * uniqueness) stays fail-closed. Metered daily via the 'auto_enroll' counter.
 */
export async function runAutoEnroll(opts?: { now?: Date }): Promise<AutoEnrollResult> {
  const now = opts?.now ?? new Date()
  const config = await getProspectingConfig()
  const out: AutoEnrollResult = { scanned: 0, enrolled: 0, guardSkipped: 0 }
  if (config.killSwitch) return { ...out, skipped: 'kill_switch' }
  if (!config.autoEnroll.enabled) return { ...out, skipped: 'disabled' }
  if (config.autoEnroll.bands.length === 0) return { ...out, skipped: 'no_bands' }

  await ensureAllSequences()

  const day = counterDay(now)
  const used = await getProspectingCounter(day, 'auto_enroll')
  const allowance = Math.min(BATCH_CEILING, Math.max(0, config.autoEnroll.perDay - used))
  if (allowance === 0) return { ...out, skipped: 'daily_cap' }

  const pool = await db
    .select({ id: schema.prospect.id })
    .from(schema.prospect)
    .where(
      and(
        eq(schema.prospect.status, 'enriched'),
        isNotNull(schema.prospect.email),
        inArray(schema.prospect.scoreBand, config.autoEnroll.bands),
      ),
    )
    .orderBy(sql`${schema.prospect.opportunityScore} DESC NULLS LAST`, asc(schema.prospect.enrichedAt))
    .limit(allowance)

  for (const row of pool) {
    out.scanned++
    const r = await enrollProspect(row.id)
    if (r.ok) {
      out.enrolled++
      await bumpProspectingCounter(day, 'auto_enroll')
    } else if (r.error === 'known_contact') {
      // Drain the pool: a known contact would otherwise re-surface every run
      // and burn nothing but scans. Disqualify (auto-enroll only).
      out.guardSkipped++
      await db
        .update(schema.prospect)
        .set({
          status: 'disqualified',
          suppressedReason: 'known_contact',
          suppressedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.prospect.id, row.id))
    } else {
      // No-email/retired/already-enrolled — the query excludes these, so this
      // is a benign race; count it and move on (no counter burn).
      out.guardSkipped++
    }
  }
  return out
}

/**
 * Trailing-window deliverability check. Counts real (non-dry-run) sends and
 * bounce/complaint events over watchdog.windowHours; on a breach, flips
 * dryRun on + stamps the trip + alerts platform admins. Returns true when it
 * tripped (caller skips this run's sends).
 */
async function checkWatchdog(config: ProspectingConfig, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - config.watchdog.windowHours * 60 * 60 * 1000)
  const [sentRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outreachTouchLog)
    .where(
      and(
        inArray(schema.outreachTouchLog.channel, ['resend', 'gmail']),
        eq(schema.outreachTouchLog.status, 'sent'),
        sql`${schema.outreachTouchLog.sentAt} >= ${since}`,
      ),
    )
  const events = await db
    .select({ type: schema.outreachEvent.type, n: sql<number>`count(*)::int` })
    .from(schema.outreachEvent)
    .where(
      and(
        inArray(schema.outreachEvent.type, ['bounce', 'complaint']),
        sql`${schema.outreachEvent.occurredAt} >= ${since}`,
      ),
    )
    .groupBy(schema.outreachEvent.type)

  const counts = {
    sent: sentRow?.n ?? 0,
    bounces: events.find((e) => e.type === 'bounce')?.n ?? 0,
    complaints: events.find((e) => e.type === 'complaint')?.n ?? 0,
  }
  const verdict = assessDeliverability(counts, config.watchdog)
  if (!verdict.tripped) return false

  await updateProspectingConfig({
    dryRun: true,
    watchdog: { ...config.watchdog, trippedAt: now.toISOString(), reason: verdict.reason },
  })
  // Best-effort alert — a paused send engine must not depend on the bell.
  try {
    const { getPlatformOrgId } = await import('./gsc')
    const { notifyOrgMembers } = await import('./notifications')
    const orgId = await getPlatformOrgId()
    if (orgId) {
      await notifyOrgMembers(
        orgId,
        {
          bucket: 'comments',
          type: 'prospect_watchdog',
          title: 'Outreach auto-paused — deliverability alarm',
          body: `${verdict.reason}. Sending is back in dry-run until you review and flip it live again in Prospecting Settings.`,
          linkPath: '/platform/prospecting/settings',
          forceEmail: true,
        },
        { roles: ['owner', 'admin'] },
      )
    }
  } catch (err) {
    console.warn('[prospect-outreach] watchdog alert failed', err)
  }
  return true
}

export async function runOutreach(opts?: { now?: Date }): Promise<OutreachRunResult> {
  const now = opts?.now ?? new Date()
  const config = await getProspectingConfig()
  const out: OutreachRunResult = {
    scanned: 0, sent: 0, dryRun: false, windowSkipped: 0, guardSkipped: 0, completed: 0, errors: 0,
  }
  if (config.killSwitch) return { ...out, skipped: 'kill_switch' }

  await ensureAllSequences()
  const sender = resolveOutreachSender(config)
  out.dryRun = sender.kind === 'dry_run'

  // Deliverability watchdog — only when actually sending (dry-run has no real
  // sends to judge) and not already tripped. A breach auto-pauses LIVE
  // sending and alerts; the owner clears it by flipping dry-run back off.
  if (!out.dryRun && config.watchdog.enabled && !config.watchdog.trippedAt) {
    const tripped = await checkWatchdog(config, now)
    if (tripped) return { ...out, skipped: 'watchdog_tripped' }
  }

  // Live sending starts the warm-up clock exactly once.
  if (!out.dryRun && !config.warmup.startedAt) {
    await updateProspectingConfig({
      warmup: { ...config.warmup, startedAt: now.toISOString() },
    })
    config.warmup.startedAt = now.toISOString()
  }

  const day = counterDay(now)
  const cap = warmupDailyCap(config, now)
  const sentToday = out.dryRun ? 0 : await getProspectingCounter(day, 'outreach_send')
  const allowance = Math.min(BATCH_CEILING, Math.max(0, cap - sentToday))
  if (allowance === 0) return { ...out, skipped: 'daily_cap' }

  const month = counterMonth(now)
  let aiUsed = await getProspectingCounter(month, 'ai_email')

  // Paused sequences hold their enrollments in place (nothing sends, nothing
  // advances — unpausing resumes exactly where each prospect stood).
  const pausedSequences = await db
    .select({ id: schema.outreachSequence.id })
    .from(schema.outreachSequence)
    .where(eq(schema.outreachSequence.status, 'paused'))
  const pausedIds = new Set(pausedSequences.map((s) => s.id))

  const due = (
    await db
      .select()
      .from(schema.outreachEnrollment)
      .where(
        and(
          eq(schema.outreachEnrollment.status, 'active'),
          lte(schema.outreachEnrollment.nextSendAt, now),
        ),
      )
      .orderBy(asc(schema.outreachEnrollment.nextSendAt))
      .limit(allowance)
  ).filter((e) => !pausedIds.has(e.sequenceId))

  const postalAddress = process.env.MARKETING_POSTAL_ADDRESS || ''
  const senderName = process.env.OUTREACH_SENDER_NAME || 'Dustin'
  // Reply-To routes replies to a monitored inbox (e.g. a Gmail you watch)
  // even when the From lives on an isolated sending subdomain. Without this,
  // replies on the Resend path land nowhere the reply loop can see.
  const replyTo = process.env.OUTREACH_REPLY_TO?.trim() || undefined

  for (const enrollment of due) {
    out.scanned++
    try {
      const [p] = await db
        .select()
        .from(schema.prospect)
        .where(eq(schema.prospect.id, enrollment.prospectId))
        .limit(1)
      if (!p?.email) {
        await stopEnrollment(enrollment.prospectId)
        out.guardSkipped++
        continue
      }

      // Send-time guard — permanent suppression + known-contact dedupe.
      if (
        p.status === 'suppressed' ||
        (await isKnownContact({
          email: p.email,
          phone: p.phone,
          websiteDomain: p.websiteUrl ? new URL(p.websiteUrl).hostname : null,
        }))
      ) {
        await stopEnrollment(enrollment.prospectId)
        out.guardSkipped++
        continue
      }

      // Business-hours gate (prospect-local, weekdays). A skipped touch just
      // stays due — the next tick inside the window sends it.
      if (!withinSendWindow(now, p.timezone, config.sendWindow)) {
        out.windowSkipped++
        continue
      }

      const step = enrollment.currentStep + 1
      const [template] = await db
        .select()
        .from(schema.outreachTouchTemplate)
        .where(
          and(
            eq(schema.outreachTouchTemplate.sequenceId, enrollment.sequenceId),
            eq(schema.outreachTouchTemplate.stepNumber, step),
          ),
        )
        .limit(1)
      if (!template) {
        await db
          .update(schema.outreachEnrollment)
          .set({ status: 'completed', stoppedAt: now, stopReason: 'sequence_complete' })
          .where(eq(schema.outreachEnrollment.id, enrollment.id))
        out.completed++
        continue
      }

      const firstName = p.authorizedOfficialName?.split(/\s+/)[0] || 'there'
      const fields = {
        firstName: firstName.charAt(0) + firstName.slice(1).toLowerCase(),
        clinicName: p.name,
        city: p.city ?? 'your area',
      }
      const personalized = await personalizeTouch({
        template,
        fields,
        verdict: (p.aiVerdict ?? null) as ProspectAiVerdict | null,
        reviewCount: p.reviewCount,
        aiBudgetLeft: aiUsed < config.budgets.aiPerMonth,
      })
      if (personalized.aiUsed) {
        aiUsed++
        await bumpProspectingCounter(month, 'ai_email')
      }

      // Atomic claim — the unique(enrollmentId, stepNumber) insert. A
      // concurrent run losing this race skips silently (the winner sends).
      const touchLogId = newId('otch')
      const claimed = await db
        .insert(schema.outreachTouchLog)
        .values({
          id: touchLogId,
          enrollmentId: enrollment.id,
          prospectId: p.id,
          stepNumber: step,
          templateId: template.id,
          subject: personalized.subject,
          bodyHtml: '', // rendered below (needs the touchLogId in its tokens)
          channel: sender.kind,
          status: 'sent',
          sentAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: schema.outreachTouchLog.id })
      if (claimed.length === 0) continue

      const rendered = renderOutreachEmail({
        paragraphs: personalized.paragraphs,
        prospectId: p.id,
        touchLogId,
        email: p.email,
        senderName,
        postalAddress,
      })
      await db
        .update(schema.outreachTouchLog)
        .set({ bodyHtml: rendered.html })
        .where(eq(schema.outreachTouchLog.id, touchLogId))

      // Send (dry_run sends nothing — the log row IS the artifact).
      try {
        if (sender.kind === 'resend') {
          const key = process.env.RESEND_API_KEY
          if (!key) throw new Error('RESEND_API_KEY missing')
          const resend = new Resend(key)
          const res = await resend.emails.send({
            from: sender.from!,
            to: p.email,
            replyTo,
            subject: personalized.subject,
            html: rendered.html,
            text: rendered.text,
            headers: {
              'List-Unsubscribe': `<${rendered.unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
            tags: [
              { name: 'prospectId', value: p.id },
              { name: 'touchLogId', value: touchLogId },
            ],
          })
          if (res?.error) throw new Error(res.error.message || 'Resend send failed')
          if (res?.data?.id) {
            await db
              .update(schema.outreachTouchLog)
              .set({ resendEmailId: res.data.id })
              .where(eq(schema.outreachTouchLog.id, touchLogId))
          }
        } else if (sender.kind === 'gmail') {
          const { getAccessToken, sendMessage } = await import('./gmail')
          const accessToken = await getAccessToken(sender.gmailAccountId!)
          const [account] = await db
            .select({ address: schema.emailAccount.emailAddress })
            .from(schema.emailAccount)
            .where(eq(schema.emailAccount.id, sender.gmailAccountId!))
            .limit(1)
          const fromAddress = sender.from || account?.address
          if (!fromAddress) throw new Error('No Gmail from address')
          await sendMessage(accessToken, {
            from: fromAddress,
            to: [p.email],
            subject: personalized.subject,
            bodyText: rendered.text,
            bodyHtml: rendered.html,
          })
          // 150ms pacing — same courtesy as the campaign Gmail path.
          await new Promise((r) => setTimeout(r, 150))
        }
      } catch (sendErr) {
        await db
          .update(schema.outreachTouchLog)
          .set({
            status: 'failed',
            error: sendErr instanceof Error ? sendErr.message.slice(0, 500) : 'unknown',
          })
          .where(eq(schema.outreachTouchLog.id, touchLogId))
        out.errors++
        continue
      }

      // Advance the pointer: next template's dayOffset drives the gap.
      const [nextTemplate] = await db
        .select({ dayOffset: schema.outreachTouchTemplate.dayOffset })
        .from(schema.outreachTouchTemplate)
        .where(
          and(
            eq(schema.outreachTouchTemplate.sequenceId, enrollment.sequenceId),
            eq(schema.outreachTouchTemplate.stepNumber, step + 1),
          ),
        )
        .limit(1)
      if (nextTemplate) {
        const gapDays = Math.max(1, nextTemplate.dayOffset - template.dayOffset)
        await db
          .update(schema.outreachEnrollment)
          .set({
            currentStep: step,
            nextSendAt: new Date(now.getTime() + gapDays * 24 * 60 * 60 * 1000),
          })
          .where(eq(schema.outreachEnrollment.id, enrollment.id))
      } else {
        await db
          .update(schema.outreachEnrollment)
          .set({
            currentStep: step,
            status: 'completed',
            nextSendAt: null,
            stoppedAt: now,
            stopReason: 'sequence_complete',
          })
          .where(eq(schema.outreachEnrollment.id, enrollment.id))
        out.completed++
      }

      // First touch flips the prospect to contacted.
      if (p.status === 'queued' || p.status === 'enriched') {
        await db
          .update(schema.prospect)
          .set({ status: 'contacted', updatedAt: new Date() })
          .where(eq(schema.prospect.id, p.id))
      }

      out.sent++
      if (!out.dryRun) await bumpProspectingCounter(day, 'outreach_send')
    } catch (err) {
      out.errors++
      console.warn('[prospect-outreach] enrollment failed', enrollment.id, err instanceof Error ? err.message : err)
    }
  }
  return out
}
