import 'server-only'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { aiUsageCounter } from '@/lib/db/schema/platform'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { CORE_VOICE_RULES } from '@/lib/services/service-library-ai'
import { newId } from '@/lib/utils'
import {
  aiAllowanceForPlan,
  type AiUsageSnapshot,
  type AiWebsiteSection,
  type GeneratedContent,
} from '@/lib/types/ai-website'

/**
 * AI assist for the Website Editor — on-demand "Rewrite with AI" for the
 * copy-heavy homepage sections (hero tagline, about, stat anchors, FAQ).
 * Services already have their own AI customization (service-library-ai.ts).
 *
 * Two halves:
 *  - generation: `generateSectionCopy(section, ctx)` — one structured-output
 *    Claude call per section, sharing the hardened anti-shame voice rules and
 *    the no-fabricated-claims promise. Never throws (returns a result union).
 *  - metering: `getAiUsage` / `incrementAiUsage` — the per-org, per-month
 *    tally behind the tier-baked allowance. Manual edits + the onboarding
 *    draft never call increment; only an explicit rewrite does.
 *
 * The generated content is RETURNED to the editor to fill the fields for
 * review — it is NOT auto-saved. The clinic reviews, tweaks, and clicks the
 * section's normal Save. (Manual editing stays free; AI is the accelerant.)
 */

const MODEL_ID = 'claude-sonnet-4-6'
const KIND = 'website_rewrite'

// ─────────────────────────────────────────────────────────────────────────────
// Usage accounting
// ─────────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM' in UTC — the allowance bucket. */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function getAiUsage(
  orgId: string,
  planTier: string | null | undefined,
  now: Date = new Date(),
): Promise<AiUsageSnapshot> {
  const period = currentPeriod(now)
  const limit = aiAllowanceForPlan(planTier)
  const [row] = await db
    .select({ count: aiUsageCounter.count })
    .from(aiUsageCounter)
    .where(
      and(
        eq(aiUsageCounter.organizationId, orgId),
        eq(aiUsageCounter.period, period),
        eq(aiUsageCounter.kind, KIND),
      ),
    )
    .limit(1)
  const used = row?.count ?? 0
  return { used, limit, remaining: Math.max(0, limit - used), period }
}

