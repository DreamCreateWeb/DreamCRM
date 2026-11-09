import { copyOverride } from '@/lib/clinic-site-helpers'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import MembershipJoin from '@/app/site/[slug]/membership/membership-join'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

import type { PlansPageBodyProps } from '@/lib/site-templates/subpage-props'

/**
 * Modern's plans body — moved verbatim out of the page shell (ML-52). The
 * shell owns every read / SEO / gate and hands this the values it computed.
 */
export default function ModernPlans({
  copyOverrides,
  headingInk,
  name,
  slug,
  brand,
  plans,
  invitedPlan,
  invitedEmail,
  bookLabel,
  bookHref,
  profile
}: PlansPageBodyProps) {
  return (
    <>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[820px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
              data-edit-field="copy:dentalPlans.heroEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'dentalPlans.heroEyebrow', 'Patients · Dental Plans')}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{
                color: headingInk,
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
              data-edit-field="copy:dentalPlans.heroTitle"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'dentalPlans.heroTitle', `Dental plans at ${name}.`)}
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6]"
              style={{ color: INK }}
              data-edit-field="copy:dentalPlans.heroIntro"
              data-edit-kind="text"
              data-edit-label="text"
            >
              {copyOverride(
                copyOverrides,
                'dentalPlans.heroIntro',
                'No insurance? No problem. Our in-house dental plan covers your routine preventive care and gives you a meaningful discount on every other treatment — with no deductibles, no claim forms, and no waiting periods.',
              )}
            </p>
          </div>
        </section>

        {/* ── Plan cards + join form ──────────────────────────────────────── */}
        <section
          className="py-10 sm:py-16"
          style={{ backgroundColor: SURFACE }}
          data-edit-field="dental_plans"
          data-edit-kind="modal"
          data-edit-label="membership plans"
        >
          <div className="max-w-[900px] mx-auto px-5 sm:px-8">
            <ScrollReveal>
              <MembershipJoin
                slug={slug}
                brand={brand}
                plans={plans}
                initialPlanSlug={invitedPlan?.slug}
                initialEmail={invitedEmail}
              />
            </ScrollReveal>
          </div>
        </section>

        {/* ── Why memberships work — small reassurance band ─────────────── */}
        <section className="py-16 sm:py-20">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
                data-edit-field="copy:dentalPlans.whyEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'dentalPlans.whyEyebrow', 'Why patients choose this')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:dentalPlans.whyHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'dentalPlans.whyHeading', 'Better than dental insurance, for most people.')}
              </h2>
            </ScrollReveal>
            <ul className="grid sm:grid-cols-3 gap-5 sm:gap-6">
              {[
                {
                  title: 'No deductibles',
                  body:
                    'Your coverage starts the moment you join. No paying down a deductible before benefits kick in.',
                },
                {
                  title: 'No annual maximums',
                  body:
                    'Insurance caps your benefits each year. Our plan does not — you get the savings on every treatment.',
                },
                {
                  title: 'No claim forms',
                  body:
                    'Pay one annual or monthly fee, then your visits and discounts are applied automatically at check-out.',
                },
              ].map((b, i) => (
                <ScrollReveal
                  as="li"
                  key={b.title}
                  delay={i * 100}
                  className="rounded-2xl p-6 sm:p-7 transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                  style={{
                    backgroundColor: SURFACE,
                    border: `1px solid ${BORDER}`,
                    listStyle: 'none',
                  }}
                >
                  <span
                    className="text-3xl font-bold leading-none tracking-[-0.02em] mb-3 block"
                    style={{
                      color: headingInk,
                      fontFamily: 'var(--font-display, Georgia, serif)',
                    }}
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3
                    className="text-lg font-semibold mb-2 leading-tight"
                    style={{ color: INK }}
                    data-edit-field={`copy:dentalPlans.why.${i}.title`}
                    data-edit-kind="text"
                    data-edit-label="title"
                  >
                    {copyOverride(copyOverrides, `dentalPlans.why.${i}.title`, b.title)}
                  </h3>
                  <p
                    className="text-[15px] leading-[1.6]"
                    style={{ color: INK_MUTED }}
                    data-edit-field={`copy:dentalPlans.why.${i}.body`}
                    data-edit-kind="text"
                    data-edit-label="text"
                  >
                    {copyOverride(copyOverrides, `dentalPlans.why.${i}.body`, b.body)}
                  </p>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </section>

        <ClosingCTA
          heading={copyOverride(copyOverrides, 'dentalPlans.cta.heading', 'Ready to join?')}
          subhead={copyOverride(copyOverrides, 'dentalPlans.cta.subhead', 'Pick a plan above, or call us with any questions — we’re happy to walk through what coverage looks like for your situation.')}
          editKeyPrefix="dentalPlans.cta"
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


