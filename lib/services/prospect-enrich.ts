import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { findDentalPlace, placesConfigured } from '@/lib/google-places'
import { extractCrawlSignals, findContactPath } from '@/lib/prospect-signals'
import { computeOpportunityScore, heuristicVerdict } from '@/lib/prospect-scoring'
import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'
import {
  getProspectingConfig,
  bumpProspectingCounter,
  getProspectingCounter,
  counterMonth,
} from './prospecting'

/**
 * Prospect enrichment — the "does this clinic need us?" pass. Per prospect:
 * Google Places (website/rating/review count) → homepage crawl (signals +
 * email discovery) → verdict (AI when configured + affordable, heuristic
 * fallback) → deterministic opportunity score. Everything is best-effort
 * and budget-gated (prospecting_counter vs config.budgets); a prospect is
 * only marked 'enriched' when Places actually ran, so a paused budget never
 * mislabels clinics as website-less.
 */

const BATCH_SIZE = 25
const CRAWL_UA = 'DreamCreateBot/1.0 (+https://www.dreamcreatestudio.com)'
const CRAWL_TIMEOUT_MS = 10_000
const CRAWL_MAX_BYTES = 1_000_000

// ── Crawl ───────────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string; bytes: number } | null> {
  const res = await fetch(url, {
    headers: { 'user-agent': CRAWL_UA, accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
  })
  if (!res.ok) return null
  const raw = await res.text()
  const html = raw.slice(0, CRAWL_MAX_BYTES)
  return { html, finalUrl: res.url || url, bytes: raw.length }
}

/** Cheap robots.txt politeness check: a blanket `Disallow: /` under `*` wins. */
async function robotsAllows(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': CRAWL_UA },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return true // no robots.txt = crawlable
    const text = (await res.text()).slice(0, 20_000)
    let inStar = false
    for (const line of text.split('\n')) {
      const l = line.trim().toLowerCase()
      if (l.startsWith('user-agent:')) inStar = l.includes('*')
      else if (inStar && /^disallow:\s*\/\s*$/.test(l)) return false
    }
    return true
  } catch {
    return true
  }
}

/**
 * Crawl a prospect's site: homepage signals + (when the homepage has no
 * mailto) one contact-page hop for email discovery. Null = unreachable.
 */
export async function crawlProspectSite(url: string): Promise<ProspectCrawlSignals | null> {
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const origin = new URL(normalized).origin
    if (!(await robotsAllows(origin))) {
      return {
        ssl: normalized.startsWith('https://'),
        mobileViewport: false,
        copyrightYear: null,
        titleTag: null,
        metaDescription: null,
        bookingWidget: false,
        socialLinks: {},
        builder: null,
        pageWeightKb: 0,
        emails: [],
        fetchedAt: new Date().toISOString(),
        error: 'robots_disallow',
      }
    }
    const page = await fetchPage(normalized)
    if (!page) return null
    const signals = extractCrawlSignals({ ...page, fetchedAt: new Date() })

    if (signals.emails.length === 0) {
      const contactPath = findContactPath(page.html)
      if (contactPath) {
        try {
          const contact = await fetchPage(`${new URL(page.finalUrl).origin}${contactPath}`)
          if (contact) {
            const extra = extractCrawlSignals({ ...contact, fetchedAt: new Date() })
            signals.emails = extra.emails
          }
        } catch {
          /* contact hop is a bonus, never a failure */
        }
      }
    }
    return signals
  } catch (err) {
    console.warn('[prospect-enrich] crawl failed', url, err instanceof Error ? err.message : err)
    return null
  }
}

// ── AI verdict ──────────────────────────────────────────────────────────────

const verdictSchema = z.object({
  websiteQuality: z.number().min(0).max(100),
  websiteReasons: z.array(z.string()).max(6),
  socialPresence: z.number().min(0).max(100),
  onlineBooking: z.boolean(),
  weaknesses: z.array(z.string()).max(6),
  summary: z.string().max(400),
})

