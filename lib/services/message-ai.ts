import 'server-only'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { aiUsageCounter } from '@/lib/db/schema/platform'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { CORE_VOICE_RULES } from '@/lib/services/service-library-ai'
import { newId } from '@/lib/utils'
import {
  getPatientThreadById,
  getThreadPatientContext,
  listMessagesInThread,
} from '@/lib/services/patient-messaging'

/**
 * AI reply-draft assist for the unified patient inbox. Given a conversation,
 * Claude drafts a short, on-voice reply that a staff member reviews and edits
 * before sending — it is NEVER auto-sent. Reuses the website-editor metering
 * infra (`ai_usage_counter`) under a distinct `kind`, so it needs no migration
 * and is tracked separately from website rewrites. The voice rules + the
 * no-fabricated-specifics promise carry over from the rest of the AI surface.
 */

const KIND = 'message_draft'

/** Generous per-tier monthly cap — drafting replies is everyday front-desk
 *  work (not content editing), so it sits well above the rewrite allowance. */
export function messageDraftAllowance(plan: string | null | undefined): number {
  switch ((plan ?? '').toLowerCase()) {
    case 'premium':
      return 600
    case 'pro':
      return 250
    default:
      return 40
  }
}

/** 'YYYY-MM' in UTC — the allowance bucket. */
function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface MessageDraftUsage {
  used: number
  limit: number
  remaining: number
}

export async function getMessageDraftUsage(
  orgId: string,
  plan: string | null | undefined,
  now: Date = new Date(),
): Promise<MessageDraftUsage> {
  const period = currentPeriod(now)
  const limit = messageDraftAllowance(plan)
  const [row] = await db
    .select({ count: aiUsageCounter.count })
    .from(aiUsageCounter)
    .where(
      and(
        eq(aiUsageCounter.organizationId, orgId),
        eq(aiUsageCounter.period, period),
        eq(aiUsageCounter.kind, KIND),
      ),
    )
    .limit(1)
  const used = row?.count ?? 0
  return { used, limit, remaining: Math.max(0, limit - used) }
}

async function incrementMessageDraftUsage(orgId: string, now: Date = new Date()): Promise<void> {
  const period = currentPeriod(now)
  await db
    .insert(aiUsageCounter)
    .values({ id: newId('aiu'), organizationId: orgId, period, kind: KIND, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsageCounter.organizationId, aiUsageCounter.period, aiUsageCounter.kind],
      set: { count: sql`${aiUsageCounter.count} + 1`, updatedAt: new Date() },
    })
}

const DraftSchema = z.object({ reply: z.string().min(1).max(1200) })

export type DraftResult =
  | { ok: true; draft: string; remaining: number }
  | { ok: false; reason: 'not_configured' | 'no_allowance' | 'no_messages' | 'failed' }

/**
 * Draft the clinic's next reply for a thread. Gated by the monthly allowance
 * (incremented only on a successful generation). Best-effort — never throws;
 * returns a result union the caller surfaces.
 */
