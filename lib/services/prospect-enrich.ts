import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { findDentalPlaceCandidates, placesConfigured } from '@/lib/google-places'
import { detectStack, extractCrawlSignals, extractSiteEmails, findContactPath, findTeamPaths } from '@/lib/prospect-signals'
import { detectVendors, type DetectedVendor } from '@/lib/prospect-vendors'
import { computeOpportunityScore, fitScoreInputs, heuristicVerdict } from '@/lib/prospect-scoring'
import { syncProspectContacts } from './prospect-contacts'
import { robotsAllows } from './prospect-crawl-policy'
import {
  applyOutreachHold,
  closeVerifyRun,
  listingColumns,
  newVerifyRunCtx,
  verifyProspectSignals,
  type VerifyRunCtx,
} from './prospect-verify'
import {
  MAX_REDIRECTS,
  fetchGuarded,
  guardedSession,
  readBodyCapped,
  type GuardedFetchDeps,
  type GuardedSession,
} from './prospect-site-liveness'
import { crawlWasRead, type ProspectAiVerdict, type ProspectCrawlSignals } from '@/lib/types/prospecting'
import {
  getProspectingConfig,
  bumpProspectingCounter,
  getProspectingCounter,
  counterMonth,
} from './prospecting'

/**
 * Prospect enrichment — the "does this clinic need us?" pass. Per prospect:
 * Google Places candidates → VERIFICATION (P-01: the listing is MATCHED
 * against the registry record, never taken blind; NPI liveness; website
 * liveness; phone validity — lib/services/prospect-verify.ts) → homepage
 * crawl (signals + email discovery) → verdict (AI when configured +
 * affordable, heuristic fallback) → deterministic opportunity score.
 * Everything is best-effort and budget-gated (prospecting_counter vs
 * config.budgets); a prospect is only marked 'enriched' when Places
 * actually ran, so a paused budget never mislabels clinics as website-less.
 */

const BATCH_SIZE = 25
const CRAWL_TIMEOUT_MS = 10_000
const CRAWL_MAX_BYTES = 1_000_000

// ── Crawl ───────────────────────────────────────────────────────────────────

/**
 * One page through THE ONE GUARDED FETCH (prospect-site-liveness): every
 * target and every redirect hop is resolved and judged before it is
 * fetched (a private address, a non-standard port, a non-web scheme stop
 * the walk), the connect is bound to the judged addresses, nothing of a
 * redirect's body is read, and the body is streamed and cut at the byte
 * cap — never the whole body in memory first. Null = unreachable / refused.
 */
async function fetchPage(
  session: GuardedSession,
  url: string,
): Promise<{ html: string; finalUrl: string; bytes: number } | null> {
  const r = await fetchGuarded(session, new URL(url), {
    method: 'GET',
    timeoutMs: CRAWL_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
  })
  if (r.kind !== 'ok') return null
  if (!r.res.ok) {
    try {
      await r.res.body?.cancel?.()
    } catch {
      /* nothing to drain */
    }
    return null
  }
  const html = await readBodyCapped(r.res, CRAWL_MAX_BYTES)
  return { html, finalUrl: r.url.toString(), bytes: html.length }
}

/**
 * Crawl a prospect's site: homepage signals + (when the homepage has no
 * mailto) one contact-page hop for email discovery. Null = unreachable.
 * The crawler is not a proxy either: it rides the probe's guarded session
 * (`deps` inject the network edges for the tests).
 */
/** The crawl errors the record keeps (`enrichment.error`): robots.txt
 *  refused us, or the page did not answer. Either way NOBODY READ THE
 *  PAGE: the stack is null (unknown), the builder unknown, nothing earned. */
export type CrawlError = 'robots_disallow' | 'fetch_failed'

/** An UNREAD crawl, stored so the record says why (fix pass II, V13 — the
 *  Fit card's "Not read" names the reason; a fetch failure used to leave
 *  `enrichment` null and the card blind). Its page facts are ZEROS, not
 *  observations: every reader gates on `crawlWasRead` (the shared
 *  predicate beside the type in lib/types/prospecting.ts — client-safe,
 *  which this server-only module is not), and the enrich pass below never
 *  hands a stub to the verdict or the score (fix pass III, W4 / W7). */
