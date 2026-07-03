import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'
import { DEMO_BEATS } from '@/lib/types/demo-script'

/**
 * Pure prompt builder for the pre-demo brief — deterministic, unit-testable,
 * no DB/AI deps. The user message is a verified-signal summary in the same
 * style as the enrichment verdict prompt, plus benchmarks and the beat list
 * so beatEmphasis stays grounded in real beat ids.
 */

export interface DemoBriefPromptInput {
  name: string
  city: string | null
  state: string | null
  authorizedOfficialName: string | null
  websiteUrl: string | null
  ratingTenths: number | null
  reviewCount: number | null
  scoreReasons: string[]
  signals: ProspectCrawlSignals | null
  verdict: ProspectAiVerdict | null
}

export function buildDemoBriefPrompt(input: DemoBriefPromptInput): {
  system: string
  user: string
} {
  const s = input.signals
  const v = input.verdict
  const lines = [
    `Practice: ${input.name} (${[input.city, input.state].filter(Boolean).join(', ') || 'location unknown'})`,
    `Owner/authorized official: ${input.authorizedOfficialName ?? 'unknown'}`,
    `Website: ${input.websiteUrl ?? 'NONE FOUND'}`,
    `Google: ${input.ratingTenths != null ? (input.ratingTenths / 10).toFixed(1) + '★' : 'no rating'}, ${input.reviewCount ?? 'unknown'} reviews`,
    `Benchmark: a typical established practice runs ~4.5★ with ~200 reviews.`,
    ...(s
      ? [
          `Site signals: HTTPS ${s.ssl} · mobile viewport ${s.mobileViewport} · copyright year ${s.copyrightYear ?? 'none'} · online-booking markers ${s.bookingWidget} · builder ${s.builder ?? 'custom/unknown'} · socials linked: ${Object.entries(s.socialLinks).filter(([, x]) => x).map(([k]) => k).join(', ') || 'none'}`,
        ]
      : ['Site signals: not crawled yet.']),
    ...(v ? [`Website quality ${v.websiteQuality}/100 · social presence ${v.socialPresence}/100 · verified weaknesses: ${v.weaknesses.join('; ') || 'none recorded'}`] : []),
    ...(input.scoreReasons.length ? [`Opportunity reasons: ${input.scoreReasons.join('; ')}`] : []),
    '',
    `Demo beats available (use these EXACT beatId values): ${DEMO_BEATS.map((b) => `${b.id} ("${b.title}")`).join(', ')}`,
  ]
  return {
    system:
      "You are the sales strategist for Dream Create, a dental website + patient-communication platform. The platform owner is about to run a 20-minute live screen-share demo for this practice. The demo is a MIRROR — the prospect watches their own practice running better. Judge ONLY from the provided verified signals; never invent facts, numbers, or history. Voice: warm, plain, anti-shame (their site 'hasn't had help', never 'is terrible'). openingLine: one quotable sentence the owner can say verbatim to open the call. walkUpStory: 2-4 sentences narrating what their online presence says today, built strictly from the signals. beatEmphasis: one entry per relevant beat using ONLY the provided beatId values, with EXACTLY ONE 'lead' (the beat this practice most needs to see) and honest 'skim' marks for beats their profile doesn't need. objections: the 3-5 most likely from THIS practice's profile, each with a one-breath response. ammunition: up to 6 specific verified gaps, each mapped to the beatId where the owner should land it. closingAsk: the natural next-step sentence.",
    user: lines.join('\n'),
  }
}
