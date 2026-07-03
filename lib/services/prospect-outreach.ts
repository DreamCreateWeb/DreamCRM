import 'server-only'
import { Resend } from 'resend'
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { encodeToken } from '@/lib/marketing/tokens'
import { z } from 'zod'
import type { ProspectAiVerdict, ProspectingConfig } from '@/lib/types/prospecting'
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

/** Seed the default 4-touch sequence (idempotent, safe on every boot). */
export async function ensureDefaultSequence(): Promise<void> {
  await db
    .insert(schema.outreachSequence)
    .values({
      id: DEFAULT_SEQUENCE_ID,
      name: 'Default cold outreach',
      status: 'active',
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

export async function enrollProspect(
  prospectId: string,
  sequenceId = DEFAULT_SEQUENCE_ID,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
    return { ok: false, error: 'Known contact (customer, clinic, or suppressed) — not enrolling.' }
  }
  try {
    await db.insert(schema.outreachEnrollment).values({
      id: newId('oenr'),
      prospectId,
      sequenceId,
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
  return { ok: true }
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
  touches: Array<{
    id: string
    stepNumber: number
    dayOffset: number
    subjectTemplate: string
    bodyTemplate: string
    aiPersonalize: boolean
  }>
  liveEnrollments: number
  totalSent: number
}

export async function listSequencesWithStats(): Promise<SequenceWithTouches[]> {
  await ensureDefaultSequence()
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
    const [sent] = await db
      .select({ n: sqlCount() })
      .from(schema.outreachTouchLog)
      .innerJoin(
        schema.outreachEnrollment,
        eq(schema.outreachEnrollment.id, schema.outreachTouchLog.enrollmentId),
      )
      .where(eq(schema.outreachEnrollment.sequenceId, seq.id))
    out.push({
      id: seq.id,
      name: seq.name,
      status: seq.status,
      description: seq.description,
      touches: touches.map((t) => ({
        id: t.id,
        stepNumber: t.stepNumber,
        dayOffset: t.dayOffset,
        subjectTemplate: t.subjectTemplate,
        bodyTemplate: t.bodyTemplate,
        aiPersonalize: t.aiPersonalize === 1,
      })),
      liveEnrollments: live?.n ?? 0,
      totalSent: sent?.n ?? 0,
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

export async function runOutreach(opts?: { now?: Date }): Promise<OutreachRunResult> {
  const now = opts?.now ?? new Date()
  const config = await getProspectingConfig()
  const out: OutreachRunResult = {
    scanned: 0, sent: 0, dryRun: false, windowSkipped: 0, guardSkipped: 0, completed: 0, errors: 0,
  }
  if (config.killSwitch) return { ...out, skipped: 'kill_switch' }

  await ensureDefaultSequence()
  const sender = resolveOutreachSender(config)
  out.dryRun = sender.kind === 'dry_run'

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