export function unreadCrawlSignals(url: string, error: CrawlError, at: Date = new Date()): ProspectCrawlSignals {
  return {
    ssl: /^https:\/\//i.test(url),
    mobileViewport: false,
    copyrightYear: null,
    titleTag: null,
    metaDescription: null,
    bookingWidget: false,
    socialLinks: {},
    builder: null,
    stack: null,
    pageWeightKb: 0,
    emails: [],
    fetchedAt: at.toISOString(),
    error,
  }
}

export async function crawlProspectSite(url: string, deps: GuardedFetchDeps = {}): Promise<ProspectCrawlSignals | null> {
  let session: GuardedSession | null = null
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const base = new URL(normalized)
    const origin = base.origin
    session = guardedSession(base, deps)
    // robots.txt through the same guarded fetch: judged, pinned, never
    // followed, read through the capped stream.
    if (!(await robotsAllows(origin, session.fetch))) {
      // Nobody read the page: the stack is UNKNOWN (null), never "looked,
      // none" — the no-stack credit is for a page somebody read.
      return unreadCrawlSignals(normalized, 'robots_disallow')
    }
    const page = await fetchPage(session, normalized)
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
    // The competitor stack (P-04, the opportunity score) rides the same hops.
    const stack = new Set(signals.stack ?? [])
    const hops: string[] = []
    const contactPath = findContactPath(page.html)
    if (contactPath) hops.push(contactPath)
    for (const p of findTeamPaths(page.html, 2)) hops.push(p)
    for (const path of hops.slice(0, 3)) {
      if (emails.size >= 6 && vendorByName.size >= 4) break
      try {
        const sub = await fetchPage(session, `${pageOrigin}${path}`)
        if (sub) {
          for (const e of extractSiteEmails(sub.html)) emails.add(e)
          for (const v of detectVendors(sub.html)) vendorByName.set(v.name, v)
          for (const s of detectStack(sub.html)) stack.add(s)
        }
      } catch {
        /* a discovery hop is a bonus, never a failure */
      }
    }
    signals.emails = Array.from(emails).slice(0, 10)
    signals.vendors = Array.from(vendorByName.values())
    signals.stack = Array.from(stack)
    return signals
  } catch (err) {
    console.warn('[prospect-enrich] crawl failed', url, err instanceof Error ? err.message : err)
    return null
  } finally {
    session?.close()
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
    // Only a READ page reaches this prompt (W4) — a stub never does.
    `Booking / review tools fingerprinted on the site: ${Array.isArray(s.stack) ? (s.stack.length > 0 ? s.stack.join(', ') : 'none') : 'not read'}`,
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
  /** Retired NPIs + permanently closed listings the verification pass set aside. */
  disqualified: number
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
 * Enrich ONE prospect: Places candidates → verify (match + liveness +
 * phone) → crawl → verdict → score → write. Mutates the shared budget
 * context (counters). `restoreStatus` is what the row returns to on
 * failure ('discovered' for the cron pool; the row's own status for a
 * manual re-enrich).
 */
async function enrichOneProspect(
  p: ProspectRow,
  budget: EnrichBudgetCtx,
  out: EnrichRunResult,
  restoreStatus: string,
  verifyCtx: VerifyRunCtx,
): Promise<void> {
  try {
    await db
      .update(schema.prospect)
      .set({ status: 'enriching', updatedAt: new Date() })
      .where(eq(schema.prospect.id, p.id))

    // 1) Places — up to three candidate listings (one metered request).
    const places = await findDentalPlaceCandidates({
      name: p.name,
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
    })
    budget.placesUsed++
    out.placesLookups++
    await bumpProspectingCounter(budget.month, 'places_lookup')

    // 1b) VERIFY (P-01). The matcher decides which candidate — if any — is
    // this practice; only a REAL match's data is copied below. A retired
    // NPI or a permanently closed listing disqualifies here, before a crawl
    // or an AI call is spent on a practice that no longer exists.
    const verified = await verifyProspectSignals(p, places, verifyCtx)
    const place = verified.place
    if (verified.patch.status === 'disqualified') {
      await db
        .update(schema.prospect)
        .set({
          ...listingColumns(verified),
          ...verified.patch,
          updatedAt: new Date(),
        })
        .where(eq(schema.prospect.id, p.id))
      // A practice that is gone leaves the drip too (a re-enrich can land
      // here on a row a human enrolled) — and a cold caller's slot (P-02 /
      // P-04: a chain is nobody's to dial).
      await applyOutreachHold(p.id, verified.patch, verifyCtx.now)
      const { releaseIfUnservable } = await import('./prospect-caller-release')
      await releaseIfUnservable(p.id, verifyCtx.now)
      out.disqualified++
      return
    }

    const websiteUrl = verified.websiteUrl
    const websiteStatus = verified.patch.verification.website?.status

    // 2) Crawl (budget-gated; skipped = heuristic verdict still works). A
    //    dead or parked site is not crawled — there is nothing to read and
    //    the quality score already parks the record. A URL the probe
    //    REFUSED on policy (a private address, an odd port, a redirect into
    //    one) is never handed to the crawler either — whatever the stored
    //    signal says.
    let signals: ProspectCrawlSignals | null = null
    // A crawl that was tried and could not read the page — robots.txt
    // refused us, or the fetch failed / answered non-2xx — is stored as an
    // UNREAD crawl (V13, W4): the record says why, and the verdict and the
    // score see NO signals (a stub's zeros are not page facts; the AI is
    // never told "mobile viewport false" about a page nobody read).
    let unread: ProspectCrawlSignals | null = null
    if (
      websiteUrl &&
      websiteStatus !== 'dead' &&
      websiteStatus !== 'parked' &&
      verified.liveness?.cause !== 'policy' &&
      budget.crawlsUsed < budget.budgets.crawlsPerMonth
    ) {
      const crawled = await crawlProspectSite(websiteUrl)
      if (crawlWasRead(crawled)) signals = crawled
      else unread = crawled ?? unreadCrawlSignals(websiteUrl, 'fetch_failed')
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

    // 4) Deterministic score — with what the crawl and the registry already
    //    told us (P-04): the competitor stack, the builder, a new practice,
    //    the practice size. Never a new fetch.
    const scored = computeOpportunityScore({
      verdict,
      reviewCount: place?.reviewCount ?? null,
      ratingTenths: place?.ratingTenths ?? null,
      stack: signals?.stack ?? null,
      builder: signals?.builder ?? null,
      ...fitScoreInputs(verified.patch.verification),
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
        // Reputation + listing fields come from the MATCHED place only; a
        // no-match clears the old listing's, a pass with no lookup keeps
        // them, and only a listing that states a website replaces one.
        ...listingColumns(verified),
        enrichment: signals ?? unread,
        aiVerdict: verdict,
        opportunityScore: scored.score,
        scoreBand: scored.band,
        scoreReasons: scored.reasons,
        // The verification columns (signals, quality, phone standing, a
        // refreshed address) — see lib/services/prospect-verify.ts.
        ...verified.patch,
        status: enrichedStatus,
        enrichedAt: new Date(),
        scoredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.prospect.id, p.id))

    // The hold on its outreach: a reversible retired-practice signal
    // (temporarily closed, a dead or parked site) PAUSES a live drip; a
    // pass that finds the signal recovered resumes it.
    await applyOutreachHold(p.id, verified.patch, verifyCtx.now)

    // A re-enrich on a RESTING row (the drawer offers it) re-verifies by
    // construction: an improved quality wakes it, anything else keeps the
    // resting sentence in front — exactly as the verify pass reconciles.
    if (restoreStatus === 'dormant') {
      const { reconcileDormantAfterVerify } = await import('./prospect-hygiene')
      await reconcileDormantAfterVerify(p.id, p.qualityScore, verifyCtx.now, { priorReasons: p.qualityReasons })
    }

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
    scanned: 0, enriched: 0, placesLookups: 0, crawls: 0, aiScored: 0, errors: 0, disqualified: 0,
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

  const verifyCtx = await newVerifyRunCtx(config)
  for (const p of batch) {
    if (budget.placesUsed >= config.budgets.placesPerMonth) break
    out.scanned++
    await enrichOneProspect(p, budget, out, 'discovered', verifyCtx)
  }
  await closeVerifyRun(verifyCtx)
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
  // A merged duplicate is enriched on its survivor — the folded row never
  // flips to 'enriching' (P-03).
  if (p.status === 'merged') return { ok: false, reason: 'merged' }

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
    scanned: 1, enriched: 0, placesLookups: 0, crawls: 0, aiScored: 0, errors: 0, disqualified: 0,
  }
  // A re-enrich re-verifies by construction — same pass, own run context.
  const verifyCtx = await newVerifyRunCtx(config)
  await enrichOneProspect(p, budget, out, p.status, verifyCtx)
  await closeVerifyRun(verifyCtx)
  return out.errors > 0 ? { ok: false, reason: 'enrich_failed' } : { ok: true }
}
