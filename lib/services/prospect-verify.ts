import 'server-only'
import { and, asc, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { lookupNpi, searchDentistsAtAddress, type NpiLookupResult } from '@/lib/nppes'
import { findDentalPlaceCandidates, placesConfigured, type PlaceResult, type PlacesSearchOutcome } from '@/lib/google-places'
import { pickMatchingPlace, type PlaceMatch } from '@/lib/prospect-match'
import { NANP_FAILURE_LABELS, nanpDigits, validateNanp } from '@/lib/phone-nanp'
import { SYSTEM_FOLLOWUP_REASONS } from '@/lib/prospect-followup'
import { computeQualityScore, qualityInput } from '@/lib/prospect-quality'
import {
  GROUP_PRACTICE_DENTISTS,
  SIZE_RECHECK_DAYS,
  chainSentence,
  fitVerdict,
  formatMonthYear,
  isDomainClassDso,
  isNewPractice,
  matchDso,
  monthsBetween,
  newPracticeSentence,
  officialTitleKind,
  practiceSize,
  practiceSizeSentence,
  signalOlderThan,
  websiteHost,
} from '@/lib/prospect-fit'
import { rescoreOpportunity } from '@/lib/prospect-scoring'
import {
  PARKED_RECHECK_DAYS,
  VERIFY_STALE_DAYS,
  formatProspectPhone,
  parseVerification,
  type PhoneSourceName,
  type PhoneStanding,
  type PhoneVerificationSignal,
  type ProspectFitSignals,
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
 *   phone     NANP syntax, then the carrier line type (metered, optional);
 *             the TWO-SOURCE RULE (P-04): who states the number
 *             (registry / listing / a call / the carrier) and its standing
 *             — corroborated or single_source; no first-dial bucket
 *   reviews   liveness from the listing (P-04): the latest review's date
 *             and whether the listing states hours — rides the same call
 *   reach     written only by logCallOutcome — a human got through
 *   fit.*     (P-04) a DSO / chain name on any of the three names we hold
 *             (a common-phrase brand only with the website host agreeing)
 *             → disqualified `chain`; the practice size from the registry
 *             (NPI-1 dentists at the address, ≤50 requests a run; an
 *             answer the registry could not give is asked again next
 *             pass); a NEW practice (enumerated < 18 months); the owner's
 *             "Not a chain" override, never re-flagged. The shared-host /
 *             shared-phone chain sweep is group work and lives in
 *             prospect-fit.ts. A changed size / new-practice read rescores
 *             the opportunity the row already carries.
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
/** The practice-size searches a run may spend (P-04) — its own cap, so the
 *  liveness lookups above are never starved; budgeted like discovery. */
export const FIT_NPPES_PER_RUN = 50
/** Review recency (P-04): ≤ 6 months is current, ≤ 18 quiet, older stale. */
export const REVIEWS_RECENT_MONTHS = 6
export const REVIEWS_STALE_MONTHS = 18
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
   *  ran — and where the website came from (a listing's goes with the listing).
   *  The official's title corroborates the fit read (P-04); the follow-up
   *  columns let a chain flag remember the system nudge it clears. */
  Partial<
    Pick<
      ProspectRow,
      'businessStatus' | 'reviewCount' | 'websiteSource' | 'authorizedOfficialTitle' | 'nextFollowUpAt' | 'followUpReason' | 'phoneLineType' | 'phoneValidatedAt'
    >
  >

/** Per-run context — budgets, the once-a-run failure strikes, the
 *  crawl-blocked tally. One per cron run; the drawer action makes its own. */
export interface VerifyRunCtx {
  now: Date
  month: string
  phoneValidateBudget: number
  phoneValidateUsed: number
  nppesLeft: number
  /** Practice-size registry searches left this run (P-04). */
  fitNppesLeft: number
  /** Website probes run only while the crawl budget is above zero — the one
   *  knob that pauses touching prospects' sites pauses this too. */
  siteChecks: boolean
  reported: Set<ProspectingFailureClass>
  liveness: { checks: number; networkDead: number }
  /** The live clock a parked record is promised (config.hygiene) — the
   *  stored sentence must name the number the sweep actually uses. */
  parkedRecheckDays: number
}

export async function newVerifyRunCtx(config: ProspectingConfig, now = new Date()): Promise<VerifyRunCtx> {
  const month = counterMonth(now)
  return {
    now,
    month,
    phoneValidateBudget: config.budgets.phoneValidatePerMonth,
    phoneValidateUsed: await getProspectingCounter(month, 'phone_validate'),
    nppesLeft: NPPES_PER_RUN,
    fitNppesLeft: FIT_NPPES_PER_RUN,
    siteChecks: config.budgets.crawlsPerMonth > 0,
    reported: new Set(),
    liveness: { checks: 0, networkDead: 0 },
    parkedRecheckDays: config.hygiene?.parkedRecheckDays ?? PARKED_RECHECK_DAYS,
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
  suppressedReason?: 'retired' | 'closed' | 'chain'
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
 * NPI, permanently closed, a chain we target later) is gone from the pool.
 * Null = not a stop.
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

/**
 * THE TWO-SOURCE PREDICATE (P-04), pure: `corroborated` when two of the
 * registry / the listing / a human state the number, or the carrier says
 * in service AND at least one of them states it, or a human REACHED the
 * practice on it (`caller` stated and the status is valid);
 * `single_source` otherwise. The carrier ALONE is never corroboration
 * (fix pass, G.1): "in service" says the line rings, not whose it is — the
 * owner's ruling needs ACTIVE and THIS CLINIC'S.
 */
export function phoneStanding(stated: readonly PhoneSourceName[], phoneStatus: string | null): PhoneStanding {
  const voices = stated.filter((s) => s !== 'carrier')
  if (voices.length >= 2) return 'corroborated'
  if (stated.includes('carrier') && voices.length >= 1) return 'corroborated'
  if (stated.includes('caller') && phoneStatus === 'valid') return 'corroborated'
  return 'single_source'
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
  // The fit signals (P-04) carry forward — the chain sweep's flag and the
  // owner's override are never dropped by a pass that did not look.
  const fit: ProspectFitSignals = { ...(prior.fit ?? {}) }
  const official = officialTitleKind(p.authorizedOfficialTitle ?? null)

  // Who stated the number we hold NOW (the two-source rule, P-04): the
  // prior signal's sources, or the legacy column on a row the P-04 pass has
  // not seen. A number a human typed or reached is `caller`-provided — no
  // registry or listing replaces it.
  // A hand-added row from before the fix pass carries its typed number with
  // NO source column and no NPI — the P-01 guard: that number is the
  // caller's too.
  const typedBeforeTheStamp = Boolean(p.phone) && !p.phoneSource && !p.npiNumber && !prior.phone?.sources
  const legacyStated: PhoneSourceName[] =
    prior.phone?.sources ??
    (p.phoneSource === 'nppes' || p.phoneSource === 'places' || p.phoneSource === 'caller' ? [p.phoneSource] : typedBeforeTheStamp ? ['caller'] : [])
  const callerProvided = p.phoneSource === 'caller' || legacyStated.includes('caller')

  const patch: VerifyPatch = {
    verification: v,
    verifiedAt: now,
    qualityScore: 0,
    qualityBand: 'parked',
    qualityReasons: [],
    phone: p.phone ?? null,
    phoneStatus: 'unknown',
    phoneLineType: null,
    phoneSource: null,
    phoneValidatedAt: null,
  }
  let addressLine1 = p.addressLine1 ?? null
  let city = p.city ?? null
  let state = p.state ?? null
  let postalCode = p.postalCode ?? null
  const originalPhone = p.phone ?? null
  const phoneNotes: string[] = []
  // The matched listing's DIFFERENT number on a caller-provided row (V2).
  let phoneAlt: PhoneVerificationSignal['alt'] = null
  // The registry's current number and name, when the lookup ran.
  let npi: NpiLookupResult | null = null
  let npiLookupRan = false

  // ── NPI liveness ─────────────────────────────────────────────────────────
  if (!p.npiNumber) {
    v.npi = sig('none', 'No NPI on record (added by hand)', 'nppes', now)
  } else if (ctx.nppesLeft <= 0) {
    v.npi = prior.npi ?? sig('unknown', 'NPI not checked this run (registry cap)', 'nppes', now)
  } else {
    ctx.nppesLeft--
    try {
      npi = await lookupNpi(p.npiNumber)
      npiLookupRan = true
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
          if (loc.phone && loc.phone !== patch.phone && !callerProvided) {
            phoneNotes.push(`the registry now lists ${formatProspectPhone(loc.phone)} (was ${formatProspectPhone(patch.phone) ?? 'none'})`)
            patch.phone = loc.phone
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

  // ── Fit from the registry (P-04): a new practice, the practice size ─────
  if (npi?.found && npi.status === 'active') {
    const opened = npi.enumerationDate
    const fresh = isNewPractice(opened, now)
    fit.newPractice = {
      ...sig(
        opened ? (fresh ? 'new' : 'established') : 'unknown',
        fresh
          ? newPracticeSentence(opened)
          : opened
            ? `In the registry since ${formatMonthYear(opened) ?? opened}`
            : 'The registry gave no enumeration date',
        'nppes',
        now,
      ),
      enumeratedAt: opened,
    }
    if (npi.enumerationType === 'NPI-1') {
      fit.size = { ...sig('solo', 'A solo dentist — an individual NPI', 'nppes', now), dentists: 1, official }
    } else if (ctx.fitNppesLeft > 0 && (!fit.size || fit.size.retry || signalOlderThan(fit.size.checkedAt, now, SIZE_RECHECK_DAYS))) {
      // The 180-day clock gates only a COMPLETED, uncapped count; an answer
      // the registry could not give (`retry`) is asked again next pass.
      ctx.fitNppesLeft--
      try {
        const r = await searchDentistsAtAddress({ addressLine1, addressLine2: npi.location?.addressLine2 ?? null, state, postalCode })
        if (r) {
          if (r.capped && r.dentists < GROUP_PRACTICE_DENTISTS) {
            // A full ZIP page may hide the rest of the group: never "solo"
            // or "small" from a page that was cut.
            fit.size = { ...sig('unknown', 'Registry size check incomplete — the ZIP page was full; will check again', 'nppes', now), dentists: null, official, retry: true }
          } else {
            const size = practiceSize(r.dentists)
            fit.size = { ...sig(size, practiceSizeSentence(size, r.dentists, official), 'nppes', now), dentists: r.dentists, official }
          }
        }
      } catch (err) {
        console.warn('[prospect-verify] NPPES size search failed', p.id, err instanceof Error ? err.message : err)
        // A completed count stands; an unknown stays an unknown that retries.
        if (!fit.size || fit.size.retry) {
          fit.size = { ...sig('unknown', 'Registry size check unavailable — will check again', 'nppes', now), dentists: null, official, retry: true }
        }
        await strike(ctx, 'nppes_down')
      }
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
      if (match.phoneDiffers && !callerProvided) {
        phoneNotes.push(`Google lists ${formatProspectPhone(match.phoneDiffers)}; the registry had ${formatProspectPhone(patch.phone) ?? 'none'}`)
        patch.phone = match.phoneDiffers
      } else if (match.phoneDiffers) {
        // A typed number is never replaced (B / C2) — but the listing's
        // differing number is kept on the signal and said out loud, so a
        // typo has a trace (fix pass II, V2).
        phoneAlt = { number: match.phoneDiffers, source: 'places', at: now.toISOString() }
        phoneNotes.push(`Google lists ${formatProspectPhone(match.phoneDiffers)} — kept the number you typed`)
      }
    }
  }
  const placesAnswered = Boolean(places?.ok)
  if (place) {
    switch (place.businessStatus) {
      case 'CLOSED_PERMANENTLY':
        v.business = sig('closed', 'Google lists it as permanently closed', 'places', now)
        break
      case 'CLOSED_TEMPORARILY':
        v.business = sig('temporarily_closed', `Google lists it as temporarily closed — checking again in ${ctx.parkedRecheckDays} days`, 'places', now)
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

  // ── Liveness from the listing (P-04) ─────────────────────────────────────
  // The latest review's date and whether the listing states hours ride the
  // same Places call. A cleared listing takes its reviews with it; no lookup
  // keeps the prior signal.
  // Places returns at most five reviews by RELEVANCE, never the newest: the
  // sample's latest is a LOWER BOUND on the true latest, so "recent" is
  // proof of life and "stale" is only "Google's top reviews are old". A
  // listing that counts ZERO reviews is "none"; a null count is unknown.
  if (place) {
    const latest = place.latestReviewAt
    const hours = place.hasOpeningHours
    const noHours = hours ? '' : ' — no opening hours on the listing'
    let status: string
    let detail: string
    if (latest) {
      const months = monthsBetween(new Date(latest), now)
      const when = formatMonthYear(latest) ?? latest
      status = months < REVIEWS_RECENT_MONTHS ? 'recent' : months < REVIEWS_STALE_MONTHS ? 'quiet' : 'stale'
      detail =
        status === 'recent'
          ? `Latest Google review ${when}${noHours}`
          : status === 'quiet'
            ? `Google's top reviews run to ${when}${noHours}`
            : `Google's top reviews are all older than ${when}${noHours}`
    } else if (place.reviewCount === 0) {
      status = 'none'
      detail = `No Google reviews yet${noHours}`
    } else {
      status = 'unknown'
      detail = `${place.reviewCount ?? 'Some'} Google reviews — Google returned no review dates${noHours}`
    }
    v.reviews = { ...sig(status, detail, 'places', now), latestAt: latest, hours }
  } else if (listing === 'kept' && prior.reviews) {
    v.reviews = prior.reviews
  }

  // ── The DSO / chain name (P-04) ───────────────────────────────────────────
  // Three names, one list; a common-phrase brand needs the website host
  // (the row's, or the matched listing's) to agree; the owner's "Not a
  // chain" stands for good. A pass that could NOT re-read the source the
  // prior match came from (no registry lookup, no listing answer) keeps
  // that match — nothing is downgraded from "unchecked" (fix pass, F.3).
  if (!fit.chainOverride) {
    const hosts = [websiteHost(p.websiteUrl), websiteHost(place?.websiteUri)]
    const hit = matchDso({ practice: p.name, npi: npi?.organizationName ?? null, listing: place?.displayName ?? null, hosts })
    const priorDso = prior.fit?.dso
    const reread =
      priorDso?.matchedOn === 'npi'
        ? npiLookupRan
        : priorDso?.matchedOn === 'listing'
          ? placesAnswered
          : priorDso?.matchedOn === 'practice'
            ? !isDomainClassDso(priorDso.name) || placesAnswered
            : true
    if (hit) {
      // A fresh match remembers where the row IS; a match on a row already
      // set aside keeps what the prior match remembered.
      const priorStatus = p.status === 'disqualified' ? (priorDso?.priorStatus ?? null) : p.status
      const priorFollowUp =
        p.status === 'disqualified'
          ? (priorDso?.priorFollowUp ?? null)
          : p.nextFollowUpAt && p.followUpReason && SYSTEM_FOLLOWUP_REASONS.includes(p.followUpReason)
            ? { at: p.nextFollowUpAt.toISOString(), reason: p.followUpReason }
            : null
      fit.dso = {
        ...sig('match', chainSentence({ dso: hit.name }), 'dso_list', now),
        name: hit.name,
        matchedOn: hit.matchedOn,
        priorStatus,
        ...(priorFollowUp ? { priorFollowUp } : {}),
      }
    } else if (priorDso?.status === 'match' && !reread) {
      fit.dso = priorDso
    } else {
      fit.dso = { ...sig('none', 'Not on the DSO / chain list', 'dso_list', now), name: null, matchedOn: null, priorStatus: null }
    }
  }

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
  // Whether the line check ran this pass (the two-source rule reads it).
  let lineCheck: 'off' | 'skipped' | 'done' | null = null
  let carrierInService = false
  if (!phone) {
    v.phone = sig('missing', 'No phone number on record', 'nanp', now)
    patch.phoneStatus = 'unknown'
  } else if (callerVerdictStands && priorPhone) {
    // What the caller heard beats every database; the number is unchanged.
    // (A number a human reached is `valid` for as long as they say so.)
    // The carrier's line facts the row already holds survive the reach —
    // a human reaching the practice never costs the record its line type
    // (fix pass II, V9); the carrier check is not run again.
    v.phone = priorPhone
    patch.phoneStatus = p.phoneStatus as ProspectPhoneStatus
    patch.phoneLineType = (p.phoneLineType as ProspectPhoneLineType | null | undefined) ?? null
    patch.phoneValidatedAt = p.phoneValidatedAt ?? null
  } else {
    const nanp = validateNanp(phone)
    if (!nanp.valid) {
      v.phone = sig('invalid', NANP_FAILURE_LABELS[nanp.reason], 'nanp', now)
      patch.phoneStatus = 'invalid'
    } else if (phoneValidateDriver() === 'none') {
      v.phone = sig('well_formed', 'Well-formed US number — the line check is off', 'nanp', now)
      lineCheck = 'off'
    } else if (ctx.phoneValidateUsed >= ctx.phoneValidateBudget) {
      v.phone = sig('well_formed', 'Well-formed US number — this month’s line checks are used up', 'nanp', now)
      lineCheck = 'skipped'
    } else {
      const line = await validatePhoneLine(nanpDigits(phone))
      if (line.ok) {
        ctx.phoneValidateUsed++
        await bumpProspectingCounter(ctx.month, 'phone_validate')
        patch.phoneValidatedAt = now
        lineCheck = 'done'
        if (line.invalid) {
          v.phone = sig('invalid', 'Carrier database: not an assigned number', 'aws_pinpoint', now)
          patch.phoneStatus = 'invalid'
        } else {
          patch.phoneStatus = 'valid'
          patch.phoneLineType = line.lineType
          carrierInService = true
          v.phone = sig(
            'valid',
            `Carrier database: ${line.lineType ?? 'line type unknown'}${line.carrier ? ` (${line.carrier})` : ''}`,
            'aws_pinpoint',
            now,
          )
        }
      } else if (line.error === 'auth') {
        v.phone = sig('well_formed', 'Well-formed US number — AWS refused the line check', 'nanp', now)
        lineCheck = 'skipped'
        await strike(ctx, 'phone_validate_auth')
      } else if (line.error === 'driver_off') {
        v.phone = sig('well_formed', 'Well-formed US number — the line check is off', 'nanp', now)
        lineCheck = 'off'
      } else {
        v.phone = sig('well_formed', 'Well-formed US number — the line check was unavailable', 'nanp', now)
        lineCheck = 'skipped'
      }
    }
    if (phoneNotes.length > 0 && v.phone.detail) {
      v.phone = { ...v.phone, detail: `${v.phone.detail}; ${phoneNotes.join('; ')}` }
    }
  }

  // ── "That clinic's number" — the two-source rule (P-04) ──────────────────
  // Who states the number we are keeping: the registry (this pass's lookup,
  // else the prior signal while the number is unchanged), the matched
  // listing (same), a human (typed or reached), the carrier (in service).
  // Corroborated = two voices, or the carrier plus any one, or a human who
  // reached the practice on it; single-source otherwise. No first-dial
  // bucket — the owner's ruling.
  if (patch.phone && v.phone && !(callerVerdictStands && priorPhone)) {
    const finalDigits = nanpDigits(patch.phone)
    const sameAsOriginal = finalDigits === nanpDigits(originalPhone)
    const stated: PhoneSourceName[] = []
    const registryNumber = npiLookupRan ? (npi?.location?.phone ?? null) : null
    const nppesStates = npiLookupRan
      ? registryNumber != null && nanpDigits(registryNumber) === finalDigits
      : sameAsOriginal && legacyStated.includes('nppes')
    const placesStates = placesAnswered
      ? place?.nationalPhoneNumber != null && nanpDigits(place.nationalPhoneNumber) === finalDigits
      : sameAsOriginal && legacyStated.includes('places')
    if (nppesStates) stated.push('nppes')
    if (placesStates) stated.push('places')
    if (callerProvided && sameAsOriginal) stated.push('caller')
    if (carrierInService) stated.push('carrier')
    const standing: PhoneStanding = phoneStanding(stated, patch.phoneStatus)
    v.phone = { ...v.phone, sources: stated, standing, lineCheck, ...(phoneAlt ? { alt: phoneAlt } : {}) }
    patch.phoneSource = standing
  } else if (patch.phone && v.phone) {
    // The caller's verdict stands, signal untouched; the column says what
    // that signal says (a reach on this number is corroborated).
    patch.phoneSource = v.phone.standing ?? phoneStanding(v.phone.sources ?? ['caller'], patch.phoneStatus)
  }

  // ── Disqualify the gone ──────────────────────────────────────────────────
  if (Object.keys(fit).length > 0) v.fit = fit
  const fitRead = fitVerdict(fit)
  if (v.npi?.status === 'retired') {
    patch.status = 'disqualified'
    patch.suppressedReason = 'retired'
    patch.suppressedAt = now
  } else if (v.business?.status === 'closed') {
    patch.status = 'disqualified'
    patch.suppressedReason = 'closed'
    patch.suppressedAt = now
  } else if (fitRead.chain) {
    // Chains and DSOs are out (owner ruling 2026-11-11) — we target them
    // later with other features. Enrollment stops through the hold below;
    // the caller's slot frees in writePatch.
    patch.status = 'disqualified'
    patch.suppressedReason = 'chain'
    patch.suppressedAt = now
  }

  // ── The quality score, from the stored signals ───────────────────────────
  const q = computeQualityScore(
    qualityInput(
      {
        status: patch.status ?? p.status,
        verification: v,
        phoneStatus: patch.phoneStatus,
        phoneLineType: patch.phoneLineType,
        businessStatus,
        reviewCount,
        websiteUrl,
      },
      ctx,
    ),
  )
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

/** The sweep's clocks, resolved once a run from config.hygiene. */
export interface SweepCutoffs {
  /** A verified row older than this is looked at again (`reverifyAfterDays`). */
  staleCutoff: Date
  /** A PARKED row older than this is looked at again (`parkedRecheckDays`) —
   *  the clock its stored sentence promises, resting or not. */
  parkedCutoff: Date
}

export function sweepCutoffs(config: ProspectingConfig, now: Date): SweepCutoffs {
  return {
    staleCutoff: new Date(now.getTime() - (config.hygiene?.reverifyAfterDays ?? VERIFY_STALE_DAYS) * DAY_MS),
    parkedCutoff: new Date(now.getTime() - (config.hygiene?.parkedRecheckDays ?? PARKED_RECHECK_DAYS) * DAY_MS),
  }
}

/** "Due for another look": verified before the stale clock, or parked and
 *  verified before the parked clock. The one predicate both the live bucket
 *  and the resting bucket read — rendered for real in
 *  tests/prospecting/hygiene-sql.test.ts. */
export function dueForReverifyWhere(cutoffs: SweepCutoffs) {
  return or(
    lt(schema.prospect.verifiedAt, cutoffs.staleCutoff),
    and(eq(schema.prospect.qualityBand, 'parked'), lt(schema.prospect.verifiedAt, cutoffs.parkedCutoff)),
  )
}

/** The three buckets the sweep fills, in order: never-verified live rows,
 *  live rows due again, and — only when room is left — RESTING rows that
 *  were never verified or are due again (a parked resting row on the
 *  parked clock, exactly as its sentence says). */
export function sweepBucketWhere(bucket: 'unverified' | 'stale' | 'resting', cutoffs: SweepCutoffs) {
  const live = inArray(schema.prospect.status, [...LIVE_STATUSES])
  switch (bucket) {
    case 'unverified':
      return and(live, isNull(schema.prospect.verifiedAt), isNotNull(schema.prospect.enrichedAt))
    case 'stale':
      return and(live, isNotNull(schema.prospect.verifiedAt), dueForReverifyWhere(cutoffs))
    case 'resting':
      return and(eq(schema.prospect.status, 'dormant'), or(isNull(schema.prospect.verifiedAt), dueForReverifyWhere(cutoffs)))
  }
}

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
 * The opportunity columns a verify pass rewrites when its fit read MOVED
 * (the practice size, the new-practice read) on a row that already carries
 * an opportunity score — the −10 the Fit card promises a group practice is
 * real without a re-enrich (fix pass, H.3). Nothing for a row never
 * enriched, a row the pass disqualified, or a read that did not change.
 */
export function opportunityRescore(
  p: Pick<ProspectRow, 'verification' | 'opportunityScore' | 'aiVerdict' | 'enrichment' | 'reviewCount' | 'googleRatingTenths'>,
  out: Pick<VerifyOutcome, 'patch'>,
  listing: Partial<Pick<ProspectRow, 'reviewCount' | 'googleRatingTenths'>>,
  now: Date,
): Partial<Pick<ProspectRow, 'opportunityScore' | 'scoreBand' | 'scoreReasons' | 'scoredAt'>> {
  if (p.opportunityScore == null || out.patch.status === 'disqualified') return {}
  const before = parseVerification(p.verification).fit
  const after = out.patch.verification.fit
  const moved =
    (before?.size?.status ?? null) !== (after?.size?.status ?? null) ||
    (before?.newPractice?.status ?? null) !== (after?.newPractice?.status ?? null)
  if (!moved) return {}
  const rescored = rescoreOpportunity({
    aiVerdict: p.aiVerdict,
    reviewCount: 'reviewCount' in listing ? (listing.reviewCount ?? null) : (p.reviewCount ?? null),
    ratingTenths: 'googleRatingTenths' in listing ? (listing.googleRatingTenths ?? null) : (p.googleRatingTenths ?? null),
    enrichment: p.enrichment,
    verification: out.patch.verification,
  })
  if (!rescored) return {}
  return { opportunityScore: rescored.score, scoreBand: rescored.band, scoreReasons: rescored.reasons, scoredAt: now }
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
  // A merged duplicate is verified on its survivor — never a write here (P-03).
  if (p.status === 'merged') return { ok: false, reason: 'merged' }

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

  const priorQuality = p.qualityScore
  const out = await verifyProspectSignals(p, places, ctx)
  const listing = listingColumns(out)
  await writePatch(p.id, out.patch, { ...listing, ...opportunityRescore(p, out, listing, ctx.now) })
  // The hold on its outreach: gone stops the drip (as a logged "closed"
  // call does), a reversible park pauses it, a recovered signal resumes it.
  await applyOutreachHold(p.id, out.patch, ctx.now)
  // A resting row (P-03) wakes when the pass IMPROVED its quality; otherwise
  // it keeps resting, with the resting sentence back in front (the pass just
  // rewrote quality_reasons, so the sentence it had is handed over).
  if (p.status === 'dormant') {
    const { reconcileDormantAfterVerify } = await import('./prospect-hygiene')
    await reconcileDormantAfterVerify(p.id, priorQuality, ctx.now, { priorReasons: p.qualityReasons })
  }
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
 * verified more than `config.hygiene.reverifyAfterDays` ago (default 60),
 * then parked rows older than `parkedRecheckDays` (default 30), and only
 * when room is left, RESTING rows on the same clock (P-03 — a re-verify
 * that improves one wakes it). Batch 25; Places + phone checks metered;
 * NPPES capped per run.
 */
export async function runVerificationSweep(opts?: { now?: Date; batchSize?: number }): Promise<VerifySweepResult> {
  const now = opts?.now ?? new Date()
  const out: VerifySweepResult = { scanned: 0, verified: 0, disqualified: 0, placesLookups: 0, phoneChecks: 0, errors: 0 }
  const config = await getProspectingConfig()
  if (config.killSwitch) return { ...out, skipped: 'kill_switch' }

  const limit = opts?.batchSize ?? SWEEP_BATCH_SIZE
  const cutoffs = sweepCutoffs(config, now)
  const unverified = await db
    .select({ id: schema.prospect.id })
    .from(schema.prospect)
    .where(sweepBucketWhere('unverified', cutoffs))
    .orderBy(asc(schema.prospect.enrichedAt))
    .limit(limit)
  const ids = unverified.map((r) => r.id)
  if (ids.length < limit) {
    const stale = await db
      .select({ id: schema.prospect.id })
      .from(schema.prospect)
      .where(sweepBucketWhere('stale', cutoffs))
      .orderBy(asc(schema.prospect.verifiedAt))
      .limit(limit - ids.length)
    for (const r of stale) if (!ids.includes(r.id)) ids.push(r.id)
  }
  if (ids.length < limit) {
    const resting = await db
      .select({ id: schema.prospect.id })
      .from(schema.prospect)
      .where(sweepBucketWhere('resting', cutoffs))
      .orderBy(asc(schema.prospect.verifiedAt))
      .limit(limit - ids.length)
    for (const r of resting) if (!ids.includes(r.id)) ids.push(r.id)
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
