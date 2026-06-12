/**
 * The conversational onboarding interview (Website Studio Phase 3). A short,
 * warm, FIXED question script — not an AI-driven chat. The clinic answers in
 * their own words; one AI pass then drafts the whole site from the answers
 * (see `lib/services/ai-onboarding.ts`). Client-safe (no server imports) so
 * the chat UI can render it directly.
 *
 * Interview v2: the "services" question is no longer free text — it's a
 * checkbox step over the real service library (grouped Core/Special, Wave 1's
 * 4 starter slugs pre-checked, min 1). The AI then CUSTOMIZES the chosen
 * services rather than guessing slugs. Every other question stays free text.
 */
export interface InterviewQuestion {
  id: string
  /** 'text' = free-text textarea answer; 'services' = library checkbox step. */
  kind: 'text' | 'services'
  /** The warm prompt shown as a chat bubble from "us". */
  prompt: string
  /** Optional hint under the input. */
  hint?: string
  placeholder?: string
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'positioning',
    kind: 'text',
    prompt: "Let's build your website together. First — how would you describe your practice to someone who just moved to town?",
    hint: 'A sentence or two, in your own words.',
    placeholder: "We're a family-friendly practice that…",
  },
  {
    id: 'audience',
    kind: 'text',
    prompt: 'Who do you love seeing in the chair? Families, kids, nervous patients, cosmetic cases…?',
    placeholder: 'Mostly families and first-time patients…',
  },
  {
    id: 'difference',
    kind: 'text',
    prompt: 'What do you most want to be known for — the thing that sets you apart from the dentist down the street?',
    placeholder: 'We never make anyone feel judged about their teeth…',
  },
  {
    id: 'services',
    kind: 'services',
    prompt: 'Which services should be front and center on your site?',
    hint: "Pick the ones you offer — we'll write a full page for each. (We've pre-selected a few to start.)",
  },
  {
    id: 'feeling',
    kind: 'text',
    prompt: 'What feeling do you want someone to have the moment they walk in?',
    placeholder: 'Calm, unhurried, a little like family…',
  },
  {
    id: 'trust',
    kind: 'text',
    prompt: 'Anything patients are often relieved or surprised by? (Same-week visits, easy billing, gentle with kids, no judgment…)',
    placeholder: 'We can almost always see new patients the same week…',
  },
  {
    id: 'faq',
    kind: 'text',
    prompt: 'Last one — what questions do new patients ask you the most?',
    hint: "We'll turn these into your FAQ.",
    placeholder: 'Do you take my insurance? Does it hurt? How much is…',
  },
]

/** The id of the services checkbox step — referenced by the UI + the draft
 *  engine so service slugs come from there, never from slug-guessing. */
export const SERVICES_QUESTION_ID = 'services'

/**
 * The 4 canonical CORE service slugs pre-checked when the interview opens —
 * mirrors Wave 1's `STARTER_SERVICE_SLUGS` so a brand-new clinic's pre-checks
 * match the day-0 floor it already has. The picker still shows the full
 * library; these are just the default selection. (Kept as a literal here so
 * this client-safe module never imports the server-only starter-pack.)
 */
export const INTERVIEW_PRECHECKED_SERVICE_SLUGS = [
  'family-dental-care',
  'dental-exams',
  'dental-hygiene',
  'teeth-whitening',
] as const

/**
 * Server-persisted draft of the interview (clinic_profile.onboarding_interview_draft).
 * Saved (debounced) on every step advance so a refresh resumes mid-interview;
 * cleared on successful completion. `resolveInterviewDraft` sanitizes a stored
 * (possibly partial / legacy / junk) blob — so a malformed payload can never
 * crash the resume path.
 */
export interface OnboardingInterviewDraft {
  /** Text answers keyed by question id (the services step is NOT stored here). */
  answers: Record<string, string>
  /** Selected service slugs from the checkbox step. */
  serviceSlugs: string[]
  /** Which step index the clinic was on (0-based). */
  step: number
  /** ISO timestamp of the last save. */
  updatedAt: string
}

/** A resolved draft with everything present, or null when there's no usable
 *  draft to resume. */
export function resolveInterviewDraft(stored: unknown): OnboardingInterviewDraft | null {
  if (!stored || typeof stored !== 'object') return null
  const s = stored as Record<string, unknown>

  const answers: Record<string, string> = {}
  if (s.answers && typeof s.answers === 'object') {
    for (const [k, v] of Object.entries(s.answers as Record<string, unknown>)) {
      if (typeof v === 'string') answers[k] = v
    }
  }

  const serviceSlugs = Array.isArray(s.serviceSlugs)
    ? (s.serviceSlugs as unknown[]).filter((x): x is string => typeof x === 'string')
    : []

  const rawStep = typeof s.step === 'number' && Number.isFinite(s.step) ? Math.floor(s.step) : 0
  // Clamp to the question range — a stale/over-large step shouldn't blow past
  // the last question (which would skip straight to drafting on resume).
  const step = Math.min(Math.max(rawStep, 0), INTERVIEW_QUESTIONS.length - 1)

  const updatedAt = typeof s.updatedAt === 'string' ? s.updatedAt : new Date(0).toISOString()

  // A draft with no answers AND no slugs AND step 0 is indistinguishable from
  // "never started" — treat it as no draft so we don't show a misleading resume.
  if (Object.keys(answers).length === 0 && serviceSlugs.length === 0 && step === 0) {
    return null
  }

  return { answers, serviceSlugs, step, updatedAt }
}

/** Brand voice for the per-service AI customization, derived purely from the
 *  audience answer (no extra AI call). Pediatric/kid language → 'family';
 *  cosmetic/luxury → 'modern'; everything else → the warm default. */
export type BrandVoice = 'warm' | 'modern' | 'family'

export function deriveBrandVoice(answers: Record<string, string>): BrandVoice {
  const audience = (answers.audience ?? '').toLowerCase()
  const positioning = (answers.positioning ?? '').toLowerCase()
  const blob = `${audience} ${positioning}`
  // Family / pediatric signals win first (warmest register). The `famil` token
  // is a STEM (family / families / familiar), so it has no trailing boundary —
  // `\bfamil\b` could never match "family" (the `l→y` is not a word boundary).
  if (/\b(?:kids?|child(?:ren)?|p(?:a)?ediatric|teens?|famil\w*)\b/.test(blob)) {
    return 'family'
  }
  // Cosmetic / high-end signals → the clean "modern" register. `luxur` is also a
  // stem (luxury / luxurious).
  if (
    /\b(?:cosmetic|veneers?|whiten(?:ing)?|luxur\w*|high-end|aesthetic|smile makeover|implants?)\b/.test(
      blob,
    )
  ) {
    return 'modern'
  }
  return 'warm'
}
