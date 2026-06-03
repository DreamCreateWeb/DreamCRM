import 'server-only'
import { z } from 'zod'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { slugify } from '@/lib/utils'
import type {
  ClinicService,
  ClinicServiceCustomization,
  ServiceCategory,
  ServiceFaqItem,
  ServiceLibraryEntry,
  ServiceProcessStep,
} from '@/lib/types/clinic-content'

/**
 * AI assist for the Tend-clone service library (Checkpoint 1B). Two
 * generation paths + one small resolver helper:
 *
 * - `customizeServiceForClinic(library, clinic)` — rewrites a canonical
 *   library entry's hero bullets / body / process steps / FAQ in the
 *   clinic's voice + locale. Generated at the moment a clinic picks the
 *   service, persisted on `clinic_profile.services[i].customized`,
 *   regeneratable from the settings UI.
 *
 * - `vetAndCleanNewService(submission, existing)` — validates a clinic-
 *   submitted "we offer this and you don't have it" entry. Either rejects
 *   it (not a real dental service), points the clinic at an existing
 *   entry (dedupe — semantic match), or returns a polished full
 *   `ServiceLibraryEntry` shape that lands in the library with
 *   `status='pending'` until a platform admin approves.
 *
 * - `getCustomizationForClinicService(clinicService, library, clinic)` —
 *   tiny helper used by the resolver. Returns the existing customization
 *   when present + still valid (links to a known library entry), else null
 *   so the resolver falls back to the 1A token-substitution path.
 *
 * Both async paths return discriminated union results — `{ ok: true; ... }`
 * vs `{ ok: false; error }` — so callers (server actions, UI) can render
 * polite errors without try/catch noise. ALL errors are caught here; this
 * module never throws.
 *
 * No fabricated pricing anywhere — the system prompts pin this hard. Cost
 * FAQs describe the estimate-first process honestly, never invent dollar
 * figures. Anti-shame warm voice per DESIGN.md.
 */

const MODEL_ID = 'claude-sonnet-4-6'

// ─────────────────────────────────────────────────────────────────────────────
// Shared brand-voice frame.
// ─────────────────────────────────────────────────────────────────────────────

export const CORE_VOICE_RULES = `Voice rules (non-negotiable):
- Warm, calm, plain-spoken. Anti-shame: "no judgment, you're welcome here".
- Short sentences. Plain words. First-person plural ("we", "our team") for the clinic.
- NO marketing-bro vocabulary: never use "revolutionary", "game-changing", "state-of-the-art", "world-class", "supercharge", "unlock", "10x", "next-level", "synergy", "leverage", "cutting-edge".
- NO exclamation marks. NO emoji.
- NEVER invent statistics, study citations, success rates, or specific medical claims.
- NEVER invent a dollar figure for cost. If a question is about cost, describe the estimate-first process honestly: insurance gets checked first, the clinic gives an itemized estimate before treatment begins, no surprises. Point at the clinic for the real number.
- Avoid absolute claims like "painless", "guaranteed", "100%". Use "comfortable", "most people", "we'll keep you comfortable".`

// ─────────────────────────────────────────────────────────────────────────────
// 1. customizeServiceForClinic — rewrites a canonical entry for one clinic.
// ─────────────────────────────────────────────────────────────────────────────

const PROCESS_STEP = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(800),
})

const FAQ_ITEM = z.object({
  question: z.string().min(1).max(240),
  answer: z.string().min(1).max(1200),
})

const CustomizationSchema = z.object({
  heroBullets: z.array(z.string().min(1).max(120)).min(3).max(5),
  body: z.string().min(1).max(2000),
  processSteps: z.array(PROCESS_STEP).min(1).max(6),
  faq: z.array(FAQ_ITEM).min(1).max(8),
})

const CUSTOMIZATION_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    heroBullets: {
      type: 'array',
      description:
        'Three to five short benefit bullets for the detail hero. Each under 90 characters. Concrete, scannable, no marketing-bro vocabulary.',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 5,
    },
    body: {
      type: 'string',
      description:
        'Two to three sentence paragraph describing this service at this clinic. Reference the clinic and city naturally — already substituted, do not use the literal tokens. Warm, anti-shame, no jargon.',
    },
    processSteps: {
      type: 'array',
      description:
        'Match the canonical entry exactly: same number of steps. Rewrite each step\'s title (under 60 chars) and body (1-2 sentences) in the clinic\'s voice. Keep the original logical sequence.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Step title, under 60 characters.' },
          body: { type: 'string', description: '1-2 sentence step description.' },
        },
        required: ['title', 'body'],
      },
    },
    faq: {
      type: 'array',
      description:
        'Match the canonical entry exactly: same number of FAQs, same topics (rewrite the question phrasing if you want, but keep the topic). If a question is about cost or pricing, NEVER invent a dollar figure — describe the estimate-first process: insurance checked first, itemized estimate before treatment, no surprises.',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'FAQ question.' },
          answer: { type: 'string', description: 'FAQ answer, 1-3 sentences.' },
        },
        required: ['question', 'answer'],
      },
    },
  },
  required: ['heroBullets', 'body', 'processSteps', 'faq'],
}

