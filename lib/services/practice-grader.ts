import 'server-only'
import { randomBytes } from 'crypto'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { extractCrawlSignals } from '@/lib/prospect-signals'
import { heuristicVerdict } from '@/lib/prospect-scoring'
import { parseEmail, isJunkEmail } from '@/lib/prospect-email'
import { findDentalPlace, placesConfigured, type PlaceResult } from '@/lib/google-places'
import {
  gradeOnlinePresence,
  parsePracticeGradeResult,
  placeMatchesPractice,
  type PracticeGradeResult,
  type SearchCheck,
} from '@/lib/practice-grade'
import { extractDeepSiteSignals, type DeepSiteSignals } from '@/lib/practice-scan'
import { positionOfDomain, searchDentistRankings, serpConfigured } from '@/lib/serp'
import { GRADER_UTM_SOURCE } from '@/lib/marketing-attribution'
import type { ProspectCrawlSignals } from '@/lib/types/prospecting'

/**
 * The practice grader's server side (docs/marketing-engine.md, slice 2) —
 * the marketing site's first interactive surface. One run: light homepage
 * crawl ∥ Places lookup → the pure grade → a tokenized report row → a
 * courtesy email with the report link → the Hunter hook. The FORM ACTION
 * owns rate limiting + bot checks (this service assumes a vetted caller).
 *
 * Deliberate scope bounds:
 *  - HOMEPAGE ONLY, one fetch (the enrichment engine's contact-discovery
 *    sub-hops don't inform a grade and would triple the wall-clock of a
 *    form the visitor is watching).
 *  - NO AI: the heuristic verdict grades a public, unauthenticated request
 *    — an AI call per anonymous visitor is an abuse vector, and the
 *    heuristic's signals (SSL, mobile, booking, metadata) are the things
 *    the report names anyway.
 *  - The report link is shown IMMEDIATELY on-screen; the email is a
 *    courtesy copy the visitor asked for (transactional, platform
 *    identity), so a bounce costs nothing but the copy.
 */

const FETCH_TIMEOUT_MS = 10_000
const MAX_BYTES = 1_000_000
const USER_AGENT = 'DreamCreateBot/1.0 (+https://www.dreamcreatestudio.com)'

/** Normalize a visitor-typed website into a fetchable https URL; junk → null. */
export function normalizeWebsiteInput(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t) return null
  const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

/** One homepage fetch → crawl signals + the v2 deep scan. Never throws;
 *  failure returns an error-stamped stub so the grade can say "couldn't
 *  reach it" honestly. */
async function fetchHomepageSignals(
  url: string,
): Promise<{ signals: ProspectCrawlSignals; deep: DeepSiteSignals | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    })
    if (!res.ok) {
      return { signals: { ...emptySignals(), error: `http_${res.status}` }, deep: null }
    }
    const reader = res.body?.getReader()
    let html = ''
    let bytes = 0
    if (reader) {
      const decoder = new TextDecoder()
      while (bytes < MAX_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        html += decoder.decode(value, { stream: true })
      }
      try {
        await reader.cancel()
      } catch {
        /* stream already done */
      }
    } else {
      html = await res.text()
      bytes = html.length
    }
    const fetchMs = Date.now() - startedAt
    const signals = extractCrawlSignals({ html, finalUrl: res.url || url, bytes, fetchedAt: new Date() })
    const deep: DeepSiteSignals = { ...extractDeepSiteSignals(html), fetchMs }
    // Crawlability probes — two tiny best-effort fetches against the SITE's
    // origin (the final URL's, so a www redirect probes the right host).
    try {
      const origin = new URL(res.url || url).origin
      const probe = async (path: string): Promise<boolean | null> => {
        try {
          const r = await fetch(origin + path, {
            headers: { 'user-agent': USER_AGENT },
            signal: AbortSignal.timeout(4000),
          })
          return r.ok
        } catch {
          return null // unreachable ≠ missing — never a finding
        }
      }
      const [robotsTxt, sitemap] = await Promise.all([probe('/robots.txt'), probe('/sitemap.xml')])
      deep.robotsTxt = robotsTxt
      deep.sitemap = sitemap
    } catch {
      /* probes are decoration on the scan */
    }
    return { signals, deep }
  } catch {
    return { signals: { ...emptySignals(), error: 'fetch_failed' }, deep: null }
  } finally {
    clearTimeout(timer)
  }
}

