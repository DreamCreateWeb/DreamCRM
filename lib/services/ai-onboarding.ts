import 'server-only'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { CORE_VOICE_RULES } from '@/lib/services/service-library-ai'
import { listLibraryForPicker } from '@/lib/services/service-library'
import type { ClinicService, ClinicStat, ClinicFaqItem } from '@/lib/types/clinic-content'
import { INTERVIEW_QUESTIONS } from '@/lib/types/onboarding-interview'

/**
 * Conversational onboarding interview → one-pass site draft (Website Studio
 * Phase 3). Takes the clinic's free-text answers + the platform service
 * library, makes ONE structured Claude call, and writes the drafted tagline /
 * about / stats / FAQ / selected services straight onto `clinic_profile`. The
 * clinic then lands in the in-place Studio to refine.
 *
 * This is a free, one-time welcome gift — it deliberately does NOT touch the
 * `ai_usage_counter` allowance (only on-demand Studio rewrites do).
 */

const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`

const DraftSchema = z.object({
  tagline: z.string().min(1).max(90),
  about: z.string().min(1).max(1600),
  stats: z
    .array(z.object({ value: z.string().min(1).max(32), label: z.string().min(1).max(64) }))
    .min(3)
    .max(3),
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
  serviceSlugs: z.array(z.string()).max(10),
})

export type OnboardingAnswers = Record<string, string>

export type DraftResult =
  | { ok: true; draftedServices: number }
  | { ok: false; error: string }

export async function draftSiteFromInterview(
  orgId: string,
  answers: OnboardingAnswers,
): Promise<DraftResult> {
  if (!aiConfigured()) {
    return { ok: false, error: 'AI is not configured on this environment' }
  }

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  if (!profile) return { ok: false, error: 'Clinic profile not found' }

  const library = await listLibraryForPicker(orgId)
  const libForPrompt = library.map((e) => ({
    slug: e.slug,
    name: e.name,
    category: e.category,
    about: e.shortDescription,
  }))

  const qa = INTERVIEW_QUESTIONS.map(
    (q) => `Q: ${q.prompt}\nA: ${(answers[q.id] ?? '').trim() || '(skipped)'}`,
  ).join('\n\n')

  const system = `You are drafting the FIRST version of a dental clinic's public website from a short intake interview. Write in the clinic's voice and ground every line in what they told you.

${CORE_VOICE_RULES}

Extra rules:
- NEVER invent verifiable specifics they didn't give you: no founding year, patient/review counts, awards, doctor names, prices, or insurance carriers.
- Stats are QUALITATIVE trust signals, not fabricated numbers — e.g. value "Same-week" label "appointments", value "Judgment-free" label "always", value "Most insurance" label "accepted". Never a made-up figure.
- Choose services ONLY from the provided library list (by slug) that match what they said — 4 to 8 of them.
- Warm, plain, anti-shame. Reference their city naturally when it helps, never force it.`

  const userPrompt = `Clinic: ${profile.displayName ?? ''}${profile.city ? `, ${profile.city}` : ''}

Their interview answers:
${qa}

Service library to choose from (use the slug values):
${JSON.stringify(libForPrompt, null, 2)}

Draft the website by calling the emit_site_draft tool.`

  let input: unknown
  try {
    input = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 3000,
      system,
      messages: [{ role: 'user', content: userPrompt }],
      toolName: 'emit_site_draft',
      toolDescription: 'Return the drafted website copy and the selected service slugs.',
      inputSchema: {
        type: 'object',
        properties: {
          tagline: {
            type: 'string',
            description: 'One short hero tagline, under 70 characters, no trailing period.',
          },
          about: {
            type: 'string',
            description: 'A warm About section, 2–4 short paragraphs, under 1500 characters.',
          },
          stats: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            description: 'Exactly 3 qualitative trust signals (no invented numbers).',
            items: {
              type: 'object',
              properties: { value: { type: 'string' }, label: { type: 'string' } },
              required: ['value', 'label'],
            },
          },
          faq: {
            type: 'array',
            minItems: 4,
            maxItems: 8,
            items: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                question: { type: 'string' },
                answer: { type: 'string' },
              },
              required: ['category', 'question', 'answer'],
            },
          },
          serviceSlugs: {
            type: 'array',
            description: 'Slugs taken ONLY from the provided library list, 4–8 entries.',
            items: { type: 'string' },
          },
        },
        required: ['tagline', 'about', 'stats', 'faq', 'serviceSlugs'],
      },
    })
  } catch (err) {
    console.warn('[ai.onboarding] draft failed:', (err as Error).message)
    return { ok: false, error: 'AI request failed — please try again' }
  }

  if (!input) return { ok: false, error: 'AI returned no content — try again' }

  const parsed = DraftSchema.safeParse(input)
  if (!parsed.success) {
    console.warn('[ai.onboarding] draft failed validation')
    return { ok: false, error: 'AI output failed validation — try again' }
  }
  const draft = parsed.data

  // Build library-linked services from the selected slugs (no per-service AI
  // customization here — the clinic can regenerate any of them in the Studio).
  const bySlug = new Map(library.map((e) => [e.slug, e]))
  const services: ClinicService[] = draft.serviceSlugs
    .map((slug) => bySlug.get(slug))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .slice(0, 8)
    .map((e) => ({
      id: newId('svc'),
      librarySlug: e.slug,
      name: e.name,
      category: e.category,
      icon: e.icon ?? null,
    }))

  const stats: ClinicStat[] = draft.stats.map((s) => ({
    id: newId('stat'),
    value: s.value,
    label: s.label,
  }))
  const faq: ClinicFaqItem[] = draft.faq.map((f) => ({
    id: newId('faq'),
    category: f.category,
    question: f.question,
    answer: f.answer,
  }))

  await db
    .update(clinicProfile)
    .set({
      tagline: draft.tagline,
      about: draft.about,
      stats,
      faq,
      ...(services.length > 0 ? { services } : {}),
    })
    .where(eq(clinicProfile.organizationId, orgId))

  return { ok: true, draftedServices: services.length }
}