async function aiVerdictForSite(input: {
  name: string
  city: string | null
  state: string | null
  signals: ProspectCrawlSignals
  reviewCount: number | null
  ratingTenths: number | null
}): Promise<ProspectAiVerdict | null> {
  const s = input.signals
  const summary = [
    `Practice: ${input.name} (${[input.city, input.state].filter(Boolean).join(', ')})`,
    `Google: ${input.ratingTenths != null ? (input.ratingTenths / 10).toFixed(1) + '★' : 'no rating'}, ${input.reviewCount ?? 'unknown'} reviews`,
    `HTTPS: ${s.ssl} · Mobile viewport: ${s.mobileViewport} · Copyright year: ${s.copyrightYear ?? 'none found'}`,
    `Title: ${s.titleTag ?? '(none)'} · Meta description: ${s.metaDescription ?? '(none)'}`,
    `Online booking markers: ${s.bookingWidget} · Site builder: ${s.builder ?? 'unknown/custom'} · Page weight: ${s.pageWeightKb}KB`,
    `Social profiles linked: ${Object.entries(s.socialLinks).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`,
  ].join('\n')

  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 1000,
      system:
        'You assess dental-practice websites for a dental marketing/CRM company deciding how much a practice needs help. Judge ONLY from the provided crawl signals — never invent facts. websiteQuality: 0-100 (mobile-unfriendly, no HTTPS, stale copyright, thin SEO, DIY builders lower it). socialPresence: 0-100 from linked profiles (none=0, one=30, several=60+). weaknesses: short lowercase phrases naming SPECIFIC verified gaps (e.g. "no online booking", "site not mobile-friendly", "footer says 2019") — these later personalize outreach emails, so only include what the signals prove.',
      messages: [{ role: 'user', content: summary }],
      toolName: 'record_website_verdict',
      toolDescription: 'Record the structured verdict for this dental practice website.',
      inputSchema: {
        type: 'object',
        properties: {
          websiteQuality: { type: 'number' },
          websiteReasons: { type: 'array', items: { type: 'string' } },
          socialPresence: { type: 'number' },
          onlineBooking: { type: 'boolean' },
          weaknesses: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        },
        required: [
          'websiteQuality',
          'websiteReasons',
          'socialPresence',
          'onlineBooking',
          'weaknesses',
          'summary',
        ],
      },
    })
    const parsed = verdictSchema.safeParse(raw)
    if (!parsed.success) return null
    return { hasWebsite: true, ...parsed.data }
  } catch (err) {
    console.warn('[prospect-enrich] AI verdict failed', err instanceof Error ? err.message : err)
    return null
  }
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export interface EnrichRunResult {
  scanned: number
  enriched: number
  placesLookups: number
  crawls: number
  aiScored: number
  errors: number
  skipped?: string
}

interface EnrichBudgetCtx {
  month: string
  budgets: { placesPerMonth: number; crawlsPerMonth: number; aiPerMonth: number }
  placesUsed: number
  crawlsUsed: number
  aiUsed: number
}

type ProspectRow = typeof schema.prospect.$inferSelect

/**
 * Enrich ONE prospect: Places → crawl → verdict → score → write. Mutates
 * the shared budget context (counters). `restoreStatus` is what the row
 * returns to on failure ('discovered' for the cron pool; the row's own
 * status for a manual re-enrich).
 */
async function enrichOneProspect(
  p: Pick<
    ProspectRow,
    'id' | 'name' | 'addressLine1' | 'city' | 'state' | 'email' | 'status'
  >,
  budget: EnrichBudgetCtx,
  out: EnrichRunResult,
  restoreStatus: string,
): Promise<void> {
  try {
    await db
      .update(schema.prospect)
      .set({ status: 'enriching', updatedAt: new Date() })
      .where(eq(schema.prospect.id, p.id))

    // 1) Places — website + reputation.
    const place = await findDentalPlace({
      name: p.name,
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
    })
    budget.placesUsed++
    out.placesLookups++
    await bumpProspectingCounter(budget.month, 'places_lookup')

    // A permanently-closed practice is not a prospect.
    if (place?.businessStatus === 'CLOSED_PERMANENTLY') {
      await db
        .update(schema.prospect)
        .set({
          status: 'disqualified',
          googlePlaceId: place.placeId,
          businessStatus: place.businessStatus,
          updatedAt: new Date(),
        })
        .where(eq(schema.prospect.id, p.id))
      return
    }

    const websiteUrl = place?.websiteUri ?? null

    // 2) Crawl (budget-gated; skipped = heuristic verdict still works).
    let signals: ProspectCrawlSignals | null = null
    if (websiteUrl && budget.crawlsUsed < budget.budgets.crawlsPerMonth) {
      signals = await crawlProspectSite(websiteUrl)
      budget.crawlsUsed++
      out.crawls++
      await bumpProspectingCounter(budget.month, 'crawl')
    }

    // 3) Verdict — AI for real websites (budget/config permitting),
    //    heuristic otherwise. No-website prospects never spend AI budget:
    //    the rules alone already put them at the top of the pile.
    let verdict: ProspectAiVerdict | null = null
    if (websiteUrl && signals && aiConfigured() && budget.aiUsed < budget.budgets.aiPerMonth) {
      verdict = await aiVerdictForSite({
        name: p.name,
        city: p.city,
        state: p.state,
        signals,
        reviewCount: place?.reviewCount ?? null,
        ratingTenths: place?.ratingTenths ?? null,
      })
      if (verdict) {
        budget.aiUsed++
        out.aiScored++
        await bumpProspectingCounter(budget.month, 'ai_score')
      }
    }
    if (!verdict) verdict = heuristicVerdict(signals, Boolean(websiteUrl))

    // 4) Deterministic score.
    const scored = computeOpportunityScore({
      verdict,
      reviewCount: place?.reviewCount ?? null,
      ratingTenths: place?.ratingTenths ?? null,
    })

    const crawledEmail = signals?.emails[0] ?? null
    // A manual re-enrich must never demote a prospect the pipeline has
    // already moved forward (contacted/engaged/call_list keep their status).
    const enrichedStatus =
      restoreStatus === 'discovered' || restoreStatus === 'enriched'
        ? 'enriched'
        : restoreStatus
    await db
      .update(schema.prospect)
      .set({
        websiteUrl,
        googlePlaceId: place?.placeId ?? null,
        googleRatingTenths: place?.ratingTenths ?? null,
        reviewCount: place?.reviewCount ?? null,
        businessStatus: place?.businessStatus ?? null,
        googleMapsUri: place?.googleMapsUri ?? null,
        enrichment: signals,
        aiVerdict: verdict,
        opportunityScore: scored.score,
        scoreBand: scored.band,
        scoreReasons: scored.reasons,
        // Email only ever from the clinic's own site; never overwrite a
        // manually-entered address.
        ...(crawledEmail && !p.email
          ? { email: crawledEmail, emailSource: 'crawl_mailto' }
          : {}),
        status: enrichedStatus,
        enrichedAt: new Date(),
        scoredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.prospect.id, p.id))
    out.enriched++
  } catch (err) {
    out.errors++
    console.warn('[prospect-enrich] failed for', p.id, err instanceof Error ? err.message : err)
    // Back to where it was — a transient failure retries later.
    await db
      .update(schema.prospect)
      .set({ status: restoreStatus, updatedAt: new Date() })
      .where(eq(schema.prospect.id, p.id))
  }
}

