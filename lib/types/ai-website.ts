// Client-safe types + constants for the Website Editor's AI assist.
//
// The Website Editor (a client component) needs the per-plan allowance to
// render "N AI rewrites left this month," so these live in lib/types/ (no
// server-only deps). The actual generation + usage accounting is server-side
// in lib/services/ai-website.ts.

import type { PlanId } from '@/lib/stripe-config'

/** Sections that support an on-demand "Rewrite with AI" in the editor. */
export const AI_WEBSITE_SECTIONS = ['hero', 'about', 'stats', 'faq'] as const
export type AiWebsiteSection = (typeof AI_WEBSITE_SECTIONS)[number]

/**
 * Tier-baked monthly allowance for metered AI generations. Manual editing and
 * the one-time onboarding draft are ALWAYS free and never count against this —
 * only an on-demand "Rewrite with AI" does. Deliberately generous: the token
 * cost is trivial against a $150–$500/mo subscription, so this is an
 * anti-abuse guardrail + a gentle upgrade lever, NOT a cost-recovery meter.
 * Resets monthly, fails safe (we gate, never auto-charge). No credit currency —
 * the research is clear that "customers don't know what a credit does."
 */
export const AI_REWRITE_ALLOWANCE: Record<PlanId, number> = {
  basic: 15,
  pro: 50,
  premium: 200,
}

/** Resolve a plan tier string (possibly null/legacy) to its monthly allowance. */
export function aiAllowanceForPlan(plan: string | null | undefined): number {
  if (plan === 'pro') return AI_REWRITE_ALLOWANCE.pro
  if (plan === 'premium') return AI_REWRITE_ALLOWANCE.premium
  return AI_REWRITE_ALLOWANCE.basic
}

/** Current usage snapshot surfaced in the editor next to the AI buttons. */
export interface AiUsageSnapshot {
  used: number
  limit: number
  remaining: number
  /** 'YYYY-MM' (UTC) bucket the allowance resets on. */
  period: string
}

/**
 * Structured copy returned by a section rewrite, for the editor to APPLY to
 * its fields (the clinic reviews + clicks the normal Save — not auto-saved).
 * Lives here (client-safe) so the editor can import it without touching the
 * server-only generation module.
 */
export type GeneratedContent =
  | { section: 'hero'; tagline: string }
  | { section: 'about'; about: string }
  | { section: 'stats'; stats: Array<{ value: string; label: string }> }
  | { section: 'faq'; faq: Array<{ category: string; question: string; answer: string }> }
