import 'server-only'
import { and, asc, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { lookupNpi } from '@/lib/nppes'
import { findDentalPlaceCandidates, placesConfigured, type PlaceResult, type PlacesSearchOutcome } from '@/lib/google-places'
import { pickMatchingPlace, type PlaceMatch } from '@/lib/prospect-match'
import { NANP_FAILURE_LABELS, nanpDigits, validateNanp } from '@/lib/phone-nanp'
import { computeQualityScore } from '@/lib/prospect-quality'
import {
  PARKED_RECHECK_DAYS,
  VERIFY_STALE_DAYS,
  formatProspectPhone,
  parseVerification,
  type ProspectVerification,
  type ProspectingConfig,
  type VerificationSignal,
} from '@/lib/types/prospecting'
import {
  BAD_PHONE_STATUSES,
  type ProspectPhoneLineType,
  type ProspectPhoneSource,
  type ProspectPhoneStatus,
  type ProspectQualityBand,
  type ProspectWebsiteSource,
} from '@/lib/db/schema/prospecting'
import { checkSiteLiveness, type SiteLiveness } from './prospect-site-liveness'
import { phoneValidateDriver, validatePhoneLine } from './phone-validate'
import { reportProspectingFailure, type ProspectingFailureClass } from './engine-failures'
import {
  bumpProspectingCounter,
  clearSystemFollowUp,
  counterMonth,
  getProspectingConfig,
  getProspectingCounter,
  pauseActiveEnrollments,
  resumeVerifyPausedEnrollments,
  stopActiveEnrollments,
} from './prospecting'

/**
 * PROSPECT VERIFICATION (P-01) — "nothing but the best possible leads".
 *
 * The owner's words: a lot of the leads have disconnected numbers or are
 * retired practices. Enrichment used to take Google's first result blind
 * and never asked the registry, the website or a carrier whether the
 * practice still existed. This is the pass that asks, per prospect:
 *
 *   places    is the listing REALLY this practice (name / street+ZIP / phone)?
 *   business  does Google say it is open, temporarily closed, or gone?
 *   npi       is the NPI still active? (free, keyless) — a deactivated NPI
 *             is a retired dentist; a moved location refreshes the address
 *   website   does the site answer, or is it dead / a parking page?
 *   phone     NANP syntax, then the carrier line type (metered, optional)
 *   reach     written only by logCallOutcome — a human got through
 *
 * Every signal is stored with its source and checked-at, the quality score
 * is computed from the stored signals (lib/prospect-quality.ts), and the
 * floor in prospecting_config decides who gets served. Every external call
 * is metered + fail-open: a refused key is ONE engine strike a day, never a
 * blocked pass — and a check that could not run (an outage, a refused or
 * missing key, a used-up budget, a resolver hiccup) KEEPS the prior signal
 * and the row's stored listing facts; nothing is ever re-scored from
 * "unchecked" when a real signal exists. Runs inline in the enrich pass, in
 * the re-verify sweep (same cron), on a manual re-enrich, and behind the
 * drawer's "Verify now".
 */

const DAY_MS = 24 * 60 * 60 * 1000
export const SWEEP_BATCH_SIZE = 25
/** NPPES is free, but a run stays polite. */
export const NPPES_PER_RUN = 50
/** Below this many liveness checks a run cannot tell "our egress is blocked"
 *  from "a few dead sites". */
const CRAWL_BLOCKED_MIN_CHECKS = 5

type ProspectRow = typeof schema.prospect.$inferSelect

/** What the verifier reads off a prospect row (the enrich pass hands it the
 *  full row; the fields a hand-added row lacks are simply null). */
export type VerifiableProspect = Pick<
  ProspectRow,
  | 'id'
  | 'name'
  | 'npiNumber'
  | 'addressLine1'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'phone'
  | 'phoneSource'
  | 'phoneStatus'
  | 'websiteUrl'
  | 'verification'
  | 'status'
> &
  /** The stored listing facts — what the score reads when no fresh lookup
   *  ran — and where the website came from (a listing's goes with the listing). */
  Partial<Pick<ProspectRow, 'businessStatus' | 'reviewCount' | 'websiteSource'>>

/** Per-run context — budgets, the once-a-run failure strikes, the
 *  crawl-blocked tally. One per cron run; the drawer action makes its own. */
export interface VerifyRunCtx {
  now: Date
  month: string
  phoneValidateBudget: number
  phoneValidateUsed: number
  nppesLeft: number
  /** Website probes run only while the crawl budget is above zero — the one
   *  knob that pauses touching prospects' sites pauses this too. */
  siteChecks: boolean
  reported: Set<ProspectingFailureClass>
  liveness: { checks: number; networkDead: number }
}

export async function newVerifyRunCtx(config: ProspectingConfig, now = new Date()): Promise<VerifyRunCtx> {
  const month = counterMonth(now)
  return {
    now,
    month,
    phoneValidateBudget: config.budgets.phoneValidatePerMonth,
    phoneValidateUsed: await getProspectingCounter(month, 'phone_validate'),
    nppesLeft: NPPES_PER_RUN,
    siteChecks: config.budgets.crawlsPerMonth > 0,
    reported: new Set(),
    liveness: { checks: 0, networkDead: 0 },
  }
}

async function strike(ctx: VerifyRunCtx, cls: ProspectingFailureClass): Promise<void> {
  if (ctx.reported.has(cls)) return
  ctx.reported.add(cls)
  try {
    await reportProspectingFailure(cls, ctx.now)
  } catch (e) {
    console.error('[prospect-verify] failure report failed', e)
  }
}

/** The columns a verification pass writes. `status` is set only when the
 *  pass DISQUALIFIES (retired NPI, permanently closed listing). */
export interface VerifyPatch {
  verification: ProspectVerification
  verifiedAt: Date
  qualityScore: number
  qualityBand: ProspectQualityBand
  qualityReasons: string[]
  phone: string | null
  phoneStatus: ProspectPhoneStatus
  phoneLineType: ProspectPhoneLineType | null
  phoneSource: ProspectPhoneSource | null
  phoneValidatedAt: Date | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  status?: 'disqualified'
  suppressedReason?: 'retired' | 'closed'
  suppressedAt?: Date
}

export interface VerifyOutcome {
  patch: VerifyPatch
  /** The MATCHED listing only — never a blind first result. */
  place: PlaceResult | null
  match: PlaceMatch | null
  /** The website the pass judged (the matched listing's, else the row's —
   *  null once a no-match took a listing's website with it). */
  websiteUrl: string | null
  /** Where that website came from: `places` for a matched listing's, null
   *  once a listing's was cleared, undefined = the row's own stands. */
  websiteSource?: ProspectWebsiteSource | null
  liveness: SiteLiveness | null
  /** What happens to the row's listing columns (place id, rating, review
   *  count, business status, maps link): `matched` writes the listing's,
   *  `cleared` nulls a listing Google no longer stands behind (no match /
   *  not found), `kept` leaves them alone because no lookup ran. */
  listing: 'matched' | 'cleared' | 'kept'
}

/** Pure: did the row's website come from a Google listing? The source
 *  column says so; a legacy row (no source) got it from the blind Places
 *  copy exactly when it was discovered from the registry (an NPI) — the
 *  hand-added rows (no NPI) typed theirs. */
export function websiteCameFromPlaces(p: Pick<VerifiableProspect, 'websiteSource' | 'npiNumber'>): boolean {
  if (p.websiteSource) return p.websiteSource === 'places'
  return Boolean(p.npiNumber)
}

/**
 * The listing columns a verification outcome writes — ONE answer for the
 * enrich pass and the standalone verify. A no-match clears the old
 * listing's rating, review count, business status, place id and maps link
 * (they were the stranger's) — and the listing's WEBSITE with them, since
 * it was the stranger's too; a pass that could not look the listing up
 * leaves them as they are. A matched listing that states a website
 * replaces the row's (source: places); nothing ever overwrites a website
 * someone typed.
 */
export function listingColumns(
  out: Pick<VerifyOutcome, 'place' | 'listing' | 'websiteUrl' | 'websiteSource'>,
): Partial<Pick<ProspectRow, 'googlePlaceId' | 'googleRatingTenths' | 'reviewCount' | 'businessStatus' | 'googleMapsUri' | 'websiteUrl' | 'websiteSource'>> {
  const website: Partial<Pick<ProspectRow, 'websiteUrl' | 'websiteSource'>> =
    out.websiteSource === undefined ? { websiteUrl: out.websiteUrl } : { websiteUrl: out.websiteUrl, websiteSource: out.websiteSource }
  if (out.place) {
    return {
      googlePlaceId: out.place.placeId,
      googleRatingTenths: out.place.ratingTenths,
      reviewCount: out.place.reviewCount,
      businessStatus: out.place.businessStatus,
      googleMapsUri: out.place.googleMapsUri,
      ...website,
    }
  }
  if (out.listing === 'cleared') {
    return {
      googlePlaceId: null,
      googleRatingTenths: null,
      reviewCount: null,
      businessStatus: null,
      googleMapsUri: null,
      ...website,
    }
  }
  return website
}

/**
 * Why a verification pass STOPS an active outreach sequence for good — the
 * same stop a logged `closed` call makes: a disqualified practice (retired
 * NPI, permanently closed) is gone. Null = not a stop.
 */
export function outreachStopReason(patch: Pick<VerifyPatch, 'status' | 'suppressedReason'>): string | null {
  if (patch.status === 'disqualified') return `verify_${patch.suppressedReason ?? 'disqualified'}`
  return null
}

/**
 * Why a verification pass PAUSES an active outreach sequence — a park on a
 * reversible retired-practice signal (temporarily closed, a dead or parked
 * website). A 503 at sweep time is not the end of a drip: the park is
 * re-checked in PARKED_RECHECK_DAYS, and the pass that finds the site back
 * resumes the sequence. A phone verdict alone never touches the drip — the
 * email is a different door. Null = not a pause.
 */
export function outreachPauseReason(patch: Pick<VerifyPatch, 'verification'>): string | null {
  const v = patch.verification
  if (v.business?.status === 'temporarily_closed') return 'verify_temporarily_closed'
  if (v.website?.status === 'dead' || v.website?.status === 'parked') return `verify_site_${v.website.status}`
  return null
}

/**
 * THE ONE HOLD a verification outcome puts on a prospect's outreach — the
 * standalone verify, the sweep and the enrich pass all call it:
 *   stop    gone for good (disqualified) — the drip stops, as a closed call does
 *   pause   a reversible park — the drip pauses with the reason
 *   resume  no park any more — a drip this pass paused earlier resumes
 * A stop or a pause also clears the SYSTEM-scheduled follow-up (a no-answer
 * or voicemail nudge), so the follow-up bucket never dials a parked
 * practice; a callback a human promised is kept.
 */
export async function applyOutreachHold(
  prospectId: string,
  patch: Pick<VerifyPatch, 'status' | 'suppressedReason' | 'verification'>,
  now: Date,
): Promise<'stop' | 'pause' | 'resume'> {
  const stop = outreachStopReason(patch)
  if (stop) {
    await stopActiveEnrollments(prospectId, stop, now)
    await clearSystemFollowUp(prospectId, now)
    return 'stop'
  }
  const pause = outreachPauseReason(patch)
  if (pause) {
    await pauseActiveEnrollments(prospectId, pause, now)
    await clearSystemFollowUp(prospectId, now)
    return 'pause'
  }
  await resumeVerifyPausedEnrollments(prospectId, now)
  return 'resume'
}

function sig(status: string, detail: string | null, source: string, now: Date): VerificationSignal {
  return { status, detail, checkedAt: now.toISOString(), source }
}

function sameAddress(a: string | null, b: string | null): boolean {
  const norm = (v: string | null) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return norm(a) === norm(b)
}

function isNetworkDead(l: SiteLiveness): boolean {
  return l.status === 'dead' && l.httpStatus == null
}

/**
 * Run every signal for one prospect against an already-fetched Places
 * outcome (the caller meters that lookup). Writes nothing; returns the
 * column patch + the matched listing for the caller to merge.
 */
export async function verifyProspectSignals(
  p: VerifiableProspect,
  places: PlacesSearchOutcome | null,
  ctx: VerifyRunCtx,
): Promise<VerifyOutcome> {
  const now = ctx.now
  const prior = parseVerification(p.verification)
  const v: ProspectVerification = {}
  // A call's verdicts survive every re-verify (below, the phone one is kept
  // only while the number is the same).
  if (prior.reach) v.reach = prior.reach

  const patch: VerifyPatch = {
    verification: v,
    verifiedAt: now,
    qualityScore: 0,
    qualityBand: 'parked',
    qualityReasons: [],
    phone: p.phone ?? null,
    phoneStatus: 'unknown',
    phoneLineType: null,
    phoneSource: (p.phoneSource as ProspectPhoneSource | null) ?? (p.phone ? (p.npiNumber ? 'nppes' : 'caller') : null),
    phoneValidatedAt: null,
  }
  let addressLine1 = p.addressLine1 ?? null
  let city = p.city ?? null
  let state = p.state ?? null
  let postalCode = p.postalCode ?? null
  const originalPhone = p.phone ?? null
  const phoneNotes: string[] = []

  // ── NPI liveness ─────────────────────────────────────────────────────────
  if (!p.npiNumber) {
    v.npi = sig('none', 'No NPI on record (added by hand)', 'nppes', now)
  } else if (ctx.nppesLeft <= 0) {
    v.npi = prior.npi ?? sig('unknown', 'NPI not checked this run (registry cap)', 'nppes', now)
  } else {
    ctx.nppesLeft--
    try {
      const npi = await lookupNpi(p.npiNumber)
      if (!npi.found) {
        v.npi = sig('retired', 'NPI is no longer in the registry', 'nppes', now)
      } else if (npi.status === 'deactivated') {
        v.npi = sig(
          'retired',
          npi.deactivationDate ? `NPI deactivated ${npi.deactivationDate} — the practice has retired` : 'NPI deactivated — the practice has retired',
          'nppes',
          now,
        )
      } else {
        const loc = npi.location
        const moved =
          loc && (!sameAddress(loc.addressLine1, addressLine1) || (loc.postalCode && postalCode && loc.postalCode !== postalCode))
        if (moved && loc) {
          addressLine1 = loc.addressLine1 ?? addressLine1
          city = loc.city ?? city
          state = loc.state ?? state
          postalCode = loc.postalCode ?? postalCode
          patch.addressLine1 = addressLine1
          patch.city = city
          patch.state = state
          patch.postalCode = postalCode
          if (loc.phone && loc.phone !== patch.phone && patch.phoneSource !== 'caller') {
            phoneNotes.push(`the registry now lists ${formatProspectPhone(loc.phone)} (was ${formatProspectPhone(patch.phone) ?? 'none'})`)
            patch.phone = loc.phone
            patch.phoneSource = 'nppes'
          }
          v.npi = sig('active', 'NPI active — practice location changed in the registry, address refreshed', 'nppes', now)
        } else {
          v.npi = sig('active', 'NPI active', 'nppes', now)
        }
      }
    } catch (err) {
      console.warn('[prospect-verify] NPPES lookup failed', p.id, err instanceof Error ? err.message : err)
      v.npi = prior.npi ?? sig('unknown', 'NPI registry unreachable — will check again', 'nppes', now)
      await strike(ctx, 'nppes_down')
    }
  }

  // ── Places match + business status ───────────────────────────────────────
  // A lookup that did not run (no budget, no key, an outage, a refused key)
  // KEEPS the prior listing signal and the row's stored listing facts — a
  // 503 is not news about the practice. Only a real answer moves them.
  let place: PlaceResult | null = null
  let match: PlaceMatch | null = null
  let listing: VerifyOutcome['listing'] = 'kept'
  if (!places || !places.ok) {
    const detail = !places
      ? 'Google listing not checked this run'
      : places.error === 'auth'
        ? 'Google refused the Places key'
        : places.error === 'not_configured'
          ? 'Google Places is not configured'
          : 'Google Places was unreachable'
    v.places = prior.places ?? sig('unchecked', detail, 'places', now)
    v.business = prior.business ?? sig('unknown', 'No matched listing to read', 'places', now)
    if (places && places.error === 'auth') await strike(ctx, 'places_auth')
  } else if (places.places.length === 0) {
    v.places = sig('not_found', 'Google has no listing for this name and address', 'places', now)
    listing = 'cleared'
  } else {
    const picked = pickMatchingPlace(
      { name: p.name, addressLine1, city, state, postalCode, phone: patch.phone },
      places.places,
    )
    if (!picked) {
      const c = places.places[0]
      v.places = sig(
        'no_match',
        `Closest listing "${c.displayName ?? 'unnamed'}" at ${c.formattedAddress ?? 'unknown address'} is not this practice`,
        'places',
        now,
      )
      listing = 'cleared'
    } else {
      place = picked.place
      match = picked.match
      listing = 'matched'
      v.places = sig('matched', `Matched "${place.displayName ?? 'listing'}" (${match.reasons.join(', ')})`, 'places', now)
      if (match.phoneDiffers && patch.phoneSource !== 'caller') {
        phoneNotes.push(`Google lists ${formatProspectPhone(match.phoneDiffers)}; the registry had ${formatProspectPhone(patch.phone) ?? 'none'}`)
        patch.phone = match.phoneDiffers
        patch.phoneSource = 'places'
      }
    }
  }
  if (place) {
    switch (place.businessStatus) {
      case 'CLOSED_PERMANENTLY':
        v.business = sig('closed', 'Google lists it as permanently closed', 'places', now)
        break
      case 'CLOSED_TEMPORARILY':
        v.business = sig('temporarily_closed', `Google lists it as temporarily closed — checking again in ${PARKED_RECHECK_DAYS} days`, 'places', now)
        break
      case 'OPERATIONAL':
        v.business = sig('open', 'Google lists it as open', 'places', now)
        break
      default:
        v.business = sig('unknown', 'Google did not say whether it is open', 'places', now)
    }
  } else if (places?.ok) {
    // A real answer with no match: there is no listing to read. (No answer
    // at all kept the prior signal above.)
    v.business = sig('unknown', 'No matched listing to read', 'places', now)
  }
  // The listing facts the score reads: the fresh listing's, nothing of a
  // listing Google no longer stands behind, the stored ones when no lookup ran.
  const businessStatus = place ? place.businessStatus : listing === 'cleared' ? null : (p.businessStatus ?? null)
  const reviewCount = place ? place.reviewCount : listing === 'cleared' ? null : (p.reviewCount ?? null)

  // ── Website liveness ─────────────────────────────────────────────────────
  // A matched listing that states a website replaces the row's (source:
  // places). A listing Google no longer stands behind takes ITS website
  // with it — the stranger's site is neither probed, credited nor shown.
  // Nothing ever overwrites a website someone typed.
  let websiteUrl: string | null
  let websiteSource: ProspectWebsiteSource | null | undefined
  if (place?.websiteUri) {
    websiteUrl = place.websiteUri
    websiteSource = 'places'
  } else if (listing === 'cleared' && p.websiteUrl && websiteCameFromPlaces(p)) {
    websiteUrl = null
    websiteSource = null
  } else {
    websiteUrl = p.websiteUrl ?? null
    websiteSource = undefined
  }
  let liveness: SiteLiveness | null = null
  if (!websiteUrl) {
    v.website =
      v.places.status === 'matched' || v.places.status === 'not_found'
        ? sig('none', 'No website found', 'places', now)
        : sig('unknown', 'No listing matched — website unknown', 'places', now)
  } else if (!ctx.siteChecks) {
    v.website = prior.website ?? sig('unknown', 'Website not checked — site crawling is paused', 'crawl', now)
  } else {
    liveness = await checkSiteLiveness(websiteUrl)
    if (liveness.status === 'unknown') {
      // Could not tell (a resolver hiccup, a redirect loop, a private
      // address) — not news about the practice; the prior signal stands.
      v.website = prior.website ?? sig('unknown', liveness.detail, 'crawl', now)
    } else {
      ctx.liveness.checks++
      if (isNetworkDead(liveness)) ctx.liveness.networkDead++
      v.website = sig(liveness.status, liveness.detail, 'crawl', now)
    }
  }

  // ── Phone ────────────────────────────────────────────────────────────────
  // NANP: ten digits. A hand-entered "+1 (404) 555-1212" was stored as
  // eleven; it is normalized here so the stored number, the syntax check
  // and the carrier check all see the same ten digits.
  const tenDigits = nanpDigits(patch.phone)
  const phone = patch.phone ? (tenDigits.length === 10 ? tenDigits : patch.phone) : null
  patch.phone = phone
  const priorPhone = prior.phone
  const sameNumber = nanpDigits(phone) === nanpDigits(originalPhone)
  const callerVerdictStands =
    priorPhone?.source === 'caller' &&
    sameNumber &&
    (p.phoneStatus === 'disconnected' || p.phoneStatus === 'wrong_number' || p.phoneStatus === 'valid')
  if (!phone) {
    v.phone = sig('missing', 'No phone number on record', 'nanp', now)
    patch.phoneStatus = 'unknown'
  } else if (callerVerdictStands && priorPhone) {
    // What the caller heard beats every database; the number is unchanged.
    // (A number a human reached is `valid` for as long as they say so.)
    v.phone = priorPhone
    patch.phoneStatus = p.phoneStatus as ProspectPhoneStatus
  } else {
    const nanp = validateNanp(phone)
    if (!nanp.valid) {
      v.phone = sig('invalid', NANP_FAILURE_LABELS[nanp.reason], 'nanp', now)
      patch.phoneStatus = 'invalid'
    } else if (phoneValidateDriver() === 'none') {
      v.phone = sig('well_formed', 'Well-formed US number — the line check is off', 'nanp', now)
    } else if (ctx.phoneValidateUsed >= ctx.phoneValidateBudget) {
      v.phone = sig('well_formed', 'Well-formed US number — this month’s line checks are used up', 'nanp', now)
    } else {
      const line = await validatePhoneLine(nanpDigits(phone))
      if (line.ok) {
        ctx.phoneValidateUsed++
        await bumpProspectingCounter(ctx.month, 'phone_validate')
        patch.phoneValidatedAt = now
        if (line.invalid) {
          v.phone = sig('invalid', 'Carrier database: not an assigned number', 'aws_pinpoint', now)
          patch.phoneStatus = 'invalid'
        } else {
          patch.phoneStatus = 'valid'
          patch.phoneLineType = line.lineType
          v.phone = sig(
            'valid',
            `Carrier database: ${line.lineType ?? 'line type unknown'}${line.carrier ? ` (${line.carrier})` : ''}`,
            'aws_pinpoint',
            now,
          )
        }
      } else if (line.error === 'auth') {
        v.phone = sig('well_formed', 'Well-formed US number — AWS refused the line check', 'nanp', now)
        await strike(ctx, 'phone_validate_auth')
      } else if (line.error === 'driver_off') {
        v.phone = sig('well_formed', 'Well-formed US number — the line check is off', 'nanp', now)
      } else {
        v.phone = sig('well_formed', 'Well-formed US number — the line check was unavailable', 'nanp', now)
      }
    }
    if (phoneNotes.length > 0 && v.phone.detail) {
      v.phone = { ...v.phone, detail: `${v.phone.detail}; ${phoneNotes.join('; ')}` }
    }
  }

  // ── Disqualify the gone ──────────────────────────────────────────────────
  if (v.npi?.status === 'retired') {
    patch.status = 'disqualified'
    patch.suppressedReason = 'retired'
    patch.suppressedAt = now
  } else if (v.business?.status === 'closed') {
    patch.status = 'disqualified'
    patch.suppressedReason = 'closed'
    patch.suppressedAt = now
  }

  // ── The quality score, from the stored signals ───────────────────────────
  const q = computeQualityScore({
    status: patch.status ?? p.status,
    verification: v,
    phoneStatus: patch.phoneStatus,
    phoneLineType: patch.phoneLineType,
    businessStatus,
    reviewCount,
    websiteUrl,
  })
  patch.qualityScore = q.score
  patch.qualityBand = q.band
  patch.qualityReasons = q.reasons

  return { patch, place, match, websiteUrl, websiteSource, liveness, listing }
}

/** The crawl-blocked strike: a run whose every liveness check died at the
 *  network layer is not looking at dead sites — it is looking at a wall. */
export async function closeVerifyRun(ctx: VerifyRunCtx): Promise<void> {
  if (ctx.liveness.checks >= CRAWL_BLOCKED_MIN_CHECKS && ctx.liveness.networkDead === ctx.liveness.checks) {
    await strike(ctx, 'crawl_blocked')
  }
}

// ── Standalone verification (the drawer, the sweep) ─────────────────────────

const LIVE_STATUSES = ['enriched', 'queued', 'contacted', 'engaged', 'call_list'] as const

async function writePatch(prospectId: string, patch: VerifyPatch, extra: Partial<ProspectRow> = {}): Promise<void> {
  await db
    .update(schema.prospect)
    .set({ ...extra, ...patch, updatedAt: new Date() })
    .where(eq(schema.prospect.id, prospectId))
  // A disqualification or a bad number leaves a cold caller nothing to dial
  // (P-02): free the slot. The one release hook; best-effort by contract.
  if (patch.status === 'disqualified' || (patch.phoneStatus && (BAD_PHONE_STATUSES as readonly string[]).includes(patch.phoneStatus))) {
    const { releaseIfUnservable } = await import('./prospect-caller-release')
    await releaseIfUnservable(prospectId)
  }
}

/**
 * Verify one prospect on its own — a Places lookup (metered, only with a
 * key), then every signal, then the write. The matched listing's reputation
 * + website are refreshed too (nothing of an unmatched candidate is ever
 * copied; a listing Google no longer matches is cleared off the row).
 */
export async function verifyProspect(
  prospectId: string,
  opts: { ctx?: VerifyRunCtx; now?: Date; placesUsed?: number; placesBudget?: number } = {},
): Promise<{ ok: true; qualityScore: number; qualityBand: ProspectQualityBand; placesLookedUp: boolean } | { ok: false; reason: string }> {
  const [p] = await db.select().from(schema.prospect).where(eq(schema.prospect.id, prospectId)).limit(1)
  if (!p) return { ok: false, reason: 'not_found' }
  if (p.status === 'converted') return { ok: false, reason: 'already_converted' }

  const config = await getProspectingConfig()
  const ctx = opts.ctx ?? (await newVerifyRunCtx(config, opts.now ?? new Date()))
  const placesUsed = opts.placesUsed ?? (await getProspectingCounter(ctx.month, 'places_lookup'))
  const placesBudget = opts.placesBudget ?? config.budgets.placesPerMonth

  let places: PlacesSearchOutcome | null = null
  let placesLookedUp = false
  // No key = no lookup, exactly as the enrich pass skips — the free signals
  // still run and the prior listing signal stands.
  if (placesUsed < placesBudget && placesConfigured()) {
    places = await findDentalPlaceCandidates({
      name: p.name,
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
    })
    if (places.ok || places.error !== 'not_configured') {
      placesLookedUp = true
      await bumpProspectingCounter(ctx.month, 'places_lookup')
    }
  }

  const out = await verifyProspectSignals(p, places, ctx)
  await writePatch(p.id, out.patch, listingColumns(out))
  // The hold on its outreach: gone stops the drip (as a logged "closed"
  // call does), a reversible park pauses it, a recovered signal resumes it.
  await applyOutreachHold(p.id, out.patch, ctx.now)
  if (!opts.ctx) await closeVerifyRun(ctx)
  return { ok: true, qualityScore: out.patch.qualityScore, qualityBand: out.patch.qualityBand, placesLookedUp }
}

export interface VerifySweepResult {
  scanned: number
  verified: number
  disqualified: number
  placesLookups: number
  phoneChecks: number
  errors: number
  skipped?: string
}

/**
 * The re-verify sweep — rides the enrich cron. Never-verified live rows
 * first (the backfill for everything enriched before P-01), then anything
 * verified more than 60 days ago, then parked rows older than 30. Batch
 * 25; Places + phone checks metered; NPPES capped per run.
 */
export async function runVerificationSweep(opts?: { now?: Date; batchSize?: number }): Promise<VerifySweepResult> {
  const now = opts?.now ?? new Date()
  const out: VerifySweepResult = { scanned: 0, verified: 0, disqualified: 0, placesLookups: 0, phoneChecks: 0, errors: 0 }
  const config = await getProspectingConfig()
  if (config.killSwitch) return { ...out, skipped: 'kill_switch' }

  const limit = opts?.batchSize ?? SWEEP_BATCH_SIZE
  const live = [...LIVE_STATUSES]
  const unverified = await db
    .select({ id: schema.prospect.id })
    .from(schema.prospect)
    .where(and(inArray(schema.prospect.status, live), isNull(schema.prospect.verifiedAt), isNotNull(schema.prospect.enrichedAt)))
    .orderBy(asc(schema.prospect.enrichedAt))
    .limit(limit)
  const ids = unverified.map((r) => r.id)
  if (ids.length < limit) {
    const staleCutoff = new Date(now.getTime() - VERIFY_STALE_DAYS * DAY_MS)
    const parkedCutoff = new Date(now.getTime() - PARKED_RECHECK_DAYS * DAY_MS)
    const stale = await db
      .select({ id: schema.prospect.id })
      .from(schema.prospect)
      .where(
        and(
          inArray(schema.prospect.status, live),
          isNotNull(schema.prospect.verifiedAt),
          or(
            lt(schema.prospect.verifiedAt, staleCutoff),
            and(eq(schema.prospect.qualityBand, 'parked'), lt(schema.prospect.verifiedAt, parkedCutoff)),
          ),
        ),
      )
      .orderBy(asc(schema.prospect.verifiedAt))
      .limit(limit - ids.length)
    for (const r of stale) if (!ids.includes(r.id)) ids.push(r.id)
  }
  if (ids.length === 0) return out

  const ctx = await newVerifyRunCtx(config, now)
  let placesUsed = await getProspectingCounter(ctx.month, 'places_lookup')
  const phoneBefore = ctx.phoneValidateUsed
  for (const id of ids) {
    out.scanned++
    try {
      const r = await verifyProspect(id, { ctx, placesUsed, placesBudget: config.budgets.placesPerMonth })
      if (!r.ok) continue
      out.verified++
      if (r.placesLookedUp) {
        placesUsed++
        out.placesLookups++
      }
      if (r.qualityScore === 0 && r.qualityBand === 'parked') {
        // Only the disqualifying zeros are counted here (retired / closed).
        const [row] = await db
          .select({ status: schema.prospect.status })
          .from(schema.prospect)
          .where(eq(schema.prospect.id, id))
          .limit(1)
        if (row?.status === 'disqualified') out.disqualified++
      }
    } catch (err) {
      out.errors++
      console.warn('[prospect-verify] sweep failed for', id, err instanceof Error ? err.message : err)
    }
  }
  out.phoneChecks = ctx.phoneValidateUsed - phoneBefore
  await closeVerifyRun(ctx)
  return out
}
