import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { buildDemoBriefPrompt } from '@/lib/demo-brief-prompt'
import { parseDemoBrief, type DemoBrief } from '@/lib/types/demo-brief'
import { DEMO_BEATS } from '@/lib/types/demo-script'
import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'
import { bumpProspectingCounter, counterMonth } from './prospecting'

/**
 * The AI pre-demo brief — one owner-initiated sonnet call per prospect,
 * cached forever on prospect.demo_brief (regenerate overwrites wholesale).
 * Quality dominates: this is sales language read aloud on a live call, and
 * volume is ~zero (haiku stays the per-crawl workhorse). No kill-switch
 * gate — this is the owner clicking a button, not the cron engine.
 */

const briefSchema = z.object({
  openingLine: z.string().min(10).max(300),
  walkUpStory: z.string().min(20).max(800),
  beatEmphasis: z
    .array(
      z.object({
        beatId: z.string(),
        weight: z.enum(['lead', 'standard', 'skim']),
        why: z.string().max(200),
      }),
    )
    .min(3)
    .max(10),
  objections: z
    .array(z.object({ objection: z.string().max(200), response: z.string().max(400) }))
    .max(5),
  ammunition: z.array(z.object({ beatId: z.string(), point: z.string().max(200) })).max(6),
  closingAsk: z.string().min(5).max(300),
})

export async function getDemoBrief(prospectId: string): Promise<DemoBrief | null> {
  const [row] = await db
    .select({ demoBrief: schema.prospect.demoBrief })
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  return parseDemoBrief(row?.demoBrief ?? null)
}

export async function generateDemoBrief(
  prospectId: string,
  opts?: { force?: boolean },
): Promise<DemoBrief | null> {
  const [p] = await db
    .select()
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (!p) return null

  // Cache hit — the brief survives forever unless explicitly regenerated.
  if (!opts?.force) {
    const cached = parseDemoBrief(p.demoBrief ?? null)
    if (cached) return cached
  }
  if (!aiConfigured()) return null

  const prompt = buildDemoBriefPrompt({
    name: p.name,
    city: p.city,
    state: p.state,
    authorizedOfficialName: p.authorizedOfficialName,
    websiteUrl: p.websiteUrl,
    ratingTenths: p.googleRatingTenths,
    reviewCount: p.reviewCount,
    scoreReasons: Array.isArray(p.scoreReasons) ? (p.scoreReasons as string[]) : [],
    signals: (p.enrichment ?? null) as ProspectCrawlSignals | null,
    verdict: (p.aiVerdict ?? null) as ProspectAiVerdict | null,
  })

  try {
    const raw = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 1600,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      toolName: 'record_demo_brief',
      toolDescription: 'Record the structured pre-demo brief for this practice.',
      inputSchema: {
        type: 'object',
        properties: {
          openingLine: { type: 'string' },
          walkUpStory: { type: 'string' },
          beatEmphasis: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                beatId: { type: 'string' },
                weight: { type: 'string', enum: ['lead', 'standard', 'skim'] },
                why: { type: 'string' },
              },
              required: ['beatId', 'weight', 'why'],
            },
          },
          objections: {
            type: 'array',
            items: {
              type: 'object',
              properties: { objection: { type: 'string' }, response: { type: 'string' } },
              required: ['objection', 'response'],
            },
          },
          ammunition: {
            type: 'array',
            items: {
              type: 'object',
              properties: { beatId: { type: 'string' }, point: { type: 'string' } },
              required: ['beatId', 'point'],
            },
          },
          closingAsk: { type: 'string' },
        },
        required: [
          'openingLine',
          'walkUpStory',
          'beatEmphasis',
          'objections',
          'ammunition',
          'closingAsk',
        ],
      },
    })
    const parsed = briefSchema.safeParse(raw)
    if (!parsed.success) return null

    // Ground the beat references — anything the model invented is dropped.
    const validBeats = new Set(DEMO_BEATS.map((b) => b.id))
    const brief: DemoBrief = {
      version: 1,
      generatedAt: new Date().toISOString(),
      model: 'sonnet',
      ...parsed.data,
      beatEmphasis: parsed.data.beatEmphasis.filter((e) => validBeats.has(e.beatId)),
      ammunition: parsed.data.ammunition.filter((a) => validBeats.has(a.beatId)),
    }

    await db
      .update(schema.prospect)
      .set({ demoBrief: brief, updatedAt: new Date() })
      .where(eq(schema.prospect.id, prospectId))
    await bumpProspectingCounter(counterMonth(), 'ai_brief')
    return brief
  } catch (err) {
    console.warn('[demo-brief] generation failed', err instanceof Error ? err.message : err)
    return null
  }
}
