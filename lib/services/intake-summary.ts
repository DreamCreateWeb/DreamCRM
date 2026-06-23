import 'server-only'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { isAiUsageOverCap, bumpAiUsage } from '@/lib/services/ai-usage'
import {
  buildIntakeTranscript,
  type FormSubmissionData,
  type FormTemplateSchema,
} from '@/lib/types/forms'

/**
 * AI pre-visit summary — turns a completed intake into a one-line summary + a
 * list of medical ALERTS (allergies / medications / conditions / pregnancy /
 * anxiety) for the provider to glance at before the visit. NexHealth surfaces
 * dropdown alerts; this reads the whole form (including free text) and is
 * honest — only what the patient actually reported, never invented.
 *
 * Generated on demand (a staff click), CACHED on the submission row, metered
 * via ai_usage_counter. Best-effort — never throws.
 */

const KIND = 'intake_summary'
const MONTHLY_CAP = 1000

export interface IntakeSummary {
  summary: string
  alerts: string[]
}

const Schema = z.object({
  summary: z.string().max(600),
  alerts: z.array(z.string().max(200)).max(20),
})

export type SummaryResult =
  | { ok: true; summary: IntakeSummary }
  | { ok: false; reason: 'not_configured' | 'no_allowance' | 'not_found' | 'empty' | 'failed' }

/** Read the cached summary, if any. */
export async function getCachedSummary(organizationId: string, submissionId: string): Promise<IntakeSummary | null> {
  const [row] = await db
    .select({ aiSummary: schema.formSubmission.aiSummary })
    .from(schema.formSubmission)
    .where(and(eq(schema.formSubmission.organizationId, organizationId), eq(schema.formSubmission.id, submissionId)))
    .limit(1)
  const parsed = Schema.safeParse(row?.aiSummary)
  return parsed.success ? parsed.data : null
}

/**
 * Generate (or return the cached) pre-visit summary for a submission. Caches on
 * the row. Metered + best-effort.
 */
export async function summarizeSubmission(input: {
  organizationId: string
  submissionId: string
  /** Re-generate even if a cached summary exists. */
  force?: boolean
}): Promise<SummaryResult> {
  const [row] = await db
    .select({
      data: schema.formSubmission.data,
      aiSummary: schema.formSubmission.aiSummary,
      tplSchema: schema.formTemplate.schema,
    })
    .from(schema.formSubmission)
    .innerJoin(schema.formTemplate, eq(schema.formSubmission.formTemplateId, schema.formTemplate.id))
    .where(and(eq(schema.formSubmission.organizationId, input.organizationId), eq(schema.formSubmission.id, input.submissionId)))
    .limit(1)
  if (!row) return { ok: false, reason: 'not_found' }

  if (!input.force) {
    const cached = Schema.safeParse(row.aiSummary)
    if (cached.success) return { ok: true, summary: cached.data }
  }

  if (!aiConfigured()) return { ok: false, reason: 'not_configured' }

  const transcript = buildIntakeTranscript(row.tplSchema as FormTemplateSchema, row.data as FormSubmissionData)
  if (transcript.trim() === '') return { ok: false, reason: 'empty' }

  if (await isAiUsageOverCap(input.organizationId, KIND, MONTHLY_CAP)) return { ok: false, reason: 'no_allowance' }

  const system = `You are a dental clinical assistant preparing a provider for a patient's visit. From the intake answers, produce:
- "alerts": short bullet strings for anything the PROVIDER must know before treating — drug/material allergies, current medications (especially blood thinners, bisphosphonates, immunosuppressants), medical conditions (heart conditions, diabetes, pregnancy), and dental anxiety. One concern per string, concise (e.g. "Allergic to penicillin", "Takes warfarin (blood thinner)", "High dental anxiety — prefers nitrous"). Empty array if nothing notable.
- "summary": ONE plain sentence orienting the provider to this patient.
Rules: Use ONLY what the patient actually reported. NEVER invent allergies, medications, or conditions. Do not include routine/empty answers as alerts. No PHI beyond what's given.`

  let raw: unknown | null
  try {
    raw = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 500,
      system,
      messages: [{ role: 'user', content: `Intake answers:\n\n${transcript}\n\nSummarize for the provider.` }],
      toolName: 'previsit_summary',
      toolDescription: 'Return the pre-visit summary + the alert list.',
      inputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'One sentence orienting the provider.' },
          alerts: { type: 'array', items: { type: 'string' }, description: 'Provider must-knows; empty if none.' },
        },
        required: ['summary', 'alerts'],
      },
    })
  } catch (err) {
    console.warn('[intake-summary.summarizeSubmission] AI call failed', err)
    return { ok: false, reason: 'failed' }
  }

  const parsed = Schema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'failed' }

  await bumpAiUsage(input.organizationId, KIND)
  await db
    .update(schema.formSubmission)
    .set({ aiSummary: parsed.data, aiSummaryAt: new Date() })
    .where(eq(schema.formSubmission.id, input.submissionId))
  return { ok: true, summary: parsed.data }
}
