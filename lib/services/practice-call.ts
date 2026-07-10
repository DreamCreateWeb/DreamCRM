import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { parseCallScript } from '@/lib/types/call-script'
import type { ProspectAiVerdict } from '@/lib/types/prospecting'
import { bumpProspectingCounter, counterMonth } from './prospecting'

/**
 * 🎭 Practice mode — rehearse the cold call before dialing for real. The AI
 * role-plays the prospect's front desk (handing to the doctor if the caller
 * asks), grounded in THIS practice's real context: name, city, and the
 * brush-offs their call script anticipates. Rehearsal is the best-proven cure
 * for call reluctance; this makes it free and private.
 *
 * Owner-initiated from Call Mode — no kill-switch gate. Haiku (a rehearsal is
 * a rapid back-and-forth; latency matters), metered on ai_practice. Nothing
 * is stored — a rehearsal is disposable by design.
 */

const turnSchema = z.object({
  role: z.enum(['you', 'them']),
  text: z.string().trim().min(1).max(600),
})
export type PracticeTurn = z.infer<typeof turnSchema>
// Cap the transcript so a runaway rehearsal can't grow unbounded prompts.
const transcriptSchema = z.array(turnSchema).max(24)

export type PracticeReplyResult =
  | { ok: true; reply: string }
  | { ok: false; error: 'ai_unavailable' | 'not_found' | 'failed' }

export interface PracticeFeedback {
  verdict: string
  wins: string[]
  fixes: string[]
}
export type PracticeFeedbackResult =
  | { ok: true; feedback: PracticeFeedback }
  | { ok: false; error: 'ai_unavailable' | 'not_found' | 'failed' }

async function loadContext(prospectId: string) {
  const [p] = await db
    .select()
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (!p) return null
  const verdict = (p.aiVerdict ?? null) as ProspectAiVerdict | null
  const script = parseCallScript(p.callScript ?? null)
  return {
    name: p.name,
    place: [p.city, p.state].filter(Boolean).join(', '),
    officialName: p.authorizedOfficialName,
    hasWebsite: Boolean(p.websiteUrl),
    weaknesses: verdict?.weaknesses?.slice(0, 3) ?? [],
    objections: (script?.objections ?? []).map((o) => o.objection).slice(0, 4),
  }
}

function transcriptText(transcript: PracticeTurn[]): string {
  return transcript.map((t) => `${t.role === 'you' ? 'CALLER' : 'PRACTICE'}: ${t.text}`).join('\n')
}

/** The AI's next line as the practice — answering the phone on an empty
 *  transcript, staying in character after that. */
export async function practiceReply(
  prospectId: string,
  rawTranscript: unknown,
): Promise<PracticeReplyResult> {
  if (!aiConfigured()) return { ok: false, error: 'ai_unavailable' }
  const parsed = transcriptSchema.safeParse(rawTranscript)
  if (!parsed.success) return { ok: false, error: 'failed' }
  const ctx = await loadContext(prospectId)
  if (!ctx) return { ok: false, error: 'not_found' }

  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 300,
      system:
        `You are ROLE-PLAYING for a sales rehearsal. You play the busy front desk of ${ctx.name}` +
        (ctx.place ? ` in ${ctx.place}` : '') +
        (ctx.officialName ? ` (the owner is ${ctx.officialName} — only put them on if the caller earns it)` : '') +
        `. The caller is rehearsing a cold call; you do NOT know them.\n` +
        `Play it real: polite but guarded, short spoken replies (1-2 sentences), phones ringing, patients waiting. Natural brush-offs you might use: ${
          ctx.objections.length ? ctx.objections.join('; ') : "we're busy; can you send an email; we already have someone for that"
        }.\n` +
        `Warm up ONLY if the caller is specific, low-pressure, and clearly worth the time — and only agree to a demo after a genuinely good, clear ask. If they ramble or push, get shorter and cooler. If the transcript is empty, answer the phone the way a front desk answers ("${ctx.name}, this is …"). Never break character, never mention this is practice, never use exclamation marks excessively.`,
      messages: [
        {
          role: 'user',
          content:
            parsed.data.length === 0
              ? '(The phone rings. Answer it.)'
              : `Transcript so far:\n${transcriptText(parsed.data)}\n\nYour next line as the practice:`,
        },
      ],
      toolName: 'speak_as_practice',
      toolDescription: "Emit the practice's next spoken line.",
      inputSchema: {
        type: 'object',
        properties: { reply: { type: 'string', maxLength: 400 } },
        required: ['reply'],
      },
    })
    const out = z.object({ reply: z.string().trim().min(1).max(400) }).safeParse(raw)
    if (!out.success) return { ok: false, error: 'failed' }
    await bumpProspectingCounter(counterMonth(), 'ai_practice')
    return { ok: true, reply: out.data.reply }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

/** End-of-rehearsal coaching — anti-shame, specific, short. */
export async function practiceFeedback(
  prospectId: string,
  rawTranscript: unknown,
): Promise<PracticeFeedbackResult> {
  if (!aiConfigured()) return { ok: false, error: 'ai_unavailable' }
  const parsed = transcriptSchema.safeParse(rawTranscript)
  if (!parsed.success || parsed.data.length === 0) return { ok: false, error: 'failed' }
  const ctx = await loadContext(prospectId)
  if (!ctx) return { ok: false, error: 'not_found' }

  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 500,
      system:
        'You are a warm, practical sales coach reviewing a REHEARSED cold call to a dental practice. The caller hates cold calling — coach them the way a good friend would: specific, encouraging, zero shame. Judge against what works on a real front-desk call: a specific true observation in the first ten seconds, low pressure, answering brush-offs in one breath, and one clear ask for a short demo. Quote their actual words where useful. No exclamation marks.',
      messages: [
        {
          role: 'user',
          content: `The practice: ${ctx.name}${ctx.place ? ` (${ctx.place})` : ''}${
            ctx.weaknesses.length ? `\nTheir real gaps the caller could have used: ${ctx.weaknesses.join('; ')}` : ''
          }\n\nRehearsal transcript:\n${transcriptText(parsed.data)}`,
        },
      ],
      toolName: 'coach_the_call',
      toolDescription: 'Emit the rehearsal feedback.',
      inputSchema: {
        type: 'object',
        properties: {
          verdict: { type: 'string', maxLength: 200, description: 'One warm sentence on how it went.' },
          wins: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 200 } },
          fixes: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 220 } },
        },
        required: ['verdict', 'wins', 'fixes'],
      },
    })
    const out = z
      .object({
        verdict: z.string().trim().min(1).max(200),
        wins: z.array(z.string().trim().min(1).max(200)).max(3),
        fixes: z.array(z.string().trim().min(1).max(220)).max(3),
      })
      .safeParse(raw)
    if (!out.success) return { ok: false, error: 'failed' }
    await bumpProspectingCounter(counterMonth(), 'ai_practice')
    return { ok: true, feedback: out.data }
  } catch {
    return { ok: false, error: 'failed' }
  }
}
