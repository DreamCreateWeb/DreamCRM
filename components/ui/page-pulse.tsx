import Link from 'next/link'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'

export interface PulseFact {
  label: string
  value: number | string
  tone?: Tone
  href?: string
}

/**
 * The list-page heartbeat (DESIGN-SYSTEM law 7): ONE quiet line under the
 * PageHeader — "32 patients · 4 new this month · 2 lapsed" — built from
 * numbers the page already loaded (never a new query). Renders nothing when
 * there are no facts. Hidden under 480px like the tile sparks. A linked fact
 * keeps the 40px touch floor.
 */
export function PagePulse({ facts, className = '' }: { facts: PulseFact[]; className?: string }) {
  if (facts.length === 0) return null
  return (
    <p
      data-testid="page-pulse"
      className={`hidden min-[480px]:flex flex-wrap items-center gap-x-2 text-sm text-ink-500 mb-4 ${className}`}
    >
      {facts.map((f, i) => {
        const body = (
          <>
            <span className={`font-mono-num tabular-nums font-semibold ${f.tone ? TONE_TEXT[f.tone] : 'text-ink-900'}`}>
              {f.value}
            </span>{' '}
            <span>{f.label}</span>
          </>
        )
        return (
          <span key={f.label} className="inline-flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">·</span>}
            {f.href ? (
              <Link href={f.href} className="inline-flex items-center min-h-[40px] hover:underline">
                {body}
              </Link>
            ) : (
              <span>{body}</span>
            )}
          </span>
        )
      })}
    </p>
  )
}

export default PagePulse