const CUSTOMIZATION_SYSTEM = `You rewrite the canonical, platform-owned copy for a single dental service so it speaks in one specific clinic's voice + locale, while keeping the same factual structure.

You will be given:
- the canonical entry (hero bullets, body, process steps, FAQ)
- a clinic context (name, city, tagline, about paragraph, brand voice)

You must call the emit_service_customization tool with the rewritten content. Match the canonical entry's process-step count and FAQ count EXACTLY — same number of steps, same number of FAQs, same topics in the same order. Rewrite each into the clinic's voice and reference the clinic + city naturally in at least the body paragraph (do not use the literal "{clinic}" or "{city}" tokens — they're already substituted in the inputs you receive).

${CORE_VOICE_RULES}

If the brand voice is "family", lean a touch warmer + more parent-friendly. "modern" = clean, minimal, calmly professional. "warm" = the default. Do not invent new claims, new statistics, or new procedures the canonical entry does not mention.`

export type CustomizeResult =
  | { ok: true; customization: ClinicServiceCustomization }
  | { ok: false; error: string }

export interface CustomizeClinicContext {
  name: string
  city?: string | null
  tagline?: string | null
  about?: string | null
  brandVoice?: 'warm' | 'modern' | 'family'
}

/** Replace `{clinic}` / `{city}` tokens in a single canonical string before
 *  handing it to the model. Mirrors the 1A `tokenize` shape so the AI sees
 *  the same substituted-canonical inputs the public site renders today. */
function fillTokens(text: string, ctx: CustomizeClinicContext): string {
  const city = ctx.city?.trim() || 'our area'
  return text
    .replace(/\{\s*clinic\s*\}/gi, ctx.name)
    .replace(/\{\s*city\s*\}/gi, city)
}

/**
 * Rewrite a canonical library entry into per-clinic copy. Returns the
 * customization blob (callers persist onto `clinic_profile.services[i].customized`)
 * or a `{ ok: false }` with a polite error. Never throws.
 */
