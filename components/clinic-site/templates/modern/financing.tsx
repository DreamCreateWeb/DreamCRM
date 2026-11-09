import { brandFill } from '@/lib/clinic-site-theme'
import { copyOverride } from '@/lib/clinic-site-helpers'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import { DeepBand } from '@/components/clinic-site/decor'
import NumberedSteps from '@/components/clinic-site/numbered-steps'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'
import SiteImage from '@/components/clinic-site/site-image'
import { CherryWidget, SunbitPrequalify } from '@/components/clinic-site/financing-widgets'

import type { FinancingPageBodyProps } from '@/lib/site-templates/subpage-props'

/**
 * Modern's financing body — moved verbatim out of the page shell (ML-52). The
 * shell owns every read / SEO / gate and hands this the values it computed.
 */
export default function ModernFinancing({
  copyOverrides,
  headingInk,
  name,
  bookHref,
  brand,
  bookLabel,
  profile,
  howSteps,
  paymentMethods,
  financingPartners,
  primaryWidget,
  widgetBrand,
  widgetFonts,
  cancellationPolicy,
  billingFaq
}: FinancingPageBodyProps) {
  return (
    <>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[820px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
              data-edit-field="copy:paymentFinancing.heroEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'paymentFinancing.heroEyebrow', 'Patients · Payment & Financing')}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{
                color: headingInk,
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
              data-edit-field="copy:paymentFinancing.heroTitle"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'paymentFinancing.heroTitle', `Payment options at ${name}.`)}
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6] mb-9"
              style={{ color: INK }}
            >
              We want great care to feel easy to pay for. Here is exactly how
              billing works at our office — no silent surprises, no marketing
              math.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={bookHref}
                className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
                style={{ backgroundColor: brandFill(brand) }}
              >
                {bookLabel}
              </a>
              {profile.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border bg-[var(--c-surface,#FFFFFF)] transition hover:shadow-sm"
                  style={{ color: INK, borderColor: BORDER }}
                >
                  {profile.phone}
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ── How patients pay — universal explainer (no marketing pitch) ── */}
        <section className="py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <NumberedSteps
              steps={howSteps}
              brand={brand}
              columns={3}
              eyebrow={copyOverride(copyOverrides, 'paymentFinancing.how.eyebrow', 'How it works')}
              heading={copyOverride(copyOverrides, 'paymentFinancing.how.heading', 'Honest billing, every visit.')}
              surface="bg"
              editKeyPrefix="paymentFinancing.how"
            />
          </div>
        </section>

        {/* ── Payment methods — pill grid ─────────────────────────────────── */}
        <section
          className="py-14 sm:py-20"
          data-edit-field="paymentFinancing"
          data-edit-kind="modal"
          data-edit-label="payment & financing"
        >
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
                data-edit-field="copy:paymentFinancing.methodsEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'paymentFinancing.methodsEyebrow', 'Payment methods')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:paymentFinancing.methodsHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'paymentFinancing.methodsHeading', 'We accept the way you want to pay.')}
              </h2>
            </ScrollReveal>
            <ul className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              {paymentMethods.map((method, i) => (
                <ScrollReveal
                  as="li"
                  key={method}
                  delay={(i % 4) * 60}
                  className="flex items-center gap-3 rounded-2xl px-5 py-4 transition hover:shadow-sm"
                  style={{
                    backgroundColor: SURFACE,
                    border: `1px solid ${BORDER}`,
                    listStyle: 'none',
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                    style={{ backgroundColor: `${brand}1F`, color: headingInk }}
                  >
                    <svg
                      className="w-4.5 h-4.5"
                      width={18}
                      height={18}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  </span>
                  <span
                    className="text-[15px] sm:text-base font-medium"
                    style={{ color: INK }}
                  >
                    {method}
                  </span>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ── HSA & FSA — full-width band ──────────────────────────────────── */}
        <DeepBand className="pt-24 pb-14 sm:pt-28 sm:pb-20" ripple="left">
          <div className="relative max-w-[900px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
              style={{ color: 'rgba(250, 247, 242, 0.7)' }}
              data-edit-field="copy:paymentFinancing.hsaEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'paymentFinancing.hsaEyebrow', 'HSA & FSA')}
            </p>
            <h2
              className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
              style={{
                color: 'var(--c-deep-ink, #FAF7F2)',
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
              data-edit-field="copy:paymentFinancing.hsaHeading"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'paymentFinancing.hsaHeading', 'Use your tax-advantaged dollars here.')}
            </h2>
            <p
              className="text-base sm:text-lg leading-[1.65] max-w-[700px] mx-auto"
              style={{ color: 'rgba(255, 255, 255, 0.85)' }}
              data-edit-field="copy:paymentFinancing.hsaBody"
              data-edit-kind="text"
              data-edit-label="text"
            >
              {copyOverride(
                copyOverrides,
                'paymentFinancing.hsaBody',
                'Most dental care is HSA / FSA eligible — including cleanings, fillings, crowns, root canals, and orthodontics. Cosmetic treatments like whitening typically do not qualify. Bring your HSA / FSA card to your visit, or pay another way and submit the itemized receipt to your administrator.',
              )}
            </p>
          </div>
        </DeepBand>

        {/* ── Financing partners (only when set) ───────────────────────── */}
        {financingPartners.length > 0 && (
          <section className="py-14 sm:py-24">
            <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
              <ScrollReveal className="max-w-[640px] mb-12">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: headingInk }}
                  data-edit-field="copy:paymentFinancing.financingEyebrow"
                  data-edit-kind="text"
                  data-edit-label="eyebrow"
                >
                  {copyOverride(copyOverrides, 'paymentFinancing.financingEyebrow', 'Financing')}
                </p>
                <h2
                  className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                  style={{
                    color: headingInk,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:paymentFinancing.financingHeading"
                  data-edit-kind="text"
                  data-edit-label="headline"
                >
                  {copyOverride(copyOverrides, 'paymentFinancing.financingHeading', 'Financing options we partner with.')}
                </h2>
                <p
                  className="text-base leading-[1.6]"
                  style={{ color: INK_MUTED }}
                >
                  For larger treatment plans, our financing partners can help
                  you spread payments over time with terms that work for your
                  budget.
                </p>
              </ScrollReveal>
              {primaryWidget && primaryWidget.slug && (
                <div
                  className="mb-10 rounded-2xl overflow-hidden"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, color: INK }}
                  data-testid="financing-primary-widget"
                  // Cherry's shell collapses while its containers are empty —
                  // a blocked or unreachable script leaves the cards, not a
                  // blank bar (the rule rides with CherryWidget).
                  data-cherry-shell={primaryWidget.widget === 'cherry' ? '' : undefined}
                >
                  {primaryWidget.widget === 'cherry' ? (
                    <div className="p-4 sm:p-6">
                      <CherryWidget slug={primaryWidget.slug} name={name} brand={widgetBrand} fonts={widgetFonts} mode="page" />
                    </div>
                  ) : (
                    <SunbitPrequalify slug={primaryWidget.slug} name={name} />
                  )}
                </div>
              )}
              <div className="grid gap-5 sm:gap-6 sm:grid-cols-2">
                {financingPartners.map((p, i) => (
                  <ScrollReveal
                    as="div"
                    key={p.id}
                    delay={(i % 2) * 110}
                    className="rounded-2xl p-6 sm:p-7 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                    style={{
                      backgroundColor: SURFACE,
                      border: `1px solid ${BORDER}`,
                    }}
                  >
                    {p.logoUrl ? (
                      <>
                        <SiteImage
                          displayWidth={160}
                          src={p.logoUrl}
                          alt={p.name}
                          className="h-10 w-auto object-contain mb-5 self-start"
                          width={160}
                          height={40}
                          loading="lazy"
                          decoding="async"
                        />
                        <h3
                          className="text-lg font-semibold mb-2 leading-tight"
                          style={{ color: INK }}
                        >
                          {p.name}
                        </h3>
                      </>
                    ) : (
                      // No logo: the name IS the heading, once, in the display
                      // face (the first cut printed it twice — a wordmark
                      // stand-in and then the heading again).
                      <h3
                        className="text-2xl font-bold mb-3 self-start leading-tight"
                        style={{
                          color: headingInk,
                          fontFamily: 'var(--font-display, Georgia, serif)',
                        }}
                      >
                        {p.name}
                      </h3>
                    )}
                    {p.description && (
                      <p
                        className="text-[15px] leading-[1.6] mb-5"
                        style={{ color: INK_MUTED }}
                      >
                        {p.description}
                      </p>
                    )}
                    {p.applyUrl && (
                      <a
                        href={p.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold mt-auto self-start transition-all duration-300 hover:gap-2"
                        style={{ color: headingInk }}
                        data-testid={p.provider ? `financing-apply-${p.provider}` : undefined}
                      >
                        {p.cta}
                        <span aria-hidden="true">→</span>
                      </a>
                    )}
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Cancellation policy (only when set) ─────────────────────── */}
        {cancellationPolicy && (
          <section
            className="py-16 sm:py-20"
            style={{ backgroundColor: SURFACE }}
            data-edit-field="paymentFinancing"
            data-edit-kind="modal"
            data-edit-label="cancellation policy"
          >
            <div className="max-w-[820px] mx-auto px-5 sm:px-8">
              <div className="mb-7">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
                  style={{ color: headingInk }}
                  data-edit-field="copy:paymentFinancing.cancelEyebrow"
                  data-edit-kind="text"
                  data-edit-label="eyebrow"
                >
                  {copyOverride(copyOverrides, 'paymentFinancing.cancelEyebrow', 'Cancellations & no-shows')}
                </p>
                <h2
                  className="text-2xl sm:text-3xl lg:text-[36px] font-semibold leading-[1.1] tracking-[-0.015em]"
                  style={{
                    color: headingInk,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:paymentFinancing.cancelHeading"
                  data-edit-kind="text"
                  data-edit-label="headline"
                >
                  {copyOverride(copyOverrides, 'paymentFinancing.cancelHeading', 'Our cancellation policy.')}
                </h2>
              </div>
              <div
                className="rounded-2xl p-6 sm:p-8"
                style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
              >
                <p
                  className="text-[16px] leading-[1.7] whitespace-pre-wrap"
                  style={{ color: INK }}
                >
                  {cancellationPolicy}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── FAQ accordion ──────────────────────────────────────────────── */}
        <section
          className="py-16 sm:py-24"
          data-edit-field="faq"
          data-edit-kind="modal"
          data-edit-label="FAQ"
        >
          <div className="max-w-[820px] mx-auto px-5 sm:px-8">
            <ScrollReveal>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] mb-10 sm:mb-12 text-center"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:paymentFinancing.faqHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'paymentFinancing.faqHeading', 'Billing questions, answered.')}
              </h2>
            </ScrollReveal>
            <div className="space-y-3">
              {billingFaq.map((item, i) => (
                <ScrollReveal as="div" key={item.id} delay={i * 45}>
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
        </section>

        <ClosingCTA
          heading={copyOverride(copyOverrides, 'paymentFinancing.cta.heading', 'Questions about your bill?')}
          subhead={copyOverride(copyOverrides, 'paymentFinancing.cta.subhead', 'Reach out — we’ll walk you through anything that doesn’t look right.')}
          editKeyPrefix="paymentFinancing.cta"
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


