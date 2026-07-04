import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { findDentalPlace, placesConfigured } from '@/lib/google-places'
import { extractCrawlSignals, extractSiteEmails, findContactPath, findTeamPaths } from '@/lib/prospect-signals'
import { detectVendors, type DetectedVendor } from '@/lib/prospect-vendors'
import { computeOpportunityScore, heuristicVerdict } from '@/lib/prospect-scoring'
import { syncProspectContacts } from './prospect-contacts'
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

    // Email-discovery hops: the contact page, then up to two team/about
    // pages (where a named dentist's personal address often lives). Each hop
    // MERGES into the set — we want every real address, not just the first,
    // so the contact ranker can prefer drjane@ over info@. Cap the hops so a
    // sprawling site can't balloon the crawl.
    const pageOrigin = new URL(page.finalUrl).origin
    const emails = new Set(signals.emails)
    // Vendor fingerprints (the deal room) — a booking widget or review tool
    // often only appears on a subpage, so accumulate across the hops too.
    const vendorByName = new Map<string, DetectedVendor>()
    for (const v of detectVendors(page.html)) vendorByName.set(v.name, v)
    const hops: string[] = []
    const contactPath = findContactPath(page.html)
    if (contactPath) hops.push(contactPath)
    for (const p of findTeamPaths(page.html, 2)) hops.push(p)
    for (const path of hops.slice(0, 3)) {
      if (emails.size >= 6 && vendorByName.size >= 4) break
      try {
        const sub = await fetchPage(`${pageOrigin}${path}`)
        if (sub) {
          for (const e of extractSiteEmails(sub.html)) emails.add(e)
          for (const v of detectVendors(sub.html)) vendorByName.set(v.name, v)
        }
      } catch {
        /* a discovery hop is a bonus, never a failure */
      }
    }
    signals.emails = Array.from(emails).slice(0, 10)
    signals.vendors = Array.from(vendorByName.values())
    return signals
  } catch (err) {
    console.warn('[prospect-enrich] crawl failed', url, err instanceof Error ? err.message : err)
    return null
  }
}

// ── AI verdict ──────────────────────────────────────────────────────────────

// Tolerant shape — enforce TYPES, not lengths/ranges (the model occasionally
// returns 7 reasons or a 105 score). We clamp the extras in code below rather
// than reject a good verdict into the weaker heuristic fallback.
const verdictSchema = z.object({
  websiteQuality: z.number(),
  websiteReasons: z.array(z.string()).default([]),
  socialPresence: z.number(),
  onlineBooking: z.boolean(),
  weaknesses: z.array(z.string()).default([]),
  summary: z.string().default(''),
})
const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const clampList = (xs: string[]) => xs.map((s) => s.slice(0, 160)).filter(Boolean).slice(0, 6)

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
    const d = parsed.data
    return {
      hasWebsite: true,
      websiteQuality: clampScore(d.websiteQuality),
      websiteReasons: clampList(d.websiteReasons),
      socialPresence: clampScore(d.socialPresence),
      onlineBooking: d.onlineBooking,
      weaknesses: clampList(d.weaknesses),
      summary: d.summary.slice(0, 400),
    }
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
    'id' | 'name' | 'addressLine1' | 'city' | 'state' | 'email' | 'emailSource' | 'authorizedOfficialName' | 'status'
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
        status: enrichedStatus,
        enrichedAt: new Date(),
        scoredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.prospect.id, p.id))

    // Reachability: classify + MX-verify + rank every discovered address into
    // prospect_contact, and point prospect.email at the best deliverable one
    // (a named dentist over a shared desk). Best-effort — never fails the
    // enrich. Also verifies a legacy prospect.email that isn't re-crawled.
    try {
      await syncProspectContacts(
        { id: p.id, authorizedOfficialName: p.authorizedOfficialName, email: p.email, emailSource: p.emailSource },
        signals?.emails ?? [],
      )
    } catch (err) {
      console.warn('[prospect-enrich] contact sync failed', p.id, err instanceof Error ? err.message : err)
    }
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
