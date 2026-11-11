import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'
import {
  PHONE_SOURCE_LABELS,
  PHONE_SOURCE_NAME_LABELS,
  VERIFICATION_SIGNALS,
  VERIFICATION_SIGNAL_LABELS,
  VERIFY_STALE_DAYS,
  formatUtcStamp,
  parseVerification,
  type PhoneVerificationSignal,
  type ProspectPhoneSource,
  type VerificationSignalId,
} from '@/lib/types/prospecting'
import { CARRIER_ONLY_LINE, SINGLE_SOURCE_TURN_ON, isFullyVerified } from '@/lib/prospect-quality'
import { QualityPill } from './quality-pills'

/**
 * The drawer's Verification card (P-01) — every signal with its status, its
 * source and WHEN it was checked (UTC, marked: the platform runs in UTC and
 * the owner may be anywhere). Honest by construction: a signal that never
 * ran says so; "Verified" means every core signal inside 60 days. The phone
 * line names who states the number (the two-source rule, P-04).
 */

const STATUS_TONE: Record<string, Tone> = {
  matched: 'ok',
  open: 'ok',
  active: 'ok',
  alive: 'ok',
  valid: 'ok',
  reached: 'ok',
  recent: 'ok',
  well_formed: 'info',
  quiet: 'info',
  temporarily_closed: 'warn',
  redirected: 'warn',
  stale: 'warn',
  retired: 'urgent',
  closed: 'urgent',
  dead: 'urgent',
  parked: 'urgent',
  invalid: 'urgent',
  disconnected: 'urgent',
  wrong_number: 'urgent',
}

const STATUS_LABEL: Record<string, string> = {
  matched: 'Matched',
  no_match: 'No match',
  not_found: 'Not found',
  unchecked: 'Not checked',
  unknown: 'Unknown',
  open: 'Open',
  temporarily_closed: 'Temporarily closed',
  closed: 'Closed',
  active: 'Active',
  retired: 'Retired',
  none: 'None',
  alive: 'Up',
  dead: 'Down',
  parked: 'Parking page',
  redirected: 'Redirects',
  valid: 'Valid',
  well_formed: 'Well-formed',
  invalid: 'Invalid',
  disconnected: 'Disconnected',
  wrong_number: 'Wrong number',
  missing: 'Missing',
  reached: 'Reached',
  recent: 'Current',
  quiet: 'Quiet',
  stale: 'Stale',
}

/** The phone line's "who says so" (P-04): the sources that state the
 *  number and its standing — the carrier alone says only that the line is
 *  in service (fix pass, G.1) — or, on a row the P-04 pass has not seen,
 *  the legacy "Number from …". */
export function phoneSourcesLine(phone: PhoneVerificationSignal | undefined, phoneSource: string | null): string | null {
  const sources = phone?.sources
  if (sources && sources.length > 0) {
    const named = sources.map((s) => PHONE_SOURCE_NAME_LABELS[s]).join(', ')
    if (sources.length === 1 && sources[0] === 'carrier') return CARRIER_ONLY_LINE
    if (phone?.standing === 'corroborated') return `Stated by ${named} — corroborated`
    if (sources.length === 1 && phone?.lineCheck === 'off') return `${SINGLE_SOURCE_TURN_ON} (${named})`
    return `Only one source lists this number (${named})`
  }
  if (phone?.standing === 'single_source') return phone.lineCheck === 'off' ? SINGLE_SOURCE_TURN_ON : 'Only one source lists this number'
  if (phoneSource && phoneSource in PHONE_SOURCE_LABELS) {
    const label = PHONE_SOURCE_LABELS[phoneSource as ProspectPhoneSource]
    if (phoneSource === 'corroborated') return 'Two sources agree on this number'
    if (phoneSource === 'single_source') return 'Only one source lists this number'
    return `Number from ${label}`
  }
  return null
}

const SOURCE_LABEL: Record<string, string> = {
  places: 'Google Places',
  nppes: 'NPI registry',
  crawl: 'our crawler',
  nanp: 'number format',
  aws_pinpoint: 'carrier database',
  caller: 'a call',
}

function signalTone(id: VerificationSignalId, status: string): Tone {
  // "No website" is the opportunity, not a fault.
  if (id === 'website' && status === 'none') return 'ok'
  return STATUS_TONE[status] ?? 'neutral'
}

export function VerificationCard({
  verification,
  verifiedAt,
  qualityScore,
  qualityBand,
  qualityReasons,
  phone,
  phoneSource,
  now = new Date(),
  staleAfterDays,
}: {
  verification: unknown
  verifiedAt: Date | string | null
  qualityScore: number | null
  qualityBand: string | null
  qualityReasons: unknown
  phone: string | null
  phoneSource: string | null
  now?: Date
  /** The live re-verify window (config.hygiene.reverifyAfterDays) — the
   *  headline must say "due" exactly when the sweep would come back. */
  staleAfterDays?: number
}) {
  const v = parseVerification(verification)
  const reasons = Array.isArray(qualityReasons) ? (qualityReasons as string[]) : []
  const stamp = formatUtcStamp(verifiedAt)
  const window = staleAfterDays ?? VERIFY_STALE_DAYS
  const full = isFullyVerified(v, now, window)
  const staleDays = verifiedAt
    ? Math.floor((now.getTime() - new Date(verifiedAt).getTime()) / (24 * 60 * 60 * 1000))
    : null
  const headline = !verifiedAt
    ? 'Not verified yet'
    : full
      ? `Verified · ${stamp}`
      : staleDays != null && staleDays > window
        ? `Last pass ${staleDays} days ago — due for another look`
        : `Partly checked · ${stamp}`
  const phoneLine = phoneSourcesLine(v.phone, phoneSource)

  return (
    <div data-verification-card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <QualityPill band={qualityBand} score={qualityScore} reasons={reasons} />
        <span className="text-xs text-gray-500 dark:text-gray-400">{headline}</span>
      </div>
      {qualityBand === 'parked' && (
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          Parked — not served to any queue until a re-verify (or you) says otherwise.
          {reasons[0] ? ` ${reasons[0]}.` : ''}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {VERIFICATION_SIGNALS.map((id) => {
          const sig = v[id]
          // The bonus signals only show once something wrote them: a call
          // (reach), a listing with review dates (reviews — P-04).
          if (!sig && (id === 'reach' || id === 'reviews')) return null
          return (
            <li key={id} className="text-sm" data-signal={id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 dark:text-gray-400">{VERIFICATION_SIGNAL_LABELS[id]}</span>
                {sig ? (
                  <StatusPill tone={signalTone(id, sig.status)} label={STATUS_LABEL[sig.status] ?? sig.status.replace(/_/g, ' ')} />
                ) : (
                  <StatusPill tone="neutral" label="Not checked" />
                )}
              </div>
              {sig && (
                <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                  {sig.detail && <span>{sig.detail}</span>}
                  <span className="block text-gray-500 dark:text-gray-400">
                    {SOURCE_LABEL[sig.source] ?? sig.source} · checked {formatUtcStamp(sig.checkedAt) ?? sig.checkedAt}
                  </span>
                </div>
              )}
              {id === 'phone' && phone && phoneLine && (
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400" data-phone-sources>{phoneLine}</div>
              )}
            </li>
          )
        })}
      </ul>
      {reasons.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Why this quality
          </div>
          <ul className="space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
            {reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden="true">•</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
