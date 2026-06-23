import 'server-only'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { isAiUsageOverCap, bumpAiUsage } from '@/lib/services/ai-usage'
import {
  extractTranslatableStrings,
  type FormTemplateSchema,
  type FormTranslationMap,
  type FormTranslations,
} from '@/lib/types/forms'

/** Stable, dependency-free hash of the source strings (FNV-1a over the
 *  serialized {key,text} list) — lets a re-run on an unchanged form skip the
 *  model. Exported for the cache-hit test. */
export function sourceStringsHash(strings: Array<{ key: string; text: string }>): string {
  const s = JSON.stringify(strings)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/**
 * AI translation of a form's display strings into Spanish (the one non-English
 * locale US dental needs most). Admin-triggered + cached on the template, so
 * the public form never makes an AI call and there's no patient-facing latency.
 * Stored as a flat { key → translated } map so a partial result still renders
 * (missing keys fall back to English). Metered; best-effort.
 */

const KIND = 'form_translate'
const MONTHLY_CAP = 200

const ResultSchema = z.object({
  items: z.array(z.object({ key: z.string(), es: z.string() })).max(500),
})

export type TranslateResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'not_configured' | 'no_allowance' | 'not_found' | 'empty' | 'failed' }

/**
 * Generate (and cache) the Spanish translation for a form. Re-runnable
 * (overwrites the cached map). Returns the number of strings translated.
 */
export async function generateFormTranslation(input: {
  organizationId: string
  templateId: string
  locale?: 'es'
  /** Re-translate even if the cached map already matches the current form. */
  force?: boolean
}): Promise<TranslateResult> {
  const locale = input.locale ?? 'es'
  const [tpl] = await db
    .select({ schema: schema.formTemplate.schema, translations: schema.formTemplate.translations, title: schema.formTemplate.title })
    .from(schema.formTemplate)
    .where(and(eq(schema.formTemplate.organizationId, input.organizationId), eq(schema.formTemplate.id, input.templateId)))
    .limit(1)
  if (!tpl) return { ok: false, reason: 'not_found' }

  const strings = extractTranslatableStrings(tpl.schema as FormTemplateSchema)
  if (strings.length === 0) return { ok: false, reason: 'empty' }

  // Already translated this exact set of strings? Return the cached map — no
  // model call, no allowance burn (a re-click / idempotent save is free). A
  // genuine form edit changes the hash and falls through to re-translate.
  const existing = (tpl.translations as FormTranslations | null) ?? null
  const srcHash = sourceStringsHash(strings)
  if (!input.force) {
    const cachedMap = existing?.[locale]
    if (cachedMap && existing?.src?.[locale] === srcHash) {
      return { ok: true, count: Object.keys(cachedMap).length }
    }
  }

  if (!aiConfigured()) return { ok: false, reason: 'not_configured' }
  if (await isAiUsageOverCap(input.organizationId, KIND, MONTHLY_CAP)) return { ok: false, reason: 'no_allowance' }

  const system = `You translate a dental practice's patient intake form into natural, warm, patient-friendly LATIN AMERICAN SPANISH. You are given a list of strings, each with a stable "key". Translate the "text" of each into Spanish and return it under the same key.
Rules:
- Keep medical/dental meaning precise; use everyday Spanish a patient understands (not clinical jargon).
- Preserve any {firstName}/{city} style tokens and punctuation exactly.
- Do NOT translate brand/clinic names.
- Return EVERY key you were given, exactly once.`

  let raw: unknown | null
  try {
    raw = await runClaudeJson({
      // Haiku handles warm patient-facing translation well; admin-triggered +
      // cached (so low volume), spot-checkable, and partials fall back to
      // English. ~3x cheaper than Sonnet.
      model: 'haiku',
      maxTokens: 4000,
      system,
      messages: [{ role: 'user', content: `Translate each to Spanish:\n${JSON.stringify(strings)}` }],
      toolName: 'translation',
      toolDescription: 'Return the Spanish translation for every key.',
      inputSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { key: { type: 'string' }, es: { type: 'string' } },
              required: ['key', 'es'],
            },
          },
        },
        required: ['items'],
      },
    })
  } catch (err) {
    console.warn('[form-translate.generateFormTranslation] AI call failed', err)
    return { ok: false, reason: 'failed' }
  }

  const parsed = ResultSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'failed' }

  // Build the map, keeping only keys that exist in the source (drop hallucinated keys).
  const validKeys = new Set(strings.map((s) => s.key))
  const map: FormTranslationMap = {}
  for (const item of parsed.data.items) {
    if (validKeys.has(item.key) && item.es.trim() !== '') map[item.key] = item.es
  }
  if (Object.keys(map).length === 0) return { ok: false, reason: 'failed' }

  const next: FormTranslations = {
    ...(existing ?? {}),
    [locale]: map,
    src: { ...(existing?.src ?? {}), [locale]: srcHash },
  }
  await bumpAiUsage(input.organizationId, KIND)
  await db
    .update(schema.formTemplate)
    .set({ translations: next, updatedAt: new Date() })
    .where(eq(schema.formTemplate.id, input.templateId))
  return { ok: true, count: Object.keys(map).length }
}
