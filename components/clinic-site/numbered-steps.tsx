import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import ScrollReveal from './scroll-reveal'

const { INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

export interface NumberedStep {
  title: string
  body: string
  icon?: string
}

interface Props {
  steps: NumberedStep[]
  brand: string
  columns?: 1 | 2 | 3 | 4
  /** Card surface — defaults to SURFACE (white). 'bg' uses cream bg. */
  surface?: 'white' | 'bg'
  /** Eyebrow label rendered above the optional heading. */
  eyebrow?: string
  heading?: string
  /** Center-align heading + eyebrow. */
  centered?: boolean
}

/**
 * Numbered process grid — 01/02/03 serif badge, title, body.
 * Stagger-reveals each card on scroll.
 */
export default function NumberedSteps({
  steps,
  brand,
  columns = 2,
  surface = 'white',
  eyebrow,
  heading,
  centered = false,
}: Props) {
  if (steps.length === 0) return null
  const cardBg = surface === 'white' ? SURFACE : '#FAF7F2'
  const gridCols =
    columns === 1
      ? ''
      : columns === 2
        ? 'sm:grid-cols-2'
        : columns === 3
          ? 'sm:grid-cols-2 lg:grid-cols-3'
          : 'sm:grid-cols-2 lg:grid-cols-4'

  return (
    <div>
      {(eyebrow || heading) && (
        <div className={`mb-10 sm:mb-12 ${centered ? 'text-center mx-auto max-w-[640px]' : 'max-w-[640px]'}`}>
          {eyebrow && (
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
              style={{ color: brand }}
            >
              {eyebrow}
            </p>
          )}
          {heading && (
            <h2
              className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em]"
              style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {heading}
            </h2>
          )}
        </div>
      )}
      <ol className={`grid gap-6 sm:gap-7 ${gridCols}`}>
        {steps.map((step, i) => (
          <ScrollReveal
            as="li"
            key={i}
            delay={i * 80}
            className="flex gap-5 rounded-2xl p-6 sm:p-7 transition-transform duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: cardBg, border: `1px solid ${BORDER}`, listStyle: 'none' }}
          >
            <span
              className="shrink-0 text-3xl sm:text-4xl font-bold leading-none tracking-[-0.02em]"
              style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <h3 className="text-lg font-semibold mb-2 leading-tight" style={{ color: INK }}>
                {step.title}
              </h3>
              <p className="text-[15px] leading-[1.6]" style={{ color: INK_MUTED }}>
                {step.body}
              </p>
            </div>
          </ScrollReveal>
        ))}
      </ol>
    </div>
  )
}
