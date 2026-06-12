import 'server-only'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import {
  CORE_VOICE_RULES,
  customizeServiceForClinic,
  type CustomizeClinicContext,
} from '@/lib/services/service-library-ai'
import { listLibraryForPicker } from '@/lib/services/service-library'
import type {
  ClinicService,
  ClinicStat,
  ClinicFaqItem,
  ServiceLibraryEntry,
} from '@/lib/types/clinic-content'
import {
  INTERVIEW_QUESTIONS,
  SERVICES_QUESTION_ID,
  deriveBrandVoice,
  type BrandVoice,
} from '@/lib/types/onboarding-interview'
import {
  isTaglineStillStarter,
  isAboutStillStarter,
  areStatsStillStarter,
  isFaqStillStarter,
  areServicesStillStarter,
} from '@/lib/services/starter-pack'
import { resolveSeoMeta, type PageSeoMeta } from '@/lib/types/seo-meta'

/**
 * Conversational onboarding interview → one-pass site draft (Welcome Interview
 * v2). Takes the clinic's free-text answers + the service slugs they CHECKED in
 * the picker step, makes ONE structured Claude call, and writes the drafted
 * tagline / about / stats / FAQ / home SEO + the chosen (canonical) services
 * straight onto `clinic_profile` so the site reads as a finished, personalized
 * site INSTANTLY. Per-service AI rewrites then fire best-effort in the
 * background (not awaited) so the clinic isn't blocked.
 *
 * Two binding contracts:
 *  • NON-DESTRUCTIVE — a field is overwritten ONLY when its current value is
 *    null/empty OR still equals Wave 1's exported STARTER_* constant. A
 *    human-edited value (e.g. a clinic that opened the Studio first) is
 *    preserved, so a stray /welcome re-entry can never clobber real edits.
 *    Skipped fields are reported in the result.
 *  • NEVER A DEAD END — on AI failure/parse-failure the site already has the
 *    day-0 floor, so the caller shows an honest "we used our standard copy"
 *    message + retry, never an empty site.
 *
 * This is a free, one-time welcome gift — it deliberately does NOT touch the
 * `ai_usage_counter` allowance (only on-demand Studio rewrites do).
 */

const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`

const DraftSchema = z.object({
  tagline: z.string().min(1).max(90),
  about: z.string().min(1).max(1600),
  // "Why us" highlight chips for the homepage difference section. Short
  // phrases drawn from what the clinic said sets them apart. Optional in the
  // model output — the template auto-builds chips from services + standard
  // reassurances when this is absent, so a missing list is never a dead end.
  // Lenient element validation (plain string, generous cap) on purpose: a
  // single blank/oversized chip must NEVER fail-validate the whole draft and
  // dead-end the interview — the persistence step below trims, drops blanks,
  // de-dupes, and caps to the real ceiling.
  differenceChips: z.array(z.string().max(200)).max(20).optional().default([]),
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
  // Home-page search snippet. Optional + lenient — a missing/oversized value
  // must never fail-validate the whole draft (the home page falls back to its
  // derived title/description when absent). resolveSeoMeta clamps on store.
  seoTitle: z.string().max(200).optional().default(''),
  seoDescription: z.string().max(400).optional().default(''),
})

export type OnboardingAnswers = Record<string, string>

export type DraftResult =
  | {
      ok: true
      /** How many canonical services were stored on the site immediately. */
      draftedServices: number
      /** Fields the draft did NOT overwrite because the clinic had already
       *  hand-edited them (preserved). Surfaced for transparency/tests. */
      skippedFields: string[]
    }
  | { ok: false; error: string }

/**
 * Fire per-service AI customization for the selected services, best-effort, in
 * the BACKGROUND. The caller invokes this WITHOUT awaiting before redirecting —
 * the site is already complete with canonical (token-substituted) copy, so
 * these rewrites are a quality upgrade, not a blocker. The durable net is the
 * `customize-services` cron, which fills any blob this didn't finish.
 *
 * Exported so the action layer + tests can reference it. Each call is wrapped
 * (Promise.allSettled) so one failure never rejects the batch; a successful
 * rewrite is persisted onto the matching `clinic_profile.services[i].customized`.
 */
export async function fireServiceCustomizations(
  orgId: string,
  slugs: string[],
  clinicCtx: CustomizeClinicContext,
  library: ServiceLibraryEntry[],
): Promise<void> {
  if (slugs.length === 0) return
  const bySlug = new Map(library.map((e) => [e.slug, e]))
  await Promise.allSettled(
    slugs.map(async (slug) => {
      const entry = bySlug.get(slug)
      if (!entry) return
      const res = await customizeServiceForClinic(entry, clinicCtx)
      if (!res.ok) return
      // Persist onto the matching service row. Re-read so we don't clobber a
      // concurrent edit, and only write the one row's customized blob.
      await persistServiceCustomization(orgId, slug, res.customization)
    }),
  )
}

/** Write a single service's customized blob, matching by librarySlug. Re-reads
 *  the services array so a concurrent change to a DIFFERENT row is preserved. */
async function persistServiceCustomization(
  orgId: string,
  slug: string,
  customization: ClinicService['customized'],
): Promise<void> {
  const [row] = await db
    .select({ services: clinicProfile.services })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  if (!row || !Array.isArray(row.services)) return
  const services = row.services as ClinicService[]
  let touched = false
  const next = services.map((s) => {
    if (s.librarySlug === slug && !s.customized) {
      touched = true
      return { ...s, customized: customization }
    }
    return s
  })
  if (!touched) return
  await db
    .update(clinicProfile)
    .set({ services: next, updatedAt: new Date() })
    .where(eq(clinicProfile.organizationId, orgId))
}

export async function draftSiteFromInterview(
  orgId: string,
  answers: OnboardingAnswers,
  /** Slugs the clinic CHECKED in the services step. The AI no longer guesses
   *  slugs — it customizes this exact selection. */
  serviceSlugs: string[],
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
  const bySlug = new Map(library.map((e) => [e.slug, e]))

  // Resolve the checked slugs to real library entries (drop any unknown slug),
  // de-dupe, cap at 8 (the public site's service-strip ceiling).
  const seenSlug = new Set<string>()
  const selectedEntries = serviceSlugs
    .filter((slug) => {
      if (seenSlug.has(slug) || !bySlug.has(slug)) return false
      seenSlug.add(slug)
      return true
    })
    .map((slug) => bySlug.get(slug)!)
    .slice(0, 8)

  // The exact services the clinic chose — given to the model as context so it
  // grounds the tagline/about/FAQ in what they actually offer (NOT as a slug
  // menu to pick from).
  const chosenForPrompt = selectedEntries.map((e) => ({
    name: e.name,
    category: e.category,
    about: e.shortDescription,
  }))

  // Only the FREE-TEXT answers go into the Q&A block (the services step's
  // "answer" is the checked list, fed separately above).
  const qa = INTERVIEW_QUESTIONS.filter((q) => q.kind === 'text')
    .map((q) => `Q: ${q.prompt}\nA: ${(answers[q.id] ?? '').trim() || '(skipped)'}`)
    .join('\n\n')

  const locality = [profile.city, profile.state].filter(Boolean).join(', ')

  const system = `You are drafting the FIRST version of a dental clinic's public website from a short intake interview. Write in the clinic's own voice and ground EVERY line in what they told you.

