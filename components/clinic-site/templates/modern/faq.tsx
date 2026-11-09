import { copyOverride } from '@/lib/clinic-site-helpers'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

import type { FaqPageBodyProps } from '@/lib/site-templates/subpage-props'

/**
 * Modern's faq body — moved verbatim out of the page shell (ML-52). The
 * shell owns every read / SEO / gate and hands this the values it computed.
 */
export default function ModernFaq({
  copyOverrides,
  headingInk,
  orderedCategories,
  grouped,
  bookLabel,
  bookHref,
  profile,
  brand
}: FaqPageBodyProps) {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
        <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
            style={{ color: INK_MUTED }}
            data-edit-field="copy:faq.heroEyebrow"
            data-edit-kind="text"
            data-edit-label="eyebrow"
          >
            {copyOverride(copyOverrides, 'faq.heroEyebrow', 'Frequently asked')}
          </p>
          <h1
            className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
            style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            data-edit-field="copy:faq.heroTitle"
            data-edit-kind="text"
            data-edit-label="headline"
          >
            {copyOverride(copyOverrides, 'faq.heroTitle', 'Frequently asked questions.')}
          </h1>
          <p
            className="text-base sm:text-lg leading-[1.6]"
            style={{ color: INK }}
          >
            Everything we get asked, answered. If you don&apos;t see your
            question, just ask — we&apos;re happy to help.
          </p>
        </div>
      </section>

      {/* ── Category tabs ──────────────────────────────────────────────── */}
      {/* Sticky offset derived from the one `--site-header-h` var (set in the
          /site layout) so the tab bar + the floating header stay in lockstep —
          change the header height once, not per-page. */}
      <nav
        aria-label="FAQ categories"
        className="sticky z-30 backdrop-blur-md"
        style={{ backgroundColor: BG, top: 'calc(var(--site-header-h, 64px) + 4px)' }}
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-3">
          <ul
            className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory sm:flex-wrap sm:justify-center sm:overflow-visible"
            style={{ scrollbarWidth: 'none' }}
          >
            {orderedCategories.map((c) => (
              <li key={c} className="snap-start shrink-0">
                <a
                  href={`#category-${categorySlug(c)}`}
                  className="inline-flex items-center px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition hover:shadow-sm"
                  style={{
                    backgroundColor: SURFACE,
                    color: INK,
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  {c}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* ── Accordion list, grouped ───────────────────────────────────── */}
      <section
        className="py-12 sm:py-16"
        data-edit-field="faq"
        data-edit-kind="modal"
        data-edit-label="FAQ"
      >
        <div className="max-w-[820px] mx-auto px-5 sm:px-8 space-y-14">
          {orderedCategories.map((c) => (
            <div key={c} id={`category-${categorySlug(c)}`} className="scroll-mt-32">
              <ScrollReveal>
                <h2
                  className="text-2xl sm:text-3xl font-semibold leading-[1.1] mb-6"
                  style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  {c}
                </h2>
              </ScrollReveal>
              <div className="space-y-3">
                {(grouped.get(c) ?? []).map((item, i) => (
                  <ScrollReveal as="div" key={item.id} delay={i * 40}>
                    <details
                      className="group rounded-2xl border overflow-hidden transition hover:shadow-sm"
                      style={{ backgroundColor: SURFACE, borderColor: BORDER }}
                    >
                      <summary
                        className="cursor-pointer list-none px-6 py-5 text-base sm:text-lg font-semibold leading-snug flex items-start justify-between gap-4"
                        style={{ color: INK }}
                      >
                        <span>{item.question}</span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 mt-0.5 text-2xl leading-none font-light group-open:hidden"
                          style={{ color: headingInk }}
                        >
                          +
                        </span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 mt-0.5 text-2xl leading-none font-light hidden group-open:inline"
                          style={{ color: headingInk }}
                        >
                          −
                        </span>
                      </summary>
                      <div
                        className="px-6 pb-6 -mt-1 text-[15px] sm:text-base leading-[1.65]"
                        style={{ color: INK_MUTED }}
                      >
                        {item.answer}
                      </div>
                    </details>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <ClosingCTA
        heading={copyOverride(copyOverrides, 'faq.cta.heading', 'Still have questions?')}
        subhead={copyOverride(copyOverrides, 'faq.cta.subhead', 'We’re happy to talk it through — call us or book a visit and we’ll meet you where you are.')}
        editKeyPrefix="faq.cta"
        primary={{ label: bookLabel, href: bookHref }}
        secondary={
          profile.phone
            ? { label: profile.phone, href: `tel:${profile.phone}` }
            : undefined
        }
        brand={brand}
      />

      </>
  )
}

function categorySlug(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