/** Atomic +1 for the current month. Safe under concurrency via the unique index. */
export async function incrementAiUsage(orgId: string, now: Date = new Date()): Promise<void> {
  const period = currentPeriod(now)
  await db
    .insert(aiUsageCounter)
    .values({ id: newId('aiu'), organizationId: orgId, period, kind: KIND, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsageCounter.organizationId, aiUsageCounter.period, aiUsageCounter.kind],
      set: { count: sql`${aiUsageCounter.count} + 1`, updatedAt: new Date() },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation
// ─────────────────────────────────────────────────────────────────────────────

export interface WebsiteAiContext {
  name: string
  city?: string | null
  tagline?: string | null
  about?: string | null
  /** Service names the clinic offers — grounds the copy in real offerings. */
  services?: string[]
  /** Accepted PPO carriers — lets FAQ name them honestly instead of guessing. */
  insuranceCarriers?: string[]
  /** Short human summary of open days, e.g. "Mon–Fri, plus Saturday mornings". */
  hoursSummary?: string | null
}

export type GenerateResult =
  | { ok: true; content: GeneratedContent }
  | { ok: false; error: string }

const SHARED_SYSTEM = `You are writing website copy for ONE specific dental clinic. You will be given the clinic's known context (name, city, services, etc.). Write in that clinic's voice and ground every line in the context you're given — never contradict or pad it with invented facts.

${CORE_VOICE_RULES}

Extra rules for website copy:
- NEVER invent specifics the context doesn't contain: no founding year, no patient counts, no review counts, no awards, no doctor names, no specific insurance carriers unless they appear in the context.
- It's fine — expected — to write warm, confident, concrete copy from the general facts of being a modern dental practice in the named city. Just don't fabricate verifiable claims.
- Reference the city naturally when it helps; don't force it.`

function contextBlock(ctx: WebsiteAiContext): string {
  return JSON.stringify(
    {
      name: ctx.name,
      city: ctx.city ?? null,
      currentTagline: ctx.tagline ?? null,
      currentAbout: ctx.about ? ctx.about.slice(0, 1200) : null,
      services: (ctx.services ?? []).slice(0, 20),
      acceptedInsuranceCarriers: (ctx.insuranceCarriers ?? []).slice(0, 30),
      hoursSummary: ctx.hoursSummary ?? null,
    },
    null,
    2,
  )
}

// Per-section validation schemas.
const HeroSchema = z.object({ tagline: z.string().min(1).max(90) })
const AboutSchema = z.object({ about: z.string().min(1).max(1600) })
const StatsSchema = z.object({
  stats: z
    .array(z.object({ value: z.string().min(1).max(32), label: z.string().min(1).max(64) }))
    .min(3)
    .max(3),
})
const FaqSchema = z.object({
  faq: z
    .array(
      z.object({
        category: z.string().min(1).max(40),
        question: z.string().min(1).max(240),
        answer: z.string().min(1).max(1200),
      }),
    )
    .min(4)
    .max(10),
})

interface SectionSpec {
  toolName: string
  toolDescription: string
  instruction: string
  maxTokens: number
  inputSchema: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse: (input: unknown) => GeneratedContent | null
}

const SPECS: Record<AiWebsiteSection, SectionSpec> = {
  hero: {
    toolName: 'emit_tagline',
    toolDescription: 'Return one short hero tagline for the clinic.',
    instruction:
      'Write ONE hero tagline — a short, concrete promise under 70 characters. Not a slogan, not a sentence with a period. Examples of the register: "Gentle, judgment-free dentistry" / "Modern family care in {city}". Anti-shame, warm, plain.',
    maxTokens: 300,
    inputSchema: {
      type: 'object',
      properties: {
        tagline: { type: 'string', description: 'One short tagline, under 70 characters, no trailing period.' },
      },
      required: ['tagline'],
    },
    parse: (input) => {
      const p = HeroSchema.safeParse(input)
      return p.success ? { section: 'hero', tagline: p.data.tagline } : null
    },
  },
  about: {
    toolName: 'emit_about',
    toolDescription: 'Return an About paragraph for the clinic.',
    instruction:
      'Write the About copy — 2 short paragraphs (about 60–110 words total). What the practice is like, the feel of a visit, who they care for. Warm, first-person plural ("we"). Do NOT invent founding years, patient counts, or awards.',
    maxTokens: 900,
    inputSchema: {
      type: 'object',
      properties: {
        about: { type: 'string', description: 'Two short paragraphs, ~60–110 words, separated by a blank line.' },
      },
      required: ['about'],
    },
    parse: (input) => {
      const p = AboutSchema.safeParse(input)
      return p.success ? { section: 'about', about: p.data.about } : null
    },
  },
  stats: {
    toolName: 'emit_stats',
    toolDescription: 'Return exactly three qualitative trust-signal stats.',
    instruction:
      'Write EXACTLY 3 "stat anchors" — short trust signals shown under the hero. Each is a punchy `value` (1–3 words) + a `label` (a short phrase). CRITICAL: these must be QUALITATIVE — NEVER invent a number, rating, count, or year. Good: {value:"Same-week", label:"appointments available"}, {value:"Most", label:"PPO insurance accepted"}, {value:"Judgment-free", label:"every single visit"}. Only claim Saturday/evening hours if the hoursSummary supports it.',
    maxTokens: 600,
    inputSchema: {
      type: 'object',
      properties: {
        stats: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          description: 'Exactly 3 qualitative stat pairs. No invented numbers.',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'Headline, 1–3 words. Qualitative, never a fabricated number.' },
              label: { type: 'string', description: 'Short follow-on phrase.' },
            },
            required: ['value', 'label'],
          },
        },
      },
      required: ['stats'],
    },
    parse: (input) => {
      const p = StatsSchema.safeParse(input)
      return p.success ? { section: 'stats', stats: p.data.stats } : null
    },
  },
  faq: {
    toolName: 'emit_faq',
    toolDescription: 'Return a set of clinic FAQ entries.',
    instruction:
      'Write 6–8 FAQ entries patients actually ask before booking, in the clinic\'s voice. Use these categories: "Booking", "Your Visit", "Insurance", "Office", "Billing". Cover: how to book, what to bring, dental anxiety (anti-shame), insurance ("we accept most major PPO plans — message us your carrier to verify"; only name carriers present in the context), and cost (ESTIMATE-FIRST — never invent a dollar figure: insurance checked first, an itemized estimate before treatment, no surprises).',
    maxTokens: 3200,
    inputSchema: {
      type: 'object',
      properties: {
        faq: {
          type: 'array',
          minItems: 4,
          maxItems: 10,
          description: '6–8 FAQ entries across the allowed categories.',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', description: 'One of: Booking, Your Visit, Insurance, Office, Billing.' },
              question: { type: 'string' },
              answer: { type: 'string', description: '1–3 sentences. No fabricated prices or stats.' },
            },
            required: ['category', 'question', 'answer'],
          },
        },
      },
      required: ['faq'],
    },
    parse: (input) => {
      const p = FaqSchema.safeParse(input)
      return p.success ? { section: 'faq', faq: p.data.faq } : null
    },
  },
}

/**
 * Generate copy for one section. Returns the structured content for the editor
 * to apply (NOT persisted here). Never throws — degrades to `{ ok: false }`.
 */
export async function generateSectionCopy(
  section: AiWebsiteSection,
  ctx: WebsiteAiContext,
): Promise<GenerateResult> {
  if (!aiConfigured()) {
    return { ok: false, error: 'AI is not configured on this environment' }
  }
  const spec = SPECS[section]
  if (!spec) return { ok: false, error: 'Unknown section' }

  const userPrompt = `${spec.instruction}

Reply by calling the ${spec.toolName} tool.

<clinic_context>
${contextBlock(ctx)}
</clinic_context>`

  try {
    const input = await runClaudeJson({
      model: 'sonnet',
      maxTokens: spec.maxTokens,
      system: SHARED_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
      toolName: spec.toolName,
      toolDescription: spec.toolDescription,
      inputSchema: spec.inputSchema,
    })
    if (!input) return { ok: false, error: 'AI returned no content — try again' }
    const content = spec.parse(input)
    if (!content) {
      console.warn(`[ai.website] ${section} output failed validation`)
      return { ok: false, error: 'AI output failed validation — try again' }
    }
    return { ok: true, content }
  } catch (err) {
    console.warn(`[ai.website] ${section} failed:`, (err as Error).message)
    return { ok: false, error: 'AI request failed — please try again' }
  }
}

export { MODEL_ID }