function emptySignals(): ProspectCrawlSignals {
  return {
    ssl: false,
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
  }
}

export interface RunGradeInput {
  practiceName: string
  email: string
  city?: string | null
  state?: string | null
  websiteUrl?: string | null
}

export type RunGradeOutcome = { ok: true; token: string } | { ok: false; error: string }

export async function runPracticeGrade(input: RunGradeInput): Promise<RunGradeOutcome> {
  const practiceName = input.practiceName.trim().slice(0, 200)
  if (!practiceName) return { ok: false, error: 'Tell us your practice name.' }
  const parsedEmail = parseEmail(input.email)
  if (!parsedEmail || isJunkEmail(parsedEmail.email)) {
    return { ok: false, error: 'That email doesn’t look deliverable — check it and try again.' }
  }
  const city = input.city?.trim().slice(0, 100) || null
  const state = input.state?.trim().toUpperCase().slice(0, 2) || null
  const websiteUrl = normalizeWebsiteInput(input.websiteUrl)

  // The lookups run together — the visitor is watching this happen. The
  // search-rank check (v2) rides along when its driver is configured and a
  // city was given (the query IS "dentist in {city}").
  const checkedPlaces = placesConfigured()
  const [crawl, candidate, serp] = await Promise.all([
    websiteUrl ? fetchHomepageSignals(websiteUrl) : Promise.resolve(null),
    checkedPlaces
      ? findDentalPlace({ name: practiceName, city, state }).catch((): PlaceResult | null => null)
      : Promise.resolve(null),
    serpConfigured() && city ? searchDentistRankings({ city, state }) : Promise.resolve(null),
  ])
  const signals = crawl?.signals ?? null
  const deep: DeepSiteSignals | null = crawl?.deep ?? null

  // MATCH VERIFICATION (the first real runs' lesson): searchText returns
  // the closest-sounding practice ANYWHERE, so a candidate is trusted only
  // when it verifiably matches what the visitor described — otherwise the
  // Google axes grade as unknown, never as a stranger's numbers.
  const verified =
    candidate &&
    placeMatchesPractice(
      { practiceName, city, state, enteredUrl: websiteUrl },
      candidate,
    )
  const place = verified ? candidate : null
  const rejectedSimilar = Boolean(candidate && !verified)

  // Search visibility (v2): position of THEIR domain in the results a new
  // patient sees. The practice domain comes from the entered site, falling
  // back to a VERIFIED listing's website. No domain or no SERP data → the
  // axis stays hidden.
  let search: SearchCheck | null = null
  if (serp) {
    const domainSource = websiteUrl ?? (verified ? candidate?.websiteUri : null)
    if (domainSource) {
      try {
        const host = new URL(domainSource).hostname
        search = {
          query: serp.query,
          position: positionOfDomain(serp.organicHosts, host),
          // Gadget fuel: the page-one board shows WHO owns the page.
          hosts: serp.organicHosts.slice(0, 10),
        }
      } catch {
        search = null
      }
    }
  }

  const crawled = signals && !signals.error ? signals : null
  const verdict = crawled ? heuristicVerdict(crawled, true) : null
  const grade = gradeOnlinePresence({
    enteredUrl: websiteUrl,
    signals,
    verdict,
    deep,
    place: place
      ? {
          placeId: place.placeId,
          displayName: place.displayName,
          formattedAddress: place.formattedAddress,
          websiteUri: place.websiteUri,
          ratingTenths: place.ratingTenths,
          reviewCount: place.reviewCount,
          businessStatus: place.businessStatus,
          googleMapsUri: place.googleMapsUri,
        }
      : null,
    placesChecked: checkedPlaces,
    rejectedSimilar,
    search,
  })

  const token = randomBytes(16).toString('hex')
  const id = newId('pgrd')

  // The Hunter hook — best-effort, never blocks the report. An existing
  // prospect matched by email gets the warm signal; a name+state match is
  // linked without a promotion (a shared name is not an email); a stranger
  // is minted as a grader-sourced prospect.
  let prospectId: string | null = null
  try {
    const [byEmail] = await db
      .select({ id: schema.prospect.id })
      .from(schema.prospect)
      .where(sql`lower(${schema.prospect.email}) = ${parsedEmail.email}`)
      .limit(1)
    if (byEmail) {
      prospectId = byEmail.id
      const { promoteProspectByEmail } = await import('./prospect-intent')
      await promoteProspectByEmail(parsedEmail.email, 'grader_run')
    } else {
      const { findExistingProspect, addGraderProspect } = await import('./prospecting')
      const existing = await findExistingProspect({ name: practiceName, state })
      if (existing) {
        prospectId = existing.id
      } else {
        const summary =
          grade.overall != null
            ? `Ran the practice grader — scored ${grade.overall}/100 (${grade.letter}).`
            : 'Ran the practice grader on the marketing site.'
        const created = await addGraderProspect({
          name: practiceName,
          email: parsedEmail.email,
          city,
          state,
          websiteUrl,
          gradeSummary: summary,
        })
        prospectId = created.id
      }
    }
  } catch (err) {
    console.warn('[practice-grader] hunter hook failed', err)
  }

  await db.insert(schema.practiceGrade).values({
    id,
    token,
    email: parsedEmail.email,
    practiceName,
    city,
    state,
    websiteUrl,
    placeId: place?.placeId ?? null,
    result: grade,
    prospectId,
  })

  // Courtesy copy — the report the visitor asked for, from the platform
  // identity (transactional; the cold-outreach subdomain is for cold mail).
  try {
    const { deliver, authEmailShell } = await import('@/lib/email')
    const base =
      process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') ||
      'https://www.dreamcreatestudio.com'
    const reportUrl = `${base}/g/${token}?utm_source=${GRADER_UTM_SOURCE}&utm_medium=email`
    const gradeLine =
      grade.overall != null && grade.letter
        ? `<strong>${practiceName}</strong> graded <strong>${grade.letter}</strong> (${grade.overall}/100).`
        : `Here’s the report for <strong>${practiceName}</strong>.`
    await deliver({
      to: parsedEmail.email,
      subject: `${practiceName} — your online presence grade`,
      html: authEmailShell({
        heading: 'Your practice’s online grade',
        introHtml: `<p>${gradeLine}</p><p>The full report — your website, your Google listing, and your reviews, with what patients actually experience — is one click away. It’s yours; share it with whoever runs your front desk.</p>`,
        buttonUrl: reportUrl,
        buttonLabel: 'See the full report',
        footnoteHtml:
          'You asked for this one-time report at dreamcreatestudio.com — there’s nothing to unsubscribe from.',
      }),
      tags: [{ name: 'kind', value: 'practice-grade' }],
    })
  } catch (err) {
    console.warn('[practice-grader] report email failed', err)
  }

  return { ok: true, token }
}

export interface PublicGradeView {
  practiceName: string
  city: string | null
  state: string | null
  websiteUrl: string | null
  result: PracticeGradeResult
  createdAt: Date
}

/** Token-IS-auth read for the public /g/[token] report page. Malformed
 *  stored results read as a miss (404), never rendered garbage. */
export async function getGradeByToken(token: string): Promise<PublicGradeView | null> {
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return null
  const [row] = await db
    .select()
    .from(schema.practiceGrade)
    .where(eq(schema.practiceGrade.token, token))
    .limit(1)
  if (!row) return null
  const result = parsePracticeGradeResult(row.result)
  if (!result) return null
  return {
    practiceName: row.practiceName,
    city: row.city,
    state: row.state,
    websiteUrl: row.websiteUrl,
    result,
    createdAt: row.createdAt,
  }
}