export async function runEnrichment(opts?: { batchSize?: number }): Promise<EnrichRunResult> {
  const config = await getProspectingConfig()
  const out: EnrichRunResult = {
    scanned: 0, enriched: 0, placesLookups: 0, crawls: 0, aiScored: 0, errors: 0,
  }
  if (config.killSwitch) return { ...out, skipped: 'kill_switch' }
  if (!placesConfigured()) return { ...out, skipped: 'places_not_configured' }

  const month = counterMonth()
  const budget: EnrichBudgetCtx = {
    month,
    budgets: config.budgets,
    placesUsed: await getProspectingCounter(month, 'places_lookup'),
    crawlsUsed: await getProspectingCounter(month, 'crawl'),
    aiUsed: await getProspectingCounter(month, 'ai_score'),
  }
  if (budget.placesUsed >= config.budgets.placesPerMonth) {
    return { ...out, skipped: 'places_budget' }
  }

  const batch = await db
    .select()
    .from(schema.prospect)
    .where(eq(schema.prospect.status, 'discovered'))
    .orderBy(asc(schema.prospect.createdAt))
    .limit(opts?.batchSize ?? BATCH_SIZE)

  for (const p of batch) {
    if (budget.placesUsed >= config.budgets.placesPerMonth) break
    out.scanned++
    await enrichOneProspect(p, budget, out, 'discovered')
  }
  return out
}

/**
 * Manual per-prospect refresh (the drawer's ↻ Re-enrich) — works on ANY
 * status (stale crawls, missed brand capture, corrected websites), keeps
 * pipeline-forward statuses intact, and still respects the monthly budgets.
 */
export async function reEnrichProspect(
  prospectId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const config = await getProspectingConfig()
  if (!placesConfigured()) return { ok: false, reason: 'places_not_configured' }

  const [p] = await db
    .select()
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (!p) return { ok: false, reason: 'not_found' }
  if (p.status === 'converted') return { ok: false, reason: 'already_converted' }

  const month = counterMonth()
  const budget: EnrichBudgetCtx = {
    month,
    budgets: config.budgets,
    placesUsed: await getProspectingCounter(month, 'places_lookup'),
    crawlsUsed: await getProspectingCounter(month, 'crawl'),
    aiUsed: await getProspectingCounter(month, 'ai_score'),
  }
  if (budget.placesUsed >= config.budgets.placesPerMonth) {
    return { ok: false, reason: 'budget' }
  }

  const out: EnrichRunResult = {
    scanned: 1, enriched: 0, placesLookups: 0, crawls: 0, aiScored: 0, errors: 0,
  }
  await enrichOneProspect(p, budget, out, p.status)
  return out.errors > 0 ? { ok: false, reason: 'enrich_failed' } : { ok: true }
}