${CORE_VOICE_RULES}

Grounding rules (this is what makes it feel like THEIR site, not a template):
- Anchor to their location naturally where it helps — the clinic is in ${locality || 'their local area'}. Mention the city/area in the about paragraph; never force it elsewhere.
- For the difference/feeling answers, ECHO the clinic's own phrasing where you can — reuse their words for what sets them apart, don't paraphrase them into generic marketing.
- Prioritize THEIR actual FAQ phrasings — turn the questions they said patients ask into the FAQ, keeping their wording. Add a couple of universal ones (insurance, booking) only to round out to 4–8.
- The services have already been chosen by the clinic (listed below). Do NOT pick services. Let the chosen services inform the tagline + about (e.g. lead with what they emphasize), but write copy, not a service list.

Field rules:
- NEVER invent verifiable specifics they didn't give you: no founding year, patient/review counts, awards, doctor names, prices, or insurance carriers.
- Stats are QUALITATIVE trust signals, not fabricated numbers — e.g. value "Same-week" label "appointments", value "Judgment-free" label "always", value "Most insurance" label "accepted". Never a made-up figure.
- differenceChips: 4 to 6 SHORT "why us" phrases (2–4 words each, no period) drawn from what they said sets them apart — e.g. "No judgment, ever", "Same-week visits", "Gentle with kids", "Easy billing". Scannable badges, not sentences.
- seoTitle: the home page's search-result title, under 60 characters, including the practice name and city when natural (e.g. "Acme Dental — Family Dentist in Austin, TX").
- seoDescription: the home page's search snippet, 140–160 characters, warm and specific to this practice.`

  const userPrompt = `Clinic: ${profile.displayName ?? ''}${locality ? `, ${locality}` : ''}

Their interview answers:
${qa}

Services the clinic chose for their site (write copy that fits these — do NOT output a service list):
${JSON.stringify(chosenForPrompt, null, 2)}

Draft the website by calling the emit_site_draft tool.`

  let input: unknown
  try {
    input = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 3000,
      system,
      messages: [{ role: 'user', content: userPrompt }],
      toolName: 'emit_site_draft',
      toolDescription: 'Return the drafted website copy (tagline, about, chips, stats, FAQ, home SEO).',
      inputSchema: {
        type: 'object',
        properties: {
          tagline: {
            type: 'string',
            description: 'One short hero tagline, under 70 characters, no trailing period.',
          },
          about: {
            type: 'string',
            description:
              'A warm About section, 2–4 short paragraphs, under 1500 characters. Mention the city/area naturally.',
          },
          differenceChips: {
            type: 'array',
            minItems: 4,
            maxItems: 6,
            description:
              'Short "why us" badge phrases (2–4 words, no period) from what sets them apart.',
            items: { type: 'string' },
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
            description:
              "Turn the questions THEY said patients ask into FAQ entries, keeping their wording; round out to 4–8 with universal ones.",
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
          seoTitle: {
            type: 'string',
            description:
              'Home page search-result title, under 60 characters, with practice name + city when natural.',
          },
          seoDescription: {
            type: 'string',
            description: 'Home page search snippet, 140–160 characters, warm and specific.',
          },
        },
        required: ['tagline', 'about', 'stats', 'faq'],
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

  // Build library-linked services from the CHECKED slugs (stored canonical so
  // the site is complete instantly; the per-service AI rewrite fires after).
  const services: ClinicService[] = selectedEntries.map((e) => ({
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

  // Trim / drop blanks / de-dupe (case-insensitive) / cap at 8 — the template
  // reads this as an explicit chip list. Empty → leave the column untouched so
  // the template's auto-built fallback wins.
  const seenChip = new Set<string>()
  const differenceChips = draft.differenceChips
    .map((c) => c.trim())
    .filter((c) => {
      if (!c || c.length > 40) return false
      const key = c.toLowerCase()
      if (seenChip.has(key)) return false
      seenChip.add(key)
      return true
    })
    .slice(0, 8)

  // ── Non-destructive apply ────────────────────────────────────────────────
  // Overwrite a field ONLY when it's still null/empty or still the Wave-1
  // starter value. A hand-edited value is preserved (and reported as skipped).
  const patch: Record<string, unknown> = {}
  const skippedFields: string[] = []

  if (isTaglineStillStarter(profile.tagline)) patch.tagline = draft.tagline
  else skippedFields.push('tagline')

  if (isAboutStillStarter(profile.about)) patch.about = draft.about
  else skippedFields.push('about')

  if (areStatsStillStarter(profile.stats)) patch.stats = stats
  else skippedFields.push('stats')

  if (isFaqStillStarter(profile.faq)) patch.faq = faq
  else skippedFields.push('faq')

  // differenceChips is only ever the AI's (the floor doesn't set it). Write it
  // only when the model produced chips AND the clinic hasn't authored its own.
  const existingChips = profile.differenceChips
  const chipsUntouched =
    existingChips == null || (Array.isArray(existingChips) && existingChips.length === 0)
  if (differenceChips.length > 0) {
    if (chipsUntouched) patch.differenceChips = differenceChips
    else skippedFields.push('differenceChips')
  }

  // Services: replace only the still-starter (or empty) set. A clinic that
  // already curated/AI-customized services keeps theirs.
  let draftedServices = 0
  if (services.length > 0) {
    if (areServicesStillStarter(profile.services)) {
      patch.services = services
      draftedServices = services.length
    } else {
      skippedFields.push('services')
    }
  }

  // Home SEO → seo_meta.home. Only set fields the model produced, and only when
  // the home page's title/description aren't already clinic-authored.
  const seoTitle = draft.seoTitle.replace(/\s+/g, ' ').trim()
  const seoDescription = draft.seoDescription.replace(/\s+/g, ' ').trim()
  if (seoTitle || seoDescription) {
    const meta: PageSeoMeta = resolveSeoMeta(profile.seoMeta)
    const home = meta.home ?? {}
    let seoTouched = false
    if (seoTitle && !home.title) {
      home.title = seoTitle
      seoTouched = true
    } else if (seoTitle && home.title) {
      skippedFields.push('seoTitle')
    }
    if (seoDescription && !home.description) {
      home.description = seoDescription
      seoTouched = true
    } else if (seoDescription && home.description) {
      skippedFields.push('seoDescription')
    }
    if (seoTouched) {
      meta.home = home
      patch.seoMeta = meta
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date()
    await db.update(clinicProfile).set(patch).where(eq(clinicProfile.organizationId, orgId))
  }

  // ── Fire-and-forget per-service customization ────────────────────────────
  // The site is already complete (canonical services stored above). Kick off
  // the per-service rewrites WITHOUT awaiting — the caller redirects to the
  // reveal immediately; the cron is the durable net for anything unfinished.
  if (services.length > 0) {
    const brandVoice: BrandVoice = deriveBrandVoice(answers)
    const clinicCtx: CustomizeClinicContext = {
      name: profile.displayName ?? '',
      city: profile.city,
      tagline: (patch.tagline as string) ?? profile.tagline,
      about: (patch.about as string) ?? profile.about,
      brandVoice,
    }
    void fireServiceCustomizations(
      orgId,
      services.map((s) => s.librarySlug!).filter(Boolean),
      clinicCtx,
      library,
    )
  }

  return { ok: true, draftedServices, skippedFields }
}

// Re-export so the services step UI + answers shape stay discoverable from the
// engine module (it owns the "what the AI consumes" contract).
export { SERVICES_QUESTION_ID }
