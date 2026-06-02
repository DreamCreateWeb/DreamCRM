import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import ScrollReveal from './scroll-reveal'

const { INK } = CLINIC_THEME

interface CTA {
  label: string
  href: string
}

interface Props {
  heading: string
  subhead?: string
  primary: CTA
  secondary?: CTA
  brand: string
  /** Color treatment: 'brand' = clinic brand bg, 'teal' = forest-teal bg. */
  variant?: 'brand' | 'teal'
}

/**
 * Closing CTA band — H2 + dual CTAs on a brand-color or forest-teal panel.
 * Reused at the bottom of nearly every public subpage.
 */
export default function ClosingCTA({
  heading,
  subhead,
  primary,
  secondary,
  brand,
  variant = 'brand',
}: Props) {
  const bgColor = variant === 'teal' ? '#36514c' : brand

  return (
    <section className="py-14 sm:py-24" style={{ backgroundColor: bgColor }}>
      <div className="max-w-[820px] mx-auto px-5 sm:px-8 text-center">
        <ScrollReveal>
          <h2
            className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-6 text-white"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            {heading}
          </h2>
        </ScrollReveal>
        {subhead && (
          <ScrollReveal delay={80}>
            <p className="text-lg leading-[1.6] mb-9 text-white/90 max-w-[600px] mx-auto">
              {subhead}
            </p>
          </ScrollReveal>
        )}
        <ScrollReveal delay={160}>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={primary.href}
              className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold shadow-md transition hover:shadow-lg hover:scale-[1.02]"
              style={{ backgroundColor: '#FFFFFF', color: INK }}
            >
              {primary.label}
            </a>
            {secondary && (
              <a
                href={secondary.href}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium text-white border border-white/40 transition hover:bg-white/10"
              >
                {secondary.label}
              </a>
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
