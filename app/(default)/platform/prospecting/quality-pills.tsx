import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'
import {
  PHONE_LINE_TYPE_LABELS,
  PHONE_STATUS_LABELS,
  PROSPECTING_DEFAULTS,
  QUALITY_BAND_LABELS,
  type ProspectPhoneLineType,
  type ProspectPhoneStatus,
  type ProspectQualityBand,
} from '@/lib/types/prospecting'
import { BAD_PHONE_STATUSES } from '@/lib/db/schema/prospecting'

/**
 * The quality + phone-standing pills (P-01) — ONE rendering across the
 * table, the drawer, the call card, the phone queue and Call Mode, so the
 * same band is never two colours on two surfaces. Client-safe (no server
 * imports); tones from the design-system registry only.
 */

export const QUALITY_TONES: Record<ProspectQualityBand, Tone> = {
  best: 'ok',
  good: 'info',
  weak: 'warn',
  parked: 'neutral',
}

export const PHONE_STATUS_TONES: Record<ProspectPhoneStatus, Tone> = {
  unknown: 'neutral',
  valid: 'ok',
  invalid: 'urgent',
  disconnected: 'urgent',
  wrong_number: 'urgent',
}

/** The score range each band covers (parked is everything under 40 plus
 *  every hard zero). */
const BAND_RANGE: Record<Exclude<ProspectQualityBand, 'parked'>, [lo: number, hi: number]> = {
  best: [80, 100],
  good: [60, 79],
  weak: [40, 59],
}

/** Whether a band is served at a given floor, in words — the legend reads
 *  the LIVE floor, never the default. */
export function bandServedAt(band: ProspectQualityBand, floor: number): string {
  if (band === 'parked') return 'not served at any floor'
  const [lo, hi] = BAND_RANGE[band]
  if (floor <= lo) return `served (floor ${floor})`
  if (floor > hi) return `under the floor of ${floor} — not served`
  return `served only from ${floor} up`
}

/** The legend rows for the quality pills (the table's EncodingLegend), for
 *  the floor the queues actually obey. */
export function qualityLegend(floor: number): Array<{ tone: Tone; label: string; meaning: string }> {
  return [
    { tone: 'ok', label: 'Best', meaning: `Quality 80+ — verified listing, live number, active NPI; ${bandServedAt('best', floor)}.` },
    { tone: 'info', label: 'Good', meaning: `Quality 60–79 — reachable; one signal still unconfirmed; ${bandServedAt('good', floor)}.` },
    { tone: 'warn', label: 'Weak', meaning: `Quality 40–59 — ${bandServedAt('weak', floor)}; a re-verify can lift it.` },
    { tone: 'neutral', label: 'Parked', meaning: 'Dead number, retired NPI, closed or parked site — not served at any floor.' },
  ]
}

/** The legend at the default floor — surfaces that have no config in hand. */
export const QUALITY_LEGEND = qualityLegend(PROSPECTING_DEFAULTS.qualityFloor)

export function isBadPhone(status: ProspectPhoneStatus | string | null | undefined): boolean {
  return Boolean(status) && (BAD_PHONE_STATUSES as readonly string[]).includes(status as string)
}

export function QualityPill({
  band,
  score,
  reasons,
  className,
}: {
  band: ProspectQualityBand | string | null
  score: number | null
  reasons?: string[]
  className?: string
}) {
  if (!band || !(band in QUALITY_TONES)) {
    return (
      <StatusPill
        tone="neutral"
        label="Not verified yet"
        title="The verification pass has not looked at this record yet — the sweep gets to every live prospect."
        className={className}
      />
    )
  }
  const b = band as ProspectQualityBand
  return (
    <StatusPill
      tone={QUALITY_TONES[b]}
      label={score != null ? `${QUALITY_BAND_LABELS[b]} · ${score}` : QUALITY_BAND_LABELS[b]}
      title={reasons && reasons.length > 0 ? reasons.join(' · ') : 'Quality score — can we actually reach this practice?'}
      className={className}
    />
  )
}

export function PhoneStandingPill({
  status,
  lineType,
  className,
}: {
  status: ProspectPhoneStatus | string | null
  lineType: ProspectPhoneLineType | string | null
  className?: string
}) {
  const st = (status && status in PHONE_STATUS_TONES ? status : 'unknown') as ProspectPhoneStatus
  const line = lineType && lineType in PHONE_LINE_TYPE_LABELS ? PHONE_LINE_TYPE_LABELS[lineType as ProspectPhoneLineType] : null
  const label = st === 'valid' && line ? `${PHONE_STATUS_LABELS[st]} · ${line}` : st === 'unknown' ? 'Line not checked' : PHONE_STATUS_LABELS[st]
  return (
    <StatusPill
      tone={PHONE_STATUS_TONES[st]}
      label={label}
      title={
        st === 'valid'
          ? 'A carrier database says this number is assigned.'
          : st === 'unknown'
            ? 'Well-formed at most — no carrier check has run on this number.'
            : 'Not a dial target — a call or a check said this number does not reach the practice.'
      }
      className={className}
    />
  )
}
