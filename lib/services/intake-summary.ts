import 'server-only'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { aiUsageCounter } from '@/lib/db/schema/platform'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { newId } from '@/lib/utils'
import {
  isDisplayOnlyField,
  isFileRefArray,
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

function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

async function overCap(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: aiUsageCounter.count })
    .from(aiUsageCounter)
    .where(and(eq(aiUsageCounter.organizationId, orgId), eq(aiUsageCounter.period, currentPeriod()), eq(aiUsageCounter.kind, KIND)))
    .limit(1)
  return (row?.count ?? 0) >= MONTHLY_CAP
}

async function bump(orgId: string): Promise<void> {
  await db
    .insert(aiUsageCounter)
    .values({ id: newId('aiu'), organizationId: orgId, period: currentPeriod(), kind: KIND, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsageCounter.organizationId, aiUsageCounter.period, aiUsageCounter.kind],
      set: { count: sql`${aiUsageCounter.count} + 1`, updatedAt: new Date() },
    })
}

/** Render the answers as a "Label: value" transcript for the model, skipping
 *  display-only blocks, uploads, and signatures (no clinical signal). */
export function buildIntakeTranscript(schemaObj: FormTemplateSchema, data: FormSubmissionData): string {
  const lines: string[] = []
  for (const section of schemaObj?.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (isDisplayOnlyField(field) || field.type === 'signature' || field.type === 'file' || field.type === 'insurance_card') {
        continue
      }
      const v = data?.[field.id]
      if (v === undefined || v === null || v === '' || isFileRefArray(v)) continue
      let text: string
      if (Array.isArray(v)) text = v.join(', ')
      else if (typeof v === 'boolean') text = v ? 'Yes' : 'No'
      else text = String(v)
      if (text.trim() === '') continue
      lines.push(`${field.label}: ${text}`)
    }
  }
  return lines.join('\n')
}

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

  if (await overCap(input.organizationId)) return { ok: false, reason: 'no_allowance' }

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

  await bump(input.organizationId)
  await db
    .update(schema.formSubmission)
    .set({ aiSummary: parsed.data, aiSummaryAt: new Date() })
    .where(eq(schema.formSubmission.id, input.submissionId))
  return { ok: true, summary: parsed.data }
}
