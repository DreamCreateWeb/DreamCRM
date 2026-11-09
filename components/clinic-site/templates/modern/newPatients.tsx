import { brandFill } from '@/lib/clinic-site-theme'
import { copyOverride } from '@/lib/clinic-site-helpers'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import { DeepBand } from '@/components/clinic-site/decor'
import NumberedSteps from '@/components/clinic-site/numbered-steps'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

import type { NewPatientsPageBodyProps } from '@/lib/site-templates/subpage-props'

/**
 * Modern's newPatients body — moved verbatim out of the page shell (ML-52). The
 * shell owns every read / SEO / gate and hands this the values it computed.
 */
export default function ModernNewPatients({
  copyOverrides,
  headingInk,
  name,
  bookHref,
  brand,
  bookLabel,
  intakeOpen,
  intakeHref,
  expectSteps,
  bringItems,
  hasDentalPlans,
  insuranceBodyDerived,
  basePath,
  paymentBodyDerived,
  npFaq,
  profile
}: NewPatientsPageBodyProps) {
  return (
    <>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
              data-edit-field="copy:newPatients.heroEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'newPatients.heroEyebrow', 'Patients · Your first visit')}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{
                color: headingInk,
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
              data-edit-field="copy:newPatients.heading"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'newPatients.heading', '') || (
                <>Your first visit at {name}.</>
              )}
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6] mb-9"
              style={{ color: INK }}
              data-edit-field="copy:newPatients.heroIntro"
              data-edit-kind="text"
              data-edit-label="intro"
            >
              {copyOverride(copyOverrides, 'newPatients.heroIntro', '') || (
                <>
                  New place, new faces — we get it. Here&rsquo;s exactly what your
                  first visit looks like, what to bring, and how the money part
                  works. No surprises, no judgment.
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
              {intakeOpen && (
                <a
                  href={intakeHref}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border bg-[var(--c-surface,#FFFFFF)] transition hover:shadow-sm"
                  style={{ color: INK, borderColor: BORDER }}
                >
                  Start your intake online
                  <span aria-hidden="true">→</span>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ── What to expect — 4 numbered steps ───────────────────────────── */}
        <section className="py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <NumberedSteps
              steps={expectSteps}
              brand={headingInk}
              columns={2}
              surface="bg"
              eyebrow={copyOverride(copyOverrides, 'newPatients.expect.eyebrow', 'What to expect')}
              heading={
                copyOverride(copyOverrides, 'newPatients.expect.heading', '') ||
                'Your first visit, step by step.'
              }
              editKeyPrefix="newPatients.expect"
            />
          </div>
        </section>

        {/* ── Before you arrive — deep band w/ checklist + intake card ────── */}
        <DeepBand className="pt-20 pb-14 sm:pt-32 sm:pb-24" arcFill="var(--c-surface, #FFFFFF)">
          <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="text-center max-w-[700px] mx-auto mb-12">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: 'rgba(250, 247, 242, 0.7)' }}
                data-edit-field="copy:newPatients.bringEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'newPatients.bringEyebrow', 'Before you arrive')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                style={{
                  color: 'var(--c-deep-ink, #FAF7F2)',
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:newPatients.bringHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'newPatients.bringHeading', '') || 'What to bring'}
              </h2>
              <p
                className="text-base sm:text-lg leading-[1.55]"
                style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                data-edit-field="copy:newPatients.bringIntro"
                data-edit-kind="text"
                data-edit-label="text"
              >
                {copyOverride(
                  copyOverrides,
                  'newPatients.bringIntro',
                  'Four things, and only if you have them — missing one is never a reason to reschedule.',
                )}
              </p>
            </div>
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-start">
              {/* Left: the bring checklist */}
              <ul className="space-y-5">
                {bringItems.map((item, i) => (
                  <li key={item.title} className="flex items-start gap-4">
                    <span
                      className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full mt-0.5"
                      style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                      aria-hidden="true"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.25}
                        style={{ color: 'var(--c-deep-ink, #FAF7F2)' }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                    <div>
                      <h3
                        className="text-lg font-semibold mb-1 leading-tight"
                        style={{ color: 'var(--c-deep-ink, #FAF7F2)' }}
                        data-edit-field={`copy:newPatients.bring.${i}.title`}
                        data-edit-kind="text"
                        data-edit-label="title"
                      >
                        {item.title}
                      </h3>
                      <p
                        className="text-[15px] leading-[1.6]"
                        style={{ color: 'rgba(255,255,255,0.78)' }}
                        data-edit-field={`copy:newPatients.bring.${i}.body`}
                        data-edit-kind="text"
                        data-edit-label="text"
                      >
                        {item.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Right: skip-the-clipboard intake card — hidden with the door (law 1) */}
              {intakeOpen && (
              <div
                className="rounded-2xl sm:rounded-3xl p-7 sm:p-10"
                style={{ backgroundColor: 'var(--c-surface, #FFFFFF)', color: INK }}
              >
                <h3
                  className="text-xl sm:text-2xl font-semibold mb-3"
                  style={{
                    color: headingInk,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:newPatients.intakeHeading"
                  data-edit-kind="text"
                  data-edit-label="title"
                >
                  {copyOverride(copyOverrides, 'newPatients.intakeHeading', 'Skip the clipboard')}
                </h3>
                <p
                  className="text-[15px] sm:text-base leading-[1.65] mb-6"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:newPatients.intakeBody"
                  data-edit-kind="text"
                  data-edit-label="text"
                >
                  {copyOverride(
                    copyOverrides,
                    'newPatients.intakeBody',
                    'Do your paperwork from home — it takes a few minutes, and your answers are waiting for us when you arrive. Your info stays private and goes straight to your chart.',
                  )}
                </p>
                <a
                  href={intakeHref}
                  className="inline-flex items-center px-6 py-3 rounded-full text-[15px] font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
                  style={{ backgroundColor: brandFill(brand) }}
                >
                  Start your intake online
                  <span aria-hidden="true" className="ml-2">→</span>
                </a>
              </div>
              )}
            </div>
          </div>
        </DeepBand>

        {/* ── The money part — insurance + payment cards (real data) ──────── */}
        <section className="py-14 sm:py-24">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-12">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
                data-edit-field="copy:newPatients.moneyEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'newPatients.moneyEyebrow', 'The money part')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:newPatients.moneyHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'newPatients.moneyHeading', '') ||
                  'Costs, insurance, and zero surprises.'}
              </h2>
            </ScrollReveal>
            <div className={`grid gap-5 sm:gap-7 ${hasDentalPlans ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
              <ScrollReveal
                className="rounded-2xl p-6 sm:p-7 flex flex-col transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
              >
                <h3
                  className="text-lg font-semibold mb-2 leading-tight"
                  style={{ color: INK }}
                  data-edit-field="copy:newPatients.moneyInsuranceTitle"
                  data-edit-kind="text"
                  data-edit-label="title"
                >
                  {copyOverride(copyOverrides, 'newPatients.moneyInsuranceTitle', 'Using insurance?')}
                </h3>
                <p
                  className="text-[15px] leading-[1.6] mb-4 flex-1"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:newPatients.moneyInsuranceBody"
                  data-edit-kind="text"
                  data-edit-label="text"
                >
                  {copyOverride(copyOverrides, 'newPatients.moneyInsuranceBody', '') ||
                    insuranceBodyDerived}
                </p>
                <a
                  href={`${basePath}/insurance`}
                  className="inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2"
                  style={{ color: headingInk }}
                >
                  See insurance details
                  <span aria-hidden="true">→</span>
                </a>
              </ScrollReveal>
              <ScrollReveal
                delay={100}
                className="rounded-2xl p-6 sm:p-7 flex flex-col transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
              >
                <h3
                  className="text-lg font-semibold mb-2 leading-tight"
                  style={{ color: INK }}
                  data-edit-field="copy:newPatients.moneyPaymentTitle"
                  data-edit-kind="text"
                  data-edit-label="title"
                >
                  {copyOverride(copyOverrides, 'newPatients.moneyPaymentTitle', 'Paying without insurance?')}
                </h3>
                <p
                  className="text-[15px] leading-[1.6] mb-4 flex-1"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:newPatients.moneyPaymentBody"
                  data-edit-kind="text"
                  data-edit-label="text"
                >
                  {copyOverride(copyOverrides, 'newPatients.moneyPaymentBody', '') ||
                    paymentBodyDerived}
                </p>
                <a
                  href={`${basePath}/payment-financing`}
                  className="inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2"
                  style={{ color: headingInk }}
                >
                  Payment &amp; financing
                  <span aria-hidden="true">→</span>
                </a>
              </ScrollReveal>
              {hasDentalPlans && (
                <ScrollReveal
                  delay={200}
                  className="rounded-2xl p-6 sm:p-7 flex flex-col transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <h3
                    className="text-lg font-semibold mb-2 leading-tight"
                    style={{ color: INK }}
                    data-edit-field="copy:newPatients.plansTitle"
                    data-edit-kind="text"
                    data-edit-label="title"
                  >
                    {copyOverride(copyOverrides, 'newPatients.plansTitle', 'No dental insurance?')}
                  </h3>
                  <p
                    className="text-[15px] leading-[1.6] mb-4 flex-1"
                    style={{ color: INK_MUTED }}
                    data-edit-field="copy:newPatients.plansBody"
                    data-edit-kind="text"
                    data-edit-label="text"
                  >
                    {copyOverride(
                      copyOverrides,
                      'newPatients.plansBody',
                      'Our in-house dental plan covers preventive care and saves on other treatment — no deductibles, no claim forms, no waiting periods.',
                    )}
                  </p>
                  <a
                    href={`${basePath}/dental-plans`}
                    className="inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2"
                    style={{ color: headingInk }}
                  >
                    See our dental plans
                    <span aria-hidden="true">→</span>
                  </a>
                </ScrollReveal>
              )}
            </div>
          </div>
        </section>

        {/* ── No judgment, ever — the anti-shame promise ──────────────────── */}
        <section className="py-14 sm:py-20" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[720px] mx-auto px-5 sm:px-8 text-center">
            <ScrollReveal>
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: INK_MUTED }}
                data-edit-field="copy:newPatients.comfortEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'newPatients.comfortEyebrow', 'Been a while?')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:newPatients.comfortHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'newPatients.comfortHeading', '') ||
                  'No judgment, ever.'}
              </h2>
              <p
                className="text-base sm:text-lg leading-[1.65]"
                style={{ color: INK_MUTED }}
                data-edit-field="copy:newPatients.comfortBody"
                data-edit-kind="text"
                data-edit-label="text"
              >
                {copyOverride(
                  copyOverrides,
                  'newPatients.comfortBody',
                  'Whether it has been six months or six years, you will get the same warm welcome. We are not here to lecture you about flossing — we are here to help you move forward from wherever you are starting.',
                )}
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* ── First-visit FAQ ─────────────────────────────────────────────── */}
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
                data-edit-field="copy:newPatients.faqHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'newPatients.faqHeading', '') ||
                  'First-visit questions, answered.'}
              </h2>
            </ScrollReveal>
            <div className="space-y-3">
              {npFaq.map((item, i) => (
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
          heading={copyOverride(copyOverrides, 'newPatients.cta.heading', 'Ready when you are.')}
          subhead={copyOverride(
            copyOverrides,
            'newPatients.cta.subhead',
            'Book online in about a minute — or call, and a real person will help you find a time.',
          )}
          editKeyPrefix="newPatients.cta"
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


