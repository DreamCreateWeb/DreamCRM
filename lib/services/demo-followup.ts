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
 * The AI post-demo follow-up drafter — the close accelerator. After a demo,
 * the money move is a fast, personalized follow-up; this drafts one from the
 * prospect's real context (their gaps, the objections the pre-demo brief
 * anticipated, and an optional one-line note on how the demo actually went).
 *
 * Owner-initiated (a button in the deal room), NOT the cron engine — so no
 * kill-switch / dry-run gate. Cheap haiku, metered on ai_demo_followup. We
 * NEVER auto-send: the draft is copied into the owner's own inbox. Nothing is
 * stored — it's regenerated each time so the note can steer it fresh.
 */

const draftSchema = z.object({ draft: z.string().min(20).max(2000) })

export type DemoFollowupResult =
  | { ok: true; draft: string }
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
        '\n\nYou draft a short post-demo follow-up email from Dustin at Dream Create to a dental practice he just gave a live demo to. Reinforce the ONE or two things that matter most to THEM (from the gaps/context), quietly reassure the likeliest hesitation, and end with one clear, low-pressure next step (getting started, or answering any lingering questions). Warm, plain, human — no hype, no exclamation marks, no pressure, no fabricated pricing/clients/capabilities beyond the product knowledge. Under 140 words. A greeting line is fine; do NOT add a sign-off (the owner adds his own). If the owner gave a note on how the demo went, let it steer the tone and content.',
      messages: [{ role: 'user', content: facts.join('\n') }],
      toolName: 'write_followup_draft',
      toolDescription: 'Emit the drafted post-demo follow-up email body.',
      inputSchema: {
        type: 'object',
        properties: { draft: { type: 'string' } },
        required: ['draft'],
      },
    })
    const parsed = draftSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'failed' }
    await bumpProspectingCounter(counterMonth(), 'ai_demo_followup')
    return { ok: true, draft: parsed.data.draft.trim().slice(0, 2000) }
  } catch {
    return { ok: false, error: 'failed' }
  }
}