export async function draftPatientReply(input: {
  organizationId: string
  threadId: string
  planTier: string | null | undefined
}): Promise<DraftResult> {
  if (!aiConfigured()) return { ok: false, reason: 'not_configured' }

  const usage = await getMessageDraftUsage(input.organizationId, input.planTier)
  if (usage.remaining <= 0) return { ok: false, reason: 'no_allowance' }

  const thread = await getPatientThreadById(input.organizationId, input.threadId)
  if (!thread) return { ok: false, reason: 'no_messages' }

  const [messages, pctx] = await Promise.all([
    listMessagesInThread(input.organizationId, input.threadId),
    getThreadPatientContext(input.organizationId, thread.patientId).catch(() => null),
  ])
  if (messages.length === 0) return { ok: false, reason: 'no_messages' }

  const firstName = thread.patientFirstName?.trim() || 'the patient'
  // Compact transcript — last dozen messages keeps the prompt cheap + focused.
  const transcript = messages
    .slice(-12)
    .map((m) => `${m.direction === 'outbound' ? 'Clinic' : firstName}: ${m.body}`)
    .join('\n')
  const contextLine = pctx
    ? [
        pctx.nextVisitAt
          ? `Next visit on file: ${new Date(pctx.nextVisitAt).toDateString()}${pctx.nextVisitType ? ` (${pctx.nextVisitType})` : ''}`
          : null,
        pctx.outstandingBalanceCents && pctx.outstandingBalanceCents > 0 ? 'Has an outstanding balance' : null,
        pctx.missingIntake ? 'Intake form not yet completed' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const system = `You are the front desk of a dental clinic, drafting a SHORT reply for a staff member to review before sending. ${CORE_VOICE_RULES}

Additional rules for this task:
- Reply directly to the patient's most recent message. Be warm, concise, and professional.
- 1–3 sentences. Use the patient's first name only where it reads naturally; never add an email signature or sign-off block.
- NEVER invent specifics you cannot see in the conversation or context (appointment times, dollar amounts, dates, insurance policies). If a detail is needed, ask for it or defer ("let me check on that and get right back to you").
- This is a DRAFT for staff to edit — do not promise anything the clinic hasn't already said.`

  const userContent = `Patient first name: ${firstName}${contextLine ? `\nContext: ${contextLine}` : ''}

Conversation (most recent message last):
${transcript}

Draft the clinic's next reply.`

  let raw: unknown | null
  try {
    raw = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 400,
      system,
      messages: [{ role: 'user', content: userContent }],
      toolName: 'draft_reply',
      toolDescription: 'Return the drafted reply text for the staff member to review.',
      inputSchema: {
        type: 'object',
        properties: { reply: { type: 'string', description: 'The reply text, 1–3 sentences.' } },
        required: ['reply'],
      },
    })
  } catch (err) {
    console.warn('[message-ai.draftPatientReply] AI call failed', err)
    return { ok: false, reason: 'failed' }
  }

  const parsed = DraftSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'failed' }

  await incrementMessageDraftUsage(input.organizationId)
  const after = await getMessageDraftUsage(input.organizationId, input.planTier)
  return { ok: true, draft: parsed.data.reply.trim(), remaining: after.remaining }
}

// ── Translation (preferred-language sending) ─────────────────────────────────

const TranslateSchema = z.object({ translated: z.string().min(1).max(8000) })

export const TRANSLATE_LANGUAGES = {
  es: 'Spanish',
  en: 'English',
} as const
export type TranslateLanguage = keyof typeof TRANSLATE_LANGUAGES

export type TranslateResult =
  | { ok: true; translated: string; remaining: number }
  | { ok: false; reason: 'not_configured' | 'no_allowance' | 'empty' | 'too_long' | 'failed' }

/**
 * Translate a composer draft into the patient's preferred language — staff
 * review the result before sending (never auto-sent, same posture as the AI
 * draft). Shares the message_draft allowance pool: translating a reply is the
 * same everyday front-desk work as drafting one.
 */
export async function translateMessage(input: {
  organizationId: string
  text: string
  target: TranslateLanguage
  planTier: string | null | undefined
}): Promise<TranslateResult> {
  const text = input.text.trim()
  if (!text) return { ok: false, reason: 'empty' }
  if (text.length > 5000) return { ok: false, reason: 'too_long' }
  if (!aiConfigured()) return { ok: false, reason: 'not_configured' }

  const usage = await getMessageDraftUsage(input.organizationId, input.planTier)
  if (usage.remaining <= 0) return { ok: false, reason: 'no_allowance' }

  const language = TRANSLATE_LANGUAGES[input.target]
  const system = `You translate dental-clinic messages to patients. Translate the staff member's message into natural, conversational ${language} a patient would receive from a warm, professional front desk.
- Preserve the meaning, tone, and level of formality (Spanish: use the warm "usted" register typical of healthcare).
- Keep names, dates, times, dollar amounts, phone numbers, and URLs EXACTLY as written.
- Return ONLY the translation — no notes, no alternatives, no quotation marks around it.`

  let raw: unknown | null
  try {
    raw = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 1500,
      system,
      messages: [{ role: 'user', content: text }],
      toolName: 'translate_message',
      toolDescription: `Return the message translated into ${language}.`,
      inputSchema: {
        type: 'object',
        properties: { translated: { type: 'string', description: `The ${language} translation.` } },
        required: ['translated'],
      },
    })
  } catch (err) {
    console.warn('[message-ai.translateMessage] AI call failed', err)
    return { ok: false, reason: 'failed' }
  }

  const parsed = TranslateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'failed' }

  await incrementMessageDraftUsage(input.organizationId)
  const after = await getMessageDraftUsage(input.organizationId, input.planTier)
  return { ok: true, translated: parsed.data.translated.trim(), remaining: after.remaining }
}
