import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { effectiveProductKnowledge } from '@/lib/prospect-product-knowledge'
import { parseDemoBrief } from '@/lib/types/demo-brief'
import type { ProspectAiVerdict } from '@/lib/types/prospecting'
import { bumpProspectingCounter, counterMonth, getProspectingConfig } from './prospecting'

/**
 * The AI post-demo follow-up drafter + debrief — the close-and-learn
 * accelerator. From the prospect's real context (their gaps, the objections
 * the pre-demo brief anticipated) plus the owner's one-line note on how the
 * demo went, it BOTH drafts a personalized follow-up email AND reads the note
 * for the likely outcome (won / still deciding / a pass + why) — a SUGGESTION
 * the owner confirms with one click, feeding the win/loss learning loop.
 *
 * Owner-initiated (a button in the deal room), NOT the cron engine — so no
 * kill-switch / dry-run gate. Cheap haiku, metered on ai_demo_followup. We
 * NEVER auto-send and NEVER auto-log: the draft is copied into the owner's own
 * inbox, the outcome is a one-click confirm. Nothing is stored — it's
 * regenerated each time so the note can steer it fresh.
 */

/** Outcome the AI reads from the note — a suggestion, never auto-applied. */
export const DEMO_OUTCOMES = ['won', 'lost', 'undecided'] as const
export type DemoOutcome = (typeof DEMO_OUTCOMES)[number]
const LOST_REASONS = ['price', 'using_competitor', 'no_need', 'bad_timing', 'not_decision_maker', 'other'] as const
export type DemoLostReason = (typeof LOST_REASONS)[number]

const draftSchema = z.object({
  draft: z.string().min(20).max(2000),
  outcome: z.enum(DEMO_OUTCOMES).catch('undecided'),
  lostReason: z.enum(LOST_REASONS).nullish(),
})

export type DemoFollowupResult =
  | { ok: true; draft: string; outcome: DemoOutcome; lostReason: DemoLostReason | null }
  | { ok: false; error: 'ai_unavailable' | 'not_found' | 'failed' }

export async function generateDemoFollowup(
  prospectId: string,
  opts?: { note?: string },
): Promise<DemoFollowupResult> {
  if (!aiConfigured()) return { ok: false, error: 'ai_unavailable' }

  const [p] = await db
    .select()
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (!p) return { ok: false, error: 'not_found' }

  const config = await getProspectingConfig().catch(() => null)
  const verdict = (p.aiVerdict ?? null) as ProspectAiVerdict | null
  const gaps = verdict?.weaknesses?.slice(0, 4) ?? []
  const brief = parseDemoBrief(p.demoBrief ?? null)
  // The objections the pre-demo brief anticipated are exactly what a good
  // follow-up should quietly reassure — feed the top few in.
  const objections = (brief?.objections ?? []).slice(0, 3).map((o) => o.objection)
  const note = opts?.note?.trim().slice(0, 500)

  const facts = [
    `Practice: ${p.name ?? 'the practice'}`,
    [p.city, p.state].filter(Boolean).length ? `Location: ${[p.city, p.state].filter(Boolean).join(', ')}` : '',
    p.authorizedOfficialName ? `Owner / contact: ${p.authorizedOfficialName}` : '',
    p.websiteUrl ? `Current website: ${p.websiteUrl}` : 'They have no website.',
    typeof p.reviewCount === 'number' ? `Google reviews: ${p.reviewCount}` : '',
    gaps.length ? `Gaps we can solve for them: ${gaps.join('; ')}` : '',
    objections.length ? `Likely hesitations to reassure: ${objections.join('; ')}` : '',
    note ? `How the demo actually went (owner's note — weight this heavily): ${note}` : '',
  ].filter(Boolean)

  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 600,
      system:
        effectiveProductKnowledge(config?.brain ?? null, { short: true }) +
        "\n\nYou do two things for a dental practice Dustin at Dream Create just gave a live demo to.\n1) DRAFT a short post-demo follow-up email from Dustin. Reinforce the ONE or two things that matter most to THEM (from the gaps/context), quietly reassure the likeliest hesitation, and end with one clear, low-pressure next step (getting started, or answering any lingering questions). Warm, plain, human — no hype, no exclamation marks, no pressure, no fabricated pricing/clients/capabilities beyond the product knowledge. Under 140 words. A greeting line is fine; do NOT add a sign-off (the owner adds his own).\n2) READ the owner's note (if any) for the likely OUTCOME: 'won' only if they clearly signed up / committed; 'lost' if they clearly passed; otherwise 'undecided'. When lost, set lostReason to the best fit (price, using_competitor, no_need, bad_timing, not_decision_maker, other). With NO note, or anything ambiguous, use 'undecided' and omit lostReason. Never overclaim a win — 'interested' or 'thinking about it' is undecided, not won.",
      messages: [{ role: 'user', content: facts.join('\n') }],
      toolName: 'write_followup_and_read_outcome',
      toolDescription: 'Emit the drafted follow-up email plus the outcome read from the note.',
      inputSchema: {
        type: 'object',
        properties: {
          draft: { type: 'string', description: 'The follow-up email body.' },
          outcome: {
            type: 'string',
            enum: ['won', 'lost', 'undecided'],
            description: "The outcome read from the owner's note; 'undecided' when unclear or no note.",
          },
          lostReason: {
            type: 'string',
            enum: [...LOST_REASONS],
            description: "Only when outcome is 'lost' — the best-fit reason.",
          },
        },
        required: ['draft', 'outcome'],
      },
    })
    const parsed = draftSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'failed' }
    await bumpProspectingCounter(counterMonth(), 'ai_demo_followup')
    const outcome = parsed.data.outcome
    return {
      ok: true,
      draft: parsed.data.draft.trim().slice(0, 2000),
      outcome,
      lostReason: outcome === 'lost' ? parsed.data.lostReason ?? 'other' : null,
    }
  } catch {
    return { ok: false, error: 'failed' }
  }
}
