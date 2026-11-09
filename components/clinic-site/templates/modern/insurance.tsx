import { brandFill } from '@/lib/clinic-site-theme'
import { copyOverride } from '@/lib/clinic-site-helpers'
import InsuranceVerifierForm from '@/components/clinic-site/insurance-verifier-form'
import { resolveLeadForm, type LeadFormsConfig } from '@/lib/types/lead-forms'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import { DeepBand } from '@/components/clinic-site/decor'
import NumberedSteps from '@/components/clinic-site/numbered-steps'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

import type { InsurancePageBodyProps } from '@/lib/site-templates/subpage-props'

/**
 * Modern's insurance body — moved verbatim out of the page shell (ML-52). The
 * shell owns every read / SEO / gate and hands this the values it computed.
 */
export default function ModernInsurance({
  copyOverrides,
  headingInk,
  name,
  bookHref,
  brand,
  bookLabel,
  helpBullets,
  insuranceCarriers,
  data,
  services,
  profile,
  inNetworkSteps,
  outOfNetworkSteps,
  hasDentalPlans,
  basePath,
  insuranceFaq
}: InsurancePageBodyProps) {
  return (
    <>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
              data-edit-field="copy:insurance.heroEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'insurance.heroEyebrow', 'Patients · Insurance')}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{
                color: headingInk,
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
              data-edit-field="copy:insurance.heading"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'insurance.heading', '') || <>Insurance at {name}.</>}
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6] mb-9"
              style={{ color: INK }}
              data-edit-field="copy:insurance.heroIntro"
              data-edit-kind="text"
              data-edit-label="intro"
            >
              {copyOverride(copyOverrides, 'insurance.heroIntro', '') || (
                <>
                  We want care to be easy to use — so we verify your benefits up
                  front, file the claim for you, and answer every &ldquo;wait, what
                  did my plan say?&rdquo; question along the way.
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={bookHref}
                className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
                style={{ backgroundColor: brandFill(brand) }}
              >
                {bookLabel}
              </a>
              <a
                href="#verify"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border bg-[var(--c-surface,#FFFFFF)] transition hover:shadow-sm"
                style={{ color: INK, borderColor: BORDER }}
              >
                Check your insurance
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>

        {/* ── "We're here to help" 4-bullet grid ─────────────────────────── */}
        <section className="py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-12">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
                data-edit-field="copy:insurance.helpEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'insurance.helpEyebrow', 'We’re here to help')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:insurance.helpHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'insurance.helpHeading', '') || 'Benefits, on your side.'}
              </h2>
            </ScrollReveal>
            <ul className="grid sm:grid-cols-2 gap-5 sm:gap-7">
              {helpBullets.map((b, i) => (
                <ScrollReveal
                  as="li"
                  key={b.title}
                  delay={(i % 2) * 100}
                  className="rounded-2xl p-6 sm:p-7 transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                  style={{ backgroundColor: BG, border: `1px solid ${BORDER}`, listStyle: 'none' }}
                >
                  <div
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-4"
                    style={{ backgroundColor: `${brand}1F`, color: headingInk }}
                  >
                    <svg
                      className="w-5 h-5"
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
                  </div>
                  <h3
                    className="text-lg font-semibold mb-2 leading-tight"
                    style={{ color: INK }}
                    data-edit-field={`copy:insurance.help.${i}.title`}
                    data-edit-kind="text"
                    data-edit-label="title"
                  >
                    {b.title}
                  </h3>
                  <p
                    className="text-[15px] leading-[1.6]"
                    style={{ color: INK_MUTED }}
                    data-edit-field={`copy:insurance.help.${i}.body`}
                    data-edit-kind="text"
                    data-edit-label="text"
                  >
                    {b.body}
                  </p>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Carriers + verifier — forest-teal band (matches homepage) ──── */}
        <DeepBand className="pt-20 pb-14 sm:pt-32 sm:pb-24" arcFill="var(--c-surface, #FFFFFF)">
          <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="text-center max-w-[700px] mx-auto mb-12">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: 'rgba(250, 247, 242, 0.7)' }}
                data-edit-field="copy:insurance.carriersEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'insurance.carriersEyebrow', 'Insurance')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                style={{
                  color: 'var(--c-deep-ink, #FAF7F2)',
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:insurance.carriersHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'insurance.carriersHeading', '') || 'Carriers we accept'}
              </h2>
              <p
                className="text-base sm:text-lg leading-[1.55]"
                style={{ color: 'rgba(255, 255, 255, 0.8)' }}
              >
                We work with most major PPO carriers. Not sure if your plan is
                covered? Drop us your info below and we will verify before your
                visit.
              </p>
            </div>
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-12">
              {/* Left: carriers */}
              <div
                data-edit-field="acceptedInsuranceCarriers"
                data-edit-kind="modal"
                data-edit-label="insurance carriers"
              >
                <h3
                  className="text-xl sm:text-2xl font-semibold mb-3"
                  style={{
                    color: 'var(--c-deep-ink, #FAF7F2)',
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:insurance.carriersListHeading"
                  data-edit-kind="text"
                  data-edit-label="title"
                >
                  {copyOverride(copyOverrides, 'insurance.carriersListHeading', 'Our insurance carriers')}
                </h3>
                {insuranceCarriers.length > 0 ? (
                  <>
                    <p
                      className="text-sm sm:text-base leading-[1.55] mb-5"
                      style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                    >
                      We are happy to accept most major PPO dental insurance
                      plans, including (but not limited to):
                    </p>
                    <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                      {insuranceCarriers.map((carrier) => (
                        <li
                          key={carrier}
                          className="flex items-start gap-2.5 text-[15px] leading-snug"
                          style={{ color: 'var(--c-deep-ink, #FAF7F2)' }}
                        >
                          <svg
                            className="w-5 h-5 shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                          <span>{carrier}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p
                    className="text-base leading-[1.55]"
                    style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                  >
                    Call us to verify your specific plan — we work with most
                    major PPO carriers.
                  </p>
                )}
              </div>

              {/* Right: verifier form */}
              <div id="verify" className="scroll-mt-24">
                <h3
                  className="text-xl sm:text-2xl font-semibold mb-3"
                  style={{
                    color: 'var(--c-deep-ink, #FAF7F2)',
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:insurance.verifierHeading"
                  data-edit-kind="text"
                  data-edit-label="title"
                >
                  {copyOverride(copyOverrides, 'insurance.verifierHeading', 'Check your insurance')}
                </h3>
                <p
                  className="text-sm sm:text-base leading-[1.55] mb-5"
                  style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                >
                  Curious if your insurance will cover your exam? Drop us a
                  note and we will get back to you within one business day.
                </p>
                <InsuranceVerifierForm
                  slug={data.slug}
                  brand={brand}
                  carriers={insuranceCarriers.length > 0 ? insuranceCarriers : null}
                  services={services.length > 0 ? services.map((s) => s.name) : null}
                  fields={resolveLeadForm(
                    (profile.leadForms as LeadFormsConfig | null) ?? null,
                    'insurance_verifier',
                  )}
                />
              </div>
            </div>
            {/* Logo marquee — same pattern as the homepage Insurance section. */}
            {insuranceCarriers.length > 0 && (
              <div className="mt-14 sm:mt-20 -mx-5 sm:-mx-8" style={{ overflowX: 'clip' }}>
                <div
                  className="flex gap-4 sm:gap-5 ins-marquee-track px-5 sm:px-8"
                  style={{ width: 'max-content' }}
                >
                  {[...insuranceCarriers, ...insuranceCarriers].map((carrier, i) => (
                    <div
                      key={`${carrier}-${i}`}
                      className="shrink-0 bg-[var(--c-surface,#FFFFFF)] rounded-2xl px-7 py-5 flex items-center justify-center w-[220px] h-[88px]"
                      style={{ borderTop: `3px solid ${brand}` }}
                      aria-hidden={i >= insuranceCarriers.length ? 'true' : undefined}
                    >
                      <span
                        className="text-[15px] font-semibold tracking-tight text-center leading-tight"
                        style={{
                          color: 'var(--c-ink, #1C1A17)',
                          fontFamily: 'var(--font-display, Georgia, serif)',
                        }}
                      >
                        {carrier}
                      </span>
                    </div>
                  ))}
                </div>
                <style>{`
                  @keyframes ins-marquee-kf {
                    from { transform: translateX(0); }
                    to { transform: translateX(-50%); }
                  }
                  .ins-marquee-track {
                    animation: ins-marquee-kf ${Math.max(35, insuranceCarriers.length * 4)}s linear infinite;
                    will-change: transform;
                  }
                  .ins-marquee-track:hover { animation-play-state: paused; }
                  @media (prefers-reduced-motion: reduce) {
                    .ins-marquee-track {
                      animation: none;
                      flex-wrap: wrap;
                      width: 100% !important;
                      justify-content: center;
                    }
                  }
                `}</style>
              </div>
            )}
          </div>
        </DeepBand>

        {/* ── Insurance process — In-network vs Out-of-network ─────────── */}
        <section className="py-14 sm:py-24">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[700px] mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
                data-edit-field="copy:insurance.processEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'insurance.processEyebrow', 'How it works')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:insurance.processHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'insurance.processHeading', '') || (
                  <>The insurance process at {name}.</>
                )}
              </h2>
            </ScrollReveal>
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-12">
              {/* In-network */}
              <ScrollReveal>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:insurance.inNetLabel"
                  data-edit-kind="text"
                  data-edit-label="label"
                >
                  {copyOverride(copyOverrides, 'insurance.inNetLabel', "If we're in-network with your plan")}
                </p>
                <NumberedSteps
                  steps={inNetworkSteps}
                  brand={brand}
                  columns={1}
                  editKeyPrefix="insurance.inNet"
                />
              </ScrollReveal>
              {/* Out-of-network */}
              <ScrollReveal delay={120}>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:insurance.outNetLabel"
                  data-edit-kind="text"
                  data-edit-label="label"
                >
                  {copyOverride(copyOverrides, 'insurance.outNetLabel', "If we're out-of-network")}
                </p>
                <NumberedSteps
                  steps={outOfNetworkSteps}
                  brand={brand}
                  columns={1}
                  editKeyPrefix="insurance.outNet"
                />
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ── "No dental insurance?" → /dental-plans (gated) ─────────────── */}
        {hasDentalPlans && (
          <DeepBand className="pt-24 pb-16 sm:pt-28 sm:pb-20" ripple="none">
            <div className="relative max-w-[900px] mx-auto px-5 sm:px-8 text-center">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: 'rgba(250, 247, 242, 0.7)' }}
                data-edit-field="copy:insurance.noInsEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'insurance.noInsEyebrow', 'No dental insurance?')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                style={{
                  color: 'var(--c-deep-ink, #FAF7F2)',
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:insurance.noInsHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'insurance.noInsHeading', 'Our in-house dental plan covers preventive care.')}
              </h2>
              <p
                className="text-base sm:text-lg leading-[1.55] mb-7 max-w-[640px] mx-auto"
                style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                data-edit-field="copy:insurance.noInsBody"
                data-edit-kind="text"
                data-edit-label="text"
              >
                {copyOverride(
                  copyOverrides,
                  'insurance.noInsBody',
                  'No deductibles, no claim forms, no waiting periods. Join the membership plan to keep your routine care covered and save on any other treatment.',
                )}
              </p>
              <a
                href={`${basePath}/dental-plans`}
                className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold shadow-md transition hover:shadow-lg hover:opacity-95"
                style={{ backgroundColor: 'var(--c-surface, #FFFFFF)', color: INK }}
              >
                See our dental plans
                <span aria-hidden="true" className="ml-2">→</span>
              </a>
            </div>
          </DeepBand>
        )}

        {/* ── HSA/FSA + final-bill explainer ──────────────────────────── */}
        <section className="py-14 sm:py-24" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-14">
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: headingInk }}
                  data-edit-field="copy:insurance.hsaEyebrow"
                  data-edit-kind="text"
                  data-edit-label="eyebrow"
                >
                  {copyOverride(copyOverrides, 'insurance.hsaEyebrow', 'HSA & FSA')}
                </p>
                <h2
                  className="text-2xl sm:text-3xl lg:text-[36px] font-semibold leading-[1.1] tracking-[-0.015em] mb-5"
                  style={{
                    color: headingInk,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:insurance.hsaHeading"
                  data-edit-kind="text"
                  data-edit-label="headline"
                >
                  {copyOverride(copyOverrides, 'insurance.hsaHeading', 'Use your HSA or FSA dollars here.')}
                </h2>
                <p
                  className="text-[16px] leading-[1.65]"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:insurance.hsaBody"
                  data-edit-kind="text"
                  data-edit-label="text"
                >
                  {copyOverride(
                    copyOverrides,
                    'insurance.hsaBody',
                    'We accept HSA and FSA cards for eligible dental care. Most treatment we provide qualifies (preventive, restorative, orthodontic). Cosmetic treatments like whitening typically do not qualify — we will let you know either way before billing.',
                  )}
                </p>
              </div>
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: headingInk }}
                  data-edit-field="copy:insurance.finalBillEyebrow"
                  data-edit-kind="text"
                  data-edit-label="eyebrow"
                >
                  {copyOverride(copyOverrides, 'insurance.finalBillEyebrow', 'The final bill')}
                </p>
                <h2
                  className="text-2xl sm:text-3xl lg:text-[36px] font-semibold leading-[1.1] tracking-[-0.015em] mb-5"
                  style={{
                    color: headingInk,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:insurance.finalBillHeading"
                  data-edit-kind="text"
                  data-edit-label="headline"
                >
                  {copyOverride(copyOverrides, 'insurance.finalBillHeading', 'No silent surprises.')}
                </h2>
                <p
                  className="text-[16px] leading-[1.65]"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:insurance.finalBillBody"
                  data-edit-kind="text"
                  data-edit-label="text"
                >
                  {copyOverride(
                    copyOverrides,
                    'insurance.finalBillBody',
                    'We verify your benefits and walk you through a clear estimate before any treatment begins. After the visit, your insurance pays its portion, and any remaining patient balance is billed through your portal. You will never see a charge you have not already been told about.',
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

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
                data-edit-field="copy:insurance.faqHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'insurance.faqHeading', '') || 'Insurance questions, answered.'}
              </h2>
            </ScrollReveal>
            <div className="space-y-3">
              {insuranceFaq.map((item, i) => (
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
          heading={copyOverride(copyOverrides, 'insurance.cta.heading', 'Have more questions?')}
          subhead={copyOverride(copyOverrides, 'insurance.cta.subhead', 'Call us, book a visit, or message us through the portal — we’ll walk you through anything insurance-shaped.')}
          editKeyPrefix="insurance.cta"
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


