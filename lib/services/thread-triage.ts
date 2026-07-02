import 'server-only'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'

/**
 * Urgency triage for inbound patient messages (the Solutionreach-style inbox
 * categorization, extended from our Gmail-mailbox triage to patient threads).
 *
 * Two-stage on purpose:
 *   1. A keyword screen (English + Spanish clinical-distress vocabulary)
 *      decides whether the message is even a CANDIDATE — routine messages
 *      ("can I move my cleaning?") never cost an AI call.
 *   2. Claude confirms and writes a five-word reason ("severe pain, crown
 *      fell off"). If AI is unconfigured or errors, the keyword hit stands
 *      with a generic reason — a patient in pain should never be missed
 *      because a classifier was down.
 *
 * Always best-effort: callers fire-and-forget; a triage failure never blocks
 * recording the message. Staff replying clears the flag (handled).
 */

// Clinical-distress screen — deliberately broad; stage 2 trims false alarms.
const URGENT_PATTERNS: RegExp[] = [
  /\bpain(ful)?\b/i, /\bhurt(s|ing)?\b/i, /\bach(e|ing)\b/i, /\bthrobbing\b/i,
  /\bswoll?en\b/i, /\bswelling\b/i, /\bbleed(s|ing)?\b/i, /\babscess\b/i,
  /\binfect(ed|ion)\b/i, /\bemergency\b/i, /\burgent(ly)?\b/i, /\bER\b/,
  /\bknocked\s+out\b/i, /\bfell\s+(out|off)\b/i, /\bbroke(n)?\b/i, /\bcracked\b/i,
  /\bchipped\b/i, /\bloose\s+(tooth|crown|filling|implant)\b/i, /\bcan'?t\s+(eat|sleep|chew)\b/i,
  /\bfever\b/i, /\bpus\b/i, /\bnumb(ness)?\b/i, /\bdry\s+socket\b/i,
  // Spanish
  /\bdolor\b/i, /\bduele\b/i, /\bhinchad[oa]\b/i, /\bhinchaz[oó]n\b/i,
  /\bsangra(ndo|do)?\b/i, /\binfecci[oó]n\b/i, /\burgencia\b/i, /\bemergencia\b/i,
  // NOTE: no trailing \b after accented chars — JS \b is ASCII-only, so
  // "cayó\b" never matches "se me cayó".
  /\bse\s+(me\s+)?(cay[oó]|rompi[oó]|quebr[oó])/i, /\bfiebre\b/i, /\broto\b/i,
]

/** Stage-1 screen — exported for tests. */
export function looksPossiblyUrgent(body: string): boolean {
  const text = body.slice(0, 2000)
  return URGENT_PATTERNS.some((p) => p.test(text))
}

const VerdictSchema = z.object({
  urgent: z.boolean(),
  reason: z.string().max(120),
})

/**
 * Classify one inbound message and stamp the thread. Fire-and-forget from
 * recordInboundMessage — never throws, never blocks.
 */
export async function classifyInboundUrgency(
  organizationId: string,
  threadId: string,
  body: string,
): Promise<void> {
  try {
    const text = body.trim()
    if (!text || !looksPossiblyUrgent(text)) return

    // Keyword hit = urgent by default; AI can only refine (confirm + a crisp
    // reason, or stand down an obvious false alarm like "no pain at all").
    let urgent = true
    let reason = 'Mentions pain or a possible dental emergency'

    if (aiConfigured()) {
      try {
        const raw = await runClaudeJson({
          model: 'sonnet',
          maxTokens: 200,
          system: `You triage inbound patient messages for a dental clinic's front desk. Decide if the message describes a SAME-DAY clinical need: active pain, swelling, bleeding, infection signs, dental trauma (broken/knocked-out tooth, lost crown with pain), or the patient calling it an emergency. Routine scheduling, billing, and paperwork questions are NOT urgent — even when they mention a past or hypothetical symptom ("last time it hurt a little"). If urgent, give a reason in at most six words, plain language, e.g. "severe pain, swollen jaw".`,
          messages: [{ role: 'user', content: text.slice(0, 2000) }],
          toolName: 'triage_message',
          toolDescription: 'Return the urgency verdict for this patient message.',
          inputSchema: {
            type: 'object',
            properties: {
              urgent: { type: 'boolean', description: 'True only for same-day clinical need.' },
              reason: { type: 'string', description: 'At most six words; empty when not urgent.' },
            },
            required: ['urgent', 'reason'],
          },
        })
        const parsed = VerdictSchema.safeParse(raw)
        if (parsed.success) {
          urgent = parsed.data.urgent
          if (urgent && parsed.data.reason.trim()) reason = parsed.data.reason.trim()
        }
      } catch (err) {
        // Keyword verdict stands — a down classifier must not hide a patient in pain.
        console.warn('[thread-triage] AI confirm failed; keeping keyword verdict', err)
      }
    }

    if (!urgent) return
    await db
      .update(schema.patientThread)
      .set({ urgency: 'urgent', urgencyReason: reason.slice(0, 200), updatedAt: new Date() })
      .where(
        and(
          eq(schema.patientThread.id, threadId),
          eq(schema.patientThread.organizationId, organizationId),
        ),
      )
  } catch (err) {
    console.warn('[thread-triage] classification failed', err)
  }
}