export async function customizeServiceForClinic(
  library: ServiceLibraryEntry,
  clinic: CustomizeClinicContext,
): Promise<CustomizeResult> {
  if (!aiConfigured()) {
    return { ok: false, error: 'AI is not configured on this environment' }
  }

  const tokCtx = clinic
  const canonical = {
    name: library.name,
    shortDescription: fillTokens(library.shortDescription ?? '', tokCtx),
    heroBullets: (library.heroBullets ?? []).map((b) => fillTokens(b, tokCtx)),
    body: fillTokens(library.body ?? '', tokCtx),
    processSteps: (library.processSteps ?? []).map((s) => ({
      title: fillTokens(s.title, tokCtx),
      body: fillTokens(s.body, tokCtx),
    })),
    faq: (library.faq ?? []).map((f) => ({
      question: fillTokens(f.question, tokCtx),
      answer: fillTokens(f.answer, tokCtx),
    })),
  }

  const clinicBlock = JSON.stringify(
    {
      name: clinic.name,
      city: clinic.city ?? null,
      tagline: clinic.tagline ?? null,
      about: clinic.about ? clinic.about.slice(0, 1200) : null,
      brandVoice: clinic.brandVoice ?? 'warm',
    },
    null,
    2,
  )

  const userPrompt = `Rewrite this canonical service entry in the voice of this clinic. Keep the same process-step count and same FAQ count + topics. Reply by calling the emit_service_customization tool.

<clinic>
${clinicBlock}
</clinic>

<canonical_entry>
${JSON.stringify(canonical, null, 2)}
</canonical_entry>`

  try {
    const input = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 3500,
      system: CUSTOMIZATION_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
      toolName: 'emit_service_customization',
      toolDescription:
        'Return the rewritten service content for this specific clinic, matching the canonical structure.',
      inputSchema: CUSTOMIZATION_TOOL_SCHEMA,
    })
    if (!input) {
      return { ok: false, error: 'AI returned no content — try again' }
    }
    const safeParsed = CustomizationSchema.safeParse(input)
    if (!safeParsed.success) {
      console.warn(
        '[ai.service-library.customize] validation failed:',
        safeParsed.error.message,
      )
      return { ok: false, error: 'model output failed validation' }
    }
    const parsed = safeParsed.data
    return {
      ok: true,
      customization: {
        heroBullets: parsed.heroBullets,
        body: parsed.body,
        processSteps: parsed.processSteps,
        faq: parsed.faq,
        generatedAt: new Date().toISOString(),
        modelId: MODEL_ID,
      },
    }
  } catch (err) {
    console.warn('[ai.service-library.customize] failed:', (err as Error).message)
    return { ok: false, error: 'AI request failed — please try again' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. vetAndCleanNewService — validates + dedupes + cleans a clinic submission.
// ─────────────────────────────────────────────────────────────────────────────

const CategoryEnum = z.enum(['core', 'special'])

const FullEntrySchema = z.object({
  slug: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  category: CategoryEnum,
  icon: z.string().min(1).max(8),
  shortDescription: z.string().min(1).max(280),
  heroBullets: z.array(z.string().min(1).max(120)).min(3).max(4),
  body: z.string().min(1).max(1200),
  processSteps: z.array(PROCESS_STEP).min(4).max(4),
  faq: z.array(FAQ_ITEM).min(5).max(6),
  relatedSlugs: z.array(z.string()).max(3).default([]),
})

const VetToolInputSchema = z.object({
  kind: z.enum(['new', 'duplicate', 'invalid']),
  note: z.string().max(400).optional().default(''),
  existingSlug: z.string().optional().default(''),
  entry: FullEntrySchema.optional(),
  suggestedRelated: z.array(z.string()).max(3).optional().default([]),
})

const VET_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['new', 'duplicate', 'invalid'],
      description:
        '"invalid" if the submission is not a legitimate dental service (gibberish, off-topic, just a product name like "Crest", a generic word like "smile"). "duplicate" if the submission semantically matches an existing library entry already in the list (e.g. "Same Day Crowns" ↔ a same-day-crown entry, "Zoom Whitening" ↔ "Teeth Whitening"). "new" if the submission is a real, distinct dental service not already in the library.',
    },
    note: {
      type: 'string',
      description:
        'For "invalid", the reason (one sentence). For "duplicate", which existing entry it matched and why. For "new", a short reason it is distinct from anything in the library. Plain text, under 400 chars.',
    },
    existingSlug: {
      type: 'string',
      description:
        'For "duplicate" only: the slug from the existing library entry the submission maps to. Must be an EXACT slug from the existing list. Empty otherwise.',
    },
    entry: {
      type: 'object',
      description:
        'For "new" only: the cleaned, expanded library entry. Omit for "invalid" and "duplicate".',
      properties: {
        slug: {
          type: 'string',
          description:
            'kebab-case slug, lowercase, unique vs the existing list. 2-60 chars.',
        },
        name: { type: 'string', description: 'Cleaned, title-cased service name.' },
        category: {
          type: 'string',
          enum: ['core', 'special'],
          description:
            '"core" = mainstream services any family practice offers (exams, cleanings, fillings, basic cosmetic). "special" = specialized procedures (oral surgery, sedation, sleep apnea therapy, perio).',
        },
        icon: {
          type: 'string',
          description: 'A single fitting emoji glyph. 1-4 chars. Examples: 🦷 ✨ 🚨 🪥.',
        },
        shortDescription: {
          type: 'string',
          description: 'One sentence card one-liner. Plain. Under 200 chars.',
        },
        heroBullets: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 4,
          description: '3-4 short benefit bullets, each under 90 chars.',
        },
        body: {
          type: 'string',
          description:
            '2-3 sentence description paragraph. UNIVERSAL voice — write for any clinic in any city. Do NOT name a specific clinic or city. The per-clinic AI rewrite runs later.',
        },
        processSteps: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          description: 'EXACTLY 4 numbered "what to expect" steps.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['title', 'body'],
          },
        },
        faq: {
          type: 'array',
          minItems: 5,
          maxItems: 6,
          description:
            '5-6 FAQ entries. Must include a cost/pricing question whose answer describes the estimate-first process and never invents a dollar figure.',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              answer: { type: 'string' },
            },
            required: ['question', 'answer'],
          },
        },
        relatedSlugs: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
          description:
            '0-3 slugs from the existing library that are plausibly related. Must be EXACT slugs from the existing list. Empty array if none fit.',
        },
      },
      required: [
        'slug',
        'name',
        'category',
        'icon',
        'shortDescription',
        'heroBullets',
        'body',
        'processSteps',
        'faq',
      ],
    },
    suggestedRelated: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 3,
      description:
        'For "new" only: same as entry.relatedSlugs. (Duplicate field — pickers may surface this alongside the picker UI.)',
    },
  },
  required: ['kind', 'note'],
}

