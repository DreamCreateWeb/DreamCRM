import 'server-only'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { aiUsageCounter } from '@/lib/db/schema/platform'
import { runClaudeVisionJson, aiConfigured } from '@/lib/ai'
import { newId } from '@/lib/utils'

/**
 * Insurance-card OCR auto-fill — the headline differentiator (no dental-forms
 * vendor parses the card; they only store the image). A patient photographs the
 * front + back on the intake form; Claude vision reads the carrier / member id /
 * group / plan / subscriber, which pre-fills the insurance fields for the patient
 * to CONFIRM (never trusted blindly — "we read what we can, please check").
 *
 * Metered via the shared ai_usage_counter under a distinct kind. The endpoint is
 * public (patients trigger it), so the per-org monthly cap is the abuse guard;
 * best-effort — never throws.
 */

const KIND = 'insurance_ocr'
/** Generous per-org monthly cap — well above a busy practice's new-patient
 *  volume, low enough to bound abuse of the public endpoint. */
const MONTHLY_CAP = 400

function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

async function usageThisMonth(orgId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ count: aiUsageCounter.count })
    .from(aiUsageCounter)
    .where(
      and(
        eq(aiUsageCounter.organizationId, orgId),
        eq(aiUsageCounter.period, currentPeriod(now)),
        eq(aiUsageCounter.kind, KIND),
      ),
    )
    .limit(1)
  return row?.count ?? 0
}

async function bumpUsage(orgId: string, now: Date = new Date()): Promise<void> {
  await db
    .insert(aiUsageCounter)
    .values({ id: newId('aiu'), organizationId: orgId, period: currentPeriod(now), kind: KIND, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsageCounter.organizationId, aiUsageCounter.period, aiUsageCounter.kind],
      set: { count: sql`${aiUsageCounter.count} + 1`, updatedAt: new Date() },
    })
}

/** The fields we try to read off a dental insurance card. */
export interface InsuranceCardFields {
  provider: string | null
  memberId: string | null
  groupNumber: string | null
  planName: string | null
  subscriberName: string | null
}

const Schema = z.object({
  provider: z.string().max(120).nullable().optional(),
  memberId: z.string().max(60).nullable().optional(),
  groupNumber: z.string().max(60).nullable().optional(),
  planName: z.string().max(120).nullable().optional(),
  subscriberName: z.string().max(120).nullable().optional(),
})

export type OcrResult =
  | { ok: true; fields: InsuranceCardFields }
  | { ok: false; reason: 'not_configured' | 'no_allowance' | 'no_images' | 'failed' }

function clean(v: string | null | undefined): string | null {
  const s = (v ?? '').trim()
  return s.length === 0 ? null : s
}

/**
 * Read a dental insurance card. `imageUrls` are the public S3 URLs the patient
 * just uploaded (front, and optionally back). Best-effort; never throws.
 */
export async function readInsuranceCard(input: {
  organizationId: string
  imageUrls: string[]
}): Promise<OcrResult> {
  if (!aiConfigured()) return { ok: false, reason: 'not_configured' }

  const images = input.imageUrls.filter((u) => /^https?:\/\//i.test(u)).slice(0, 2)
  if (images.length === 0) return { ok: false, reason: 'no_images' }

  if ((await usageThisMonth(input.organizationId)) >= MONTHLY_CAP) {
    return { ok: false, reason: 'no_allowance' }
  }

  const system = `You read dental insurance cards. You will be shown the front and/or back of one patient's insurance card. Extract ONLY the fields you can clearly see. Rules:
- Return null for any field you cannot read with confidence — NEVER guess or invent a value.
- "provider" = the insurance carrier / company name (e.g. "Delta Dental", "Cigna", "MetLife").
- "memberId" = the subscriber/member ID or policy number (the primary id used to look the patient up).
- "groupNumber" = the group or plan group number, if present.
- "planName" = the named plan/network if shown (e.g. "PPO", "Premier").
- "subscriberName" = the primary subscriber's name if printed on the card.
- Transcribe ids EXACTLY as printed, preserving letters, digits, and dashes. Do not include labels like "ID:" in the value.`

  let raw: unknown | null
  try {
    raw = await runClaudeVisionJson({
      model: 'sonnet',
      maxTokens: 400,
      system,
      text: 'Read this dental insurance card and return the fields you can clearly see.',
      imageUrls: images,
      toolName: 'insurance_card',
      toolDescription: 'Return the fields read from the insurance card; null for anything not clearly legible.',
      inputSchema: {
        type: 'object',
        properties: {
          provider: { type: ['string', 'null'], description: 'Insurance carrier / company name.' },
          memberId: { type: ['string', 'null'], description: 'Member / subscriber / policy ID, exactly as printed.' },
          groupNumber: { type: ['string', 'null'], description: 'Group number if present.' },
          planName: { type: ['string', 'null'], description: 'Plan / network name if shown.' },
          subscriberName: { type: ['string', 'null'], description: 'Primary subscriber name if printed.' },
        },
        required: [],
      },
    })
  } catch (err) {
    console.warn('[insurance-ocr.readInsuranceCard] vision call failed', err)
    return { ok: false, reason: 'failed' }
  }

  const parsed = Schema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'failed' }

  await bumpUsage(input.organizationId)
  return {
    ok: true,
    fields: {
      provider: clean(parsed.data.provider),
      memberId: clean(parsed.data.memberId),
      groupNumber: clean(parsed.data.groupNumber),
      planName: clean(parsed.data.planName),
      subscriberName: clean(parsed.data.subscriberName),
    },
  }
}
