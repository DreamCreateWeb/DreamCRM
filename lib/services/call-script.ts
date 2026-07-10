import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { effectiveProductKnowledge, segmentAngle } from '@/lib/prospect-product-knowledge'
import { segmentForProspect } from '@/lib/prospect-segment'
import { parseCallScript, type CallScript } from '@/lib/types/call-script'
import { ratingLabel, type ProspectAiVerdict, type ProspectCrawlSignals } from '@/lib/types/prospecting'
import { bumpProspectingCounter, counterMonth, getProspectingConfig } from './prospecting'

/**
 * The AI cold-call script — what to SAY on the dial, cached forever on
 * prospect.call_script (regenerate overwrites). The demo brief scripts the
 * demo; this scripts the ten seconds the owner dreads: a personalized opener
 * built from THEIR verified situation, the why-them hook, ≤3 value points,
 * the likely brush-offs with one-breath answers, the demo ask, and a
 * 20-second voicemail. Owner-surface (Call Mode), not the cron engine — no
 * kill-switch gate. Haiku (volume is a dial session, latency matters),
 * metered on ai_call_script.
 */

const scriptSchema = z.object({
  opener: z.string().min(20).max(400),
  whyThem: z.string().min(20).max(500),
  valuePoints: z.array(z.string().min(5).max(200)).max(3),
  objections: z
    .array(z.object({ objection: z.string().min(5).max(200), response: z.string().min(5).max(400) }))
    .max(4),
  ask: z.string().min(10).max(300),
  voicemail: z.string().min(40).max(600),
})

export async function getCallScript(prospectId: string): Promise<CallScript | null> {
  const [row] = await db
    .select({ callScript: schema.prospect.callScript })
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  return parseCallScript(row?.callScript ?? null)
}

/**
 * Cache-or-generate. Returns the stored script instantly when present;
 * otherwise generates, stores, and returns it (null when AI is unconfigured,
 * the prospect is missing, or generation fails — Call Mode degrades to the
 * intent summary + talking points, never blocks the dial).
 */
export async function getOrGenerateCallScript(
  prospectId: string,
  opts?: { force?: boolean },
): Promise<CallScript | null> {
  const [p] = await db
    .select()
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (!p) return null

  if (!opts?.force) {
    const cached = parseCallScript(p.callScript ?? null)
    if (cached) return cached
  }
  if (!aiConfigured()) return null

  const config = await getProspectingConfig().catch(() => null)
  const verdict = (p.aiVerdict ?? null) as ProspectAiVerdict | null
  const signals = (p.enrichment ?? null) as ProspectCrawlSignals | null
  const segment = segmentForProspect(verdict, signals)
  const gaps = verdict?.weaknesses?.slice(0, 4) ?? []
  const rating = ratingLabel(p.googleRatingTenths, p.reviewCount)

  const facts = [
    `Practice: ${p.name}`,
    [p.city, p.state].filter(Boolean).length ? `Location: ${[p.city, p.state].filter(Boolean).join(', ')}` : '',
    p.authorizedOfficialName ? `Owner / decision-maker: ${p.authorizedOfficialName}` : '',
    p.websiteUrl ? `Current website: ${p.websiteUrl}` : 'They have NO website at all.',
    rating ? `Google: ${rating}` : '',
    gaps.length ? `Verified gaps: ${gaps.join('; ')}` : '',
    verdict?.summary ? `Presence summary: ${verdict.summary}` : '',
    p.intentSummary ? `Prior signal from them: ${p.intentSummary}` : '',
  ].filter(Boolean)

  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 900,
      system:
        effectiveProductKnowledge(config?.brain ?? null, { short: true }) +
        `\n\n${segmentAngle(segment)}` +
        "\n\nYou write a COLD-CALL script for Dustin at Dream Create calling a dental practice. He hates cold calling, so every word must be natural to say out loud — short sentences, contractions, zero salesy fluff, no exclamation marks. Ground everything in the provided facts; never fabricate pricing, clients, or capabilities beyond the product knowledge.\n- opener: the first ten seconds. Name-check the practice (and the doctor when known), say who's calling in half a sentence, then ONE specific, true observation about their online presence that earns the next sentence. No 'how are you today'.\n- whyThem: one or two spoken sentences on why this call is worth their time — their situation, not our features.\n- valuePoints: up to 3 short spoken lines mapping what we do to their verified gaps.\n- objections: the 2-4 likeliest brush-offs on a COLD CALL (e.g. 'not interested', 'we're busy', 'send an email', 'we have a website guy') each with a one-breath response that keeps the door open without pushing.\n- ask: one clear, low-pressure ask for a 20-minute demo.\n- voicemail: ~20 seconds spoken (55-75 words): who, the one observation, one sentence of value, and that he'll try again — warm, unhurried, no callback pressure.",
      messages: [{ role: 'user', content: facts.join('\n') }],
      toolName: 'write_call_script',
      toolDescription: 'Record the structured cold-call script for this practice.',
      inputSchema: {
        type: 'object',
        properties: {
          opener: { type: 'string', maxLength: 400 },
          whyThem: { type: 'string', maxLength: 500 },
          valuePoints: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 200 } },
          objections: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                objection: { type: 'string', maxLength: 200 },
                response: { type: 'string', maxLength: 400 },
              },
              required: ['objection', 'response'],
            },
          },
          ask: { type: 'string', maxLength: 300 },
          voicemail: { type: 'string', maxLength: 600 },
        },
        required: ['opener', 'whyThem', 'valuePoints', 'objections', 'ask', 'voicemail'],
      },
    })
    const parsed = scriptSchema.safeParse(raw)
    if (!parsed.success) return null

    const script: CallScript = {
      version: 1,
      generatedAt: new Date().toISOString(),
      ...parsed.data,
    }
    await db
      .update(schema.prospect)
      .set({ callScript: script, updatedAt: new Date() })
      .where(eq(schema.prospect.id, prospectId))
    await bumpProspectingCounter(counterMonth(), 'ai_call_script')
    return script
  } catch {
    return null
  }
}