const VET_SYSTEM = `You vet a service that a dental clinic wants to add to a shared, platform-owned service library. You must call the emit_vet_result tool to return your decision.

Your job is one of three outcomes:

1. INVALID — the submission is not a legitimate dental service. Gibberish, a product brand name with no procedure context (e.g. just "Crest"), a generic noun ("smile", "healthy"), an unrelated topic (e.g. plumbing). Call the tool with kind="invalid" and a short reason in note.

2. DUPLICATE — the submission semantically maps to an entry that already exists in the supplied list. Common-name variants count as duplicates (e.g. "Zoom Whitening" ↔ "Teeth Whitening"; "Same-Day Crowns" ↔ a "Restorations" or "Crowns" entry; "Invisalign" ↔ "Invisalign & Clear Aligners"). Call kind="duplicate", set existingSlug to the EXACT slug from the existing list, explain the match in note.

3. NEW — a real, distinct dental service not in the existing list. Call kind="new", fill the entry object with all required fields. Write in UNIVERSAL voice — write for ANY clinic in ANY city. Do NOT name a specific clinic, doctor, or city in the entry. Per-clinic personalization runs LATER through a separate AI step. Pick relatedSlugs ONLY from the supplied existing list of slugs; if nothing fits, leave it empty.

${CORE_VOICE_RULES}

Category guidance:
- "core" = mainstream services any family practice offers (exams, cleanings, simple fillings, basic cosmetic, hygiene).
- "special" = specialized procedures with extra training or equipment (oral surgery, IV sedation, perio, endodontics, sleep apnea therapy, orthodontics handled in-house).

Slug discipline:
- Kebab-case, lowercase, no leading/trailing dashes.
- Unique vs the existing list.
- Stable: pick a slug that won't need to change if the clinic re-words the name later.

Do NOT include clinic-specific medical claims, statistics, or specific success rates.`

export type VetResult =
  | { ok: true; kind: 'new'; entry: ServiceLibraryEntry; suggestedRelated: string[]; note?: string }
  | { ok: true; kind: 'duplicate'; existingSlug: string; note?: string }
  | { ok: false; error: string }

function normalizeSubmissionForPrompt(submission: { name: string; description?: string }): string {
  return JSON.stringify(
    {
      name: submission.name.trim(),
      description: submission.description?.trim() || null,
    },
    null,
    2,
  )
}

function buildExistingSummary(existing: ServiceLibraryEntry[]): string {
  return JSON.stringify(
    existing.map((e) => ({
      slug: e.slug,
      name: e.name,
      category: e.category,
      shortDescription: e.shortDescription,
    })),
    null,
    2,
  )
}

/**
 * Validate + dedupe + clean a clinic-submitted new service. The model
 * returns one of three outcomes — invalid (reject), duplicate (point at the
 * existing slug), new (full ServiceLibraryEntry). Never throws.
 */
