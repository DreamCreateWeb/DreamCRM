/**
 * Google rating badge — surfaces the clinic's REAL synced Google star rating
 * (average + count) to human visitors. The homepage already feeds this rating
 * into JSON-LD for Google's rich results; this shows the same trust signal on
 * the page, where it lifts booking conversion. Honest by construction: the
 * caller only renders it when there are enough real reviews (see
 * GOOGLE_RATING_MIN_COUNT) — no fabricated stars.
 *
 * Pure/presentational + server-safe. Fractional ratings render as a partial
 * star via an overlay clip (no per-star SVG ids to collide across instances).
 */

/** Minimum synced Google reviews before the visual badge headlines a rating —
 *  "5.0 from 1 review" reads thin, so hold the badge until it's earned. The
 *  JSON-LD AggregateRating keeps its own (count >= 1) gate independently. */
export const GOOGLE_RATING_MIN_COUNT = 3

/** Clamp + convert an average (0–5) to the gold-overlay width percentage. */
export function ratingFillPct(average: number): number {
  const a = Math.max(0, Math.min(5, average))
  return (a / 5) * 100
}

interface Props {
  average: number
  count: number
  /** Contrast-safe ink for the "4.9 · 212 reviews" text on the warm ground. */
  headingInk: string
  /** 'hero' = compact inline (under the CTA); 'section' = a touch larger. */
  variant?: 'hero' | 'section'
  className?: string
}

const STAR_GOLD = '#F4B400' // universal review gold — reads as "rating" instantly
const STAR_EMPTY = 'rgba(28,26,23,0.18)' // faint ink, works on the cream ground

export default function GoogleRatingBadge({
  average,
  count,
  headingInk,
  variant = 'hero',
  className,
}: Props) {
  const pct = ratingFillPct(average)
  const starSize = variant === 'section' ? 'text-xl' : 'text-[17px]'
  const textSize = variant === 'section' ? 'text-[15px]' : 'text-sm'
  const label = `${average.toFixed(1)} out of 5 stars from ${count} Google review${count === 1 ? '' : 's'}`

  return (
    <div
      className={`inline-flex items-center gap-2 ${className ?? ''}`}
      role="img"
      aria-label={label}
    >
      {/* Gold-over-gray overlay: a faint base row of five stars with a clipped
          gold row on top, so 4.6 shows four-and-a-bit filled. Both aria-hidden;
          the wrapper carries the real label. */}
      <span
        aria-hidden="true"
        className={`relative inline-block leading-none ${starSize}`}
        style={{ letterSpacing: '0.05em' }}
      >
        <span style={{ color: STAR_EMPTY }}>★★★★★</span>
        <span
          className="absolute inset-0 overflow-hidden whitespace-nowrap"
          style={{ width: `${pct}%`, color: STAR_GOLD }}
        >
          ★★★★★
        </span>
      </span>
      <span className={`font-semibold ${textSize}`} style={{ color: headingInk }}>
        <span className="tabular-nums">{average.toFixed(1)}</span>
        <span className="font-normal" style={{ opacity: 0.7 }}>
          {' '}
          · {count} {count === 1 ? 'review' : 'reviews'} on Google
        </span>
      </span>
    </div>
  )
}
