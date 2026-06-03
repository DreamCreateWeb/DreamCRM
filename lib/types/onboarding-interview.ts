/**
 * The conversational onboarding interview (Website Studio Phase 3). A short,
 * warm, FIXED question script — not an AI-driven chat. The clinic answers in
 * their own words; one AI pass then drafts the whole site from the answers
 * (see `lib/services/ai-onboarding.ts`). Client-safe (no server imports) so
 * the chat UI can render it directly.
 */
export interface InterviewQuestion {
  id: string
  /** The warm prompt shown as a chat bubble from "us". */
  prompt: string
  /** Optional hint under the input. */
  hint?: string
  placeholder?: string
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'positioning',
    prompt: "Let's build your website together. First — how would you describe your practice to someone who just moved to town?",
    hint: 'A sentence or two, in your own words.',
    placeholder: "We're a family-friendly practice that…",
  },
  {
    id: 'audience',
    prompt: 'Who do you love seeing in the chair? Families, kids, nervous patients, cosmetic cases…?',
    placeholder: 'Mostly families and first-time patients…',
  },
  {
    id: 'difference',
    prompt: 'What do you most want to be known for — the thing that sets you apart from the dentist down the street?',
    placeholder: 'We never make anyone feel judged about their teeth…',
  },
  {
    id: 'services',
    prompt: 'Which services should be front and center on your site?',
    hint: "Just list them — we'll match them to full service pages.",
    placeholder: 'Cleanings, Invisalign, whitening, implants…',
  },
  {
    id: 'feeling',
    prompt: 'What feeling do you want someone to have the moment they walk in?',
    placeholder: 'Calm, unhurried, a little like family…',
  },
  {
    id: 'trust',
    prompt: 'Anything patients are often relieved or surprised by? (Same-week visits, easy billing, gentle with kids, no judgment…)',
    placeholder: 'We can almost always see new patients the same week…',
  },
  {
    id: 'faq',
    prompt: 'Last one — what questions do new patients ask you the most?',
    hint: "We'll turn these into your FAQ.",
    placeholder: 'Do you take my insurance? Does it hurt? How much is…',
  },
]