export async function vetAndCleanNewService(
  submission: { name: string; description?: string },
  existing: ServiceLibraryEntry[],
): Promise<VetResult> {
  if (!aiConfigured()) {
    return { ok: false, error: 'AI is not configured on this environment' }
  }
  const name = submission.name.trim()
  if (!name) {
    return { ok: false, error: 'A service name is required' }
  }
  if (name.length > 120) {
    return { ok: false, error: 'Service name is too long' }
  }

  const userPrompt = `Vet the dental service the clinic wants to add. Decide: invalid, duplicate, or new. Reply by calling the emit_vet_result tool.

<existing_library>
${buildExistingSummary(existing)}
</existing_library>

<submission>
${normalizeSubmissionForPrompt(submission)}
</submission>`

  let input: unknown
  try {
    input = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 4000,
      system: VET_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
      toolName: 'emit_vet_result',
      toolDescription:
        'Return the vetting decision for the clinic-submitted service: invalid, duplicate (with existingSlug), or new (with the full cleaned entry).',
      inputSchema: VET_TOOL_SCHEMA,
    })
  } catch (err) {
    console.warn('[ai.service-library.vet] runtime failed:', (err as Error).message)
    return { ok: false, error: 'AI request failed — please try again' }
  }
  if (!input) {
    return { ok: false, error: 'AI returned no content — try again' }
  }

  const safeParsed = VetToolInputSchema.safeParse(input)
  if (!safeParsed.success) {
    console.warn(
      '[ai.service-library.vet] parse failed:',
      safeParsed.error.message,
    )
    return { ok: false, error: 'model output failed validation' }
  }
  const parsed = safeParsed.data

  if (parsed.kind === 'invalid') {
    return {
      ok: false,
      error: parsed.note || "That doesn't look like a recognized dental service",
    }
  }

  if (parsed.kind === 'duplicate') {
    const existingSlug = parsed.existingSlug.trim()
    if (!existingSlug) {
      return { ok: false, error: 'model flagged duplicate but did not name a slug' }
    }
    // Defense in depth — only return duplicate if the slug is actually in
    // the supplied list. Hallucinated slugs become "AI request failed".
    if (!existing.some((e) => e.slug === existingSlug)) {
      return {
        ok: false,
        error: 'model named a duplicate slug that does not exist — please try again',
      }
    }
    return { ok: true, kind: 'duplicate', existingSlug, note: parsed.note }
  }

  // kind === 'new'
  if (!parsed.entry) {
    return { ok: false, error: 'model returned "new" but did not provide the entry' }
  }
  const candidate = parsed.entry
  // Normalize the slug ourselves — slugify guarantees the kebab-case shape
  // we want and avoids the model accidentally returning spaces or caps.
  const cleanedSlug = slugify(candidate.slug || candidate.name)
  if (!cleanedSlug) {
    return { ok: false, error: 'could not derive a slug from the submission' }
  }
  if (existing.some((e) => e.slug === cleanedSlug)) {
    // The model declared the entry "new" but the slug already exists. Treat
    // as a duplicate so the picker steers the clinic to the existing entry.
    return {
      ok: true,
      kind: 'duplicate',
      existingSlug: cleanedSlug,
      note:
        parsed.note || 'A service with this slug is already in the library',
    }
  }
  // Filter related slugs down to ones that actually exist (drop hallucinations).
  const existingSlugSet = new Set(existing.map((e) => e.slug))
  const cleanedRelated = (candidate.relatedSlugs ?? []).filter(
    (s) => existingSlugSet.has(s) && s !== cleanedSlug,
  )

  const entry: ServiceLibraryEntry = {
    slug: cleanedSlug,
    name: candidate.name.trim(),
    category: candidate.category as ServiceCategory,
    icon: candidate.icon,
    shortDescription: candidate.shortDescription.trim(),
    heroBullets: candidate.heroBullets.map((b) => b.trim()).filter(Boolean),
    body: candidate.body.trim(),
    processSteps: candidate.processSteps.map((s) => ({
      title: s.title.trim(),
      body: s.body.trim(),
    })) as ServiceProcessStep[],
    faq: candidate.faq.map((f) => ({
      question: f.question.trim(),
      answer: f.answer.trim(),
    })) as ServiceFaqItem[],
    relatedSlugs: cleanedRelated,
  }

  return {
    ok: true,
    kind: 'new',
    entry,
    suggestedRelated: cleanedRelated,
    note: parsed.note,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. getCustomizationForClinicService — resolver helper.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the persisted customization blob from a clinic service when it
 * exists and points at the same library entry currently linked. Otherwise
 * returns null so the resolver falls back to the 1A token-substitution path.
 *
 * Pure — no AI call, no DB. Used by `resolveClinicServices` after it's loaded
 * the relevant library entry, so a `librarySlug` swap doesn't accidentally
 * surface stale rewrites.
 */
export function getCustomizationForClinicService(
  clinicService: ClinicService,
  library: ServiceLibraryEntry,
  _clinic: CustomizeClinicContext,
): ClinicServiceCustomization | null {
  const c = clinicService.customized
  if (!c) return null
  if (clinicService.librarySlug !== library.slug) return null
  // Light structural sanity — drop blobs from older schemas that don't
  // carry the array shapes we expect today.
  if (!Array.isArray(c.heroBullets) || !Array.isArray(c.processSteps) || !Array.isArray(c.faq)) {
    return null
  }
  return c
}
