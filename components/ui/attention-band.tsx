import Link from 'next/link'
import { TONE_PILL, TONE_TEXT, type Tone } from '@/lib/ui/encodings'

/**
 * THE one "worth a look" band on the clinic Overview (G1-27).
 *
 * Replaces three stacked amber sections (readiness, website check-engine,
 * and last night's work) with ONE section, ONE ring and ONE heading that
 * counts. Rows arrive already ordered by the caller: broken things first,
 * then the site signal, then the quiet report.
 *
 * Tones come from lib/ui/encodings: `warn`/`urgent` rows need a hand and
 * make the ring amber; a band made only of `neutral`/`ok`/`info` rows is a
 * report, so the ring stays quiet ink. Never more than one ring, never
 * amber on a report. Empty → renders nothing.
 */
export type AttentionRow = {
  id: string
  tone: Tone
  /** A short mark (one character or emoji) in the tone's chip — decorative. */
  glyph: string
  title: string
  body?: string | null
  /** Null when the row is a report with no door. */
  href?: string | null
  label?: string
}

const NEEDS_A_HAND: ReadonlySet<Tone> = new Set<Tone>(['warn', 'urgent'])

export function attentionBandHeading(rows: AttentionRow[]): string {
  if (rows.length === 1) return rows[0].title
  const hands = rows.filter((r) => NEEDS_A_HAND.has(r.tone)).length
  if (hands >= 2) return `${hands} things need your attention`
  if (hands === 1) return '1 thing needs your attention'
  return 'While you were out'
}

export function AttentionBand({ rows }: { rows: AttentionRow[] }) {
  if (rows.length === 0) return null
  const single = rows.length === 1
  const amber = rows.some((r) => NEEDS_A_HAND.has(r.tone))
  const ring = amber
    ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/20'
    : 'bg-gray-500/5 ring-1 ring-inset ring-gray-500/15'
  const heading = attentionBandHeading(rows)

  return (
    <section className="mb-6" aria-label="Worth a look" data-attention-band={amber ? 'amber' : 'quiet'}>
      <div className={`rounded-[var(--r-lg)] p-4 ${ring}`}>
        <p className={`text-sm font-semibold ${amber ? TONE_TEXT.warn : TONE_TEXT.neutral}`}>{heading}</p>
        <ul className={single ? 'mt-1' : 'mt-2 divide-y divide-gray-500/10'}>
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
              <span
                data-tone={r.tone}
                className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-base font-semibold ${TONE_PILL[r.tone]}`}
                aria-hidden="true"
              >
                {r.glyph}
              </span>
              <div className="flex-1 min-w-0">
                {!single && <p className="text-sm font-medium text-ink-800">{r.title}</p>}
                {r.body && (
                  <p className={`text-xs ${single ? '' : 'mt-0.5 '}${TONE_TEXT[single ? r.tone : 'neutral']}`}>{r.body}</p>
                )}
              </div>
              {r.href && (
                <Link
                  href={r.href}
                  className={`text-xs font-medium px-3 min-h-10 inline-flex items-center rounded-lg shrink-0 self-center hover:underline ${TONE_PILL[r.tone]}`}
                >
                  {r.label ?? 'Open'}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
