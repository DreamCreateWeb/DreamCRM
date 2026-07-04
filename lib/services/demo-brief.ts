import 'server-only'
import { eq } from 'drizzle-orm'
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
 *
 * We normalize the model's raw tool output through parseDemoBrief (the same
 * tolerant clamp/slice parser the read path uses) rather than a strict schema
 * — a model that writes an 1100-char walk-up story should get trimmed, not
 * rejected into a silent "generation failed".
 */

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
      maxTokens: 2600, // headroom so a rich brief never truncates mid-tool-call
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      toolName: 'record_demo_brief',
      toolDescription: 'Record the structured pre-demo brief for this practice.',
      // maxLength / maxItems steer the model to concise, on-call-length copy —
      // both so it reads well aloud AND so the output stays well within budget.
      inputSchema: {
        type: 'object',
        properties: {
          openingLine: { type: 'string', maxLength: 280, description: 'One quotable sentence to open the call.' },
          walkUpStory: { type: 'string', maxLength: 700, description: '2-4 sentences on what their online presence says today.' },
          beatEmphasis: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'object',
              properties: {
                beatId: { type: 'string' },
                weight: { type: 'string', enum: ['lead', 'standard', 'skim'] },
                why: { type: 'string', maxLength: 180 },
              },
              required: ['beatId', 'weight', 'why'],
            },
          },
          objections: {
            type: 'array',
            maxItems: 5,
            description: 'The 3-5 most likely objections for this practice.',
            items: {
              type: 'object',
              properties: {
                objection: { type: 'string', maxLength: 180 },
                response: { type: 'string', maxLength: 360, description: 'A one-breath response.' },
              },
              required: ['objection', 'response'],
            },
          },
          ammunition: {
            type: 'array',
            maxItems: 6,
            items: {
              type: 'object',
              properties: { beatId: { type: 'string' }, point: { type: 'string', maxLength: 180 } },
              required: ['beatId', 'point'],
            },
          },
          closingAsk: { type: 'string', maxLength: 280 },
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
    // Normalize through the tolerant parser (clamps over-long strings, slices
    // arrays, coerces bad weights) instead of hard-rejecting. Only truly
    // unusable output (missing the core lines) returns null.
    const normalized = parseDemoBrief({
      ...(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}),
      generatedAt: new Date().toISOString(),
    })
    if (!normalized) {
      console.warn('[demo-brief] AI output missing core fields', {
        keys: raw && typeof raw === 'object' ? Object.keys(raw as object) : typeof raw,
      })
      return null
    }
    // Ground the beat references — anything the model invented is dropped.
    const validBeats = new Set(DEMO_BEATS.map((b) => b.id))
    const brief: DemoBrief = {
      ...normalized,
      beatEmphasis: normalized.beatEmphasis.filter((e) => validBeats.has(e.beatId)),
      ammunition: normalized.ammunition.filter((a) => validBeats.has(a.beatId)),
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
