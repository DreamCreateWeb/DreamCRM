import type { ReactNode } from 'react'
import type { EnrichedService } from '@/lib/services/service-library'
import type { ServicesPageBodyProps } from '@/lib/site-templates/subpage-props'
import { brandFill } from '@/lib/clinic-site-theme'
import { brandTint } from '@/lib/brand-tint'
import { EditIcon, EditText } from '@/components/clinic-site/editable'
import ServiceIcon from '@/components/clinic-site/service-icon'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import {
  SITE_BG as BG,
  SITE_INK as INK,
  SITE_INK_MUTED as INK_MUTED,
  SITE_SURFACE as SURFACE,
  SITE_BORDER as BORDER,
  SITE_HEADING,
  SITE_DEEP,
  SITE_DEEP_INK,
} from '@/components/clinic-site/tokens'

/**
 * The shared SKINNED Services body (ML-52). Every template that owns its
 * Services page composes this with its own `ServicesSkin` — the content, copy
 * keys, edit-bridge fields and data are identical to Modern's body; what a
 * template chooses is how the page LOOKS (hero register, card shape, icon
 * well, numbering, button shape, closing band). Pure presentation: tokens
 * only, no reads.
 */
export interface ServicesSkin {
  /** Hero layout: centered column, left-aligned, or a deep full-bleed banner. */
  hero: 'center' | 'left' | 'banner'
  /** Heading weight/size classes (the display face comes from --font-display). */
  headingClass: string
  /** Eyebrow classes (caps tracking vs bold pill, etc.). */
  eyebrowClass: string
  /** Eyebrow rendered as a tinted pill (Pediatric) vs plain text. */
  eyebrowPill?: boolean
  /** Card surface classes (radius / shadow / hover), varied per index. */
  cardClass: (i: number) => string
  /** Icon well classes: round / rounded square. */
  iconWellClass: string
  /** Show the 01/02/03 sequence numbers (editorial) or hide (playful). */
  numbered: boolean
  /** Button shape classes shared by the hero + card CTAs. */
  buttonClass: string
  /** Card link copy voice. */
  learnMore: string
  /** The closing band: brand fill or the template's deep ground. */
  closing: 'brand' | 'teal'
  /** Core / Special section heading classes. */
  sectionHeadingClass: string
  /** Decorative divider under the hero. */
  rule: 'none' | 'thin' | 'dots' | 'gold'
}

function Rule({ kind, brand }: { kind: ServicesSkin['rule']; brand: string }) {
  if (kind === 'none') return null
  if (kind === 'dots') {
    return (
      <div className="flex justify-center gap-2 mt-10" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brandTint(brand, i === 1 ? 0.55 : 0.28) }} />
        ))}
      </div>
    )
  }
  return (
    <div
      className="mx-auto mt-10 h-px w-24"
      style={{ backgroundColor: kind === 'gold' ? brandFill(brand) : BORDER }}
      aria-hidden="true"
    />
  )
}

function Grid({
  services,
  basePath,
  brand,
  bookHref,
  bookLabel,
  startIndex,
  skin,
}: {
  services: EnrichedService[]
  basePath: string
  brand: string
  bookHref: string
  bookLabel: string
  startIndex: number
  skin: ServicesSkin
}) {
  return (
    <div className="grid gap-5 sm:gap-6 lg:gap-7 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((s, i) => {
        const detailHref = `${basePath}/services/${s.routingSlug}`
        const oneLiner = s.shortDescription ?? s.description ?? null
        return (
          <ScrollReveal as="div" key={s.id} delay={(i % 3) * 90}>
            <div
              className={`flex flex-col group p-7 sm:p-8 h-full transition-all duration-300 ${skin.cardClass(startIndex + i)}`}
              style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-center gap-3 mb-4">
                <EditIcon
                  serviceId={s.id}
                  className={`inline-flex items-center justify-center leading-none text-2xl ${skin.iconWellClass}`}
                  style={{ color: SITE_HEADING, backgroundColor: brandTint(brand, 0.14) }}
                >
                  <ServiceIcon
                    icon={s.icon}
                    size={28}
                    fallback={<span className="dc-edit-only text-sm font-medium" style={{ color: INK_MUTED }}>+ icon</span>}
                  />
                </EditIcon>
                {skin.numbered && (
                  <span
                    className="text-xs font-semibold tracking-[0.18em] uppercase"
                    style={{ color: INK_MUTED, fontFamily: 'var(--font-display, Georgia, serif)' }}
                    aria-hidden="true"
                  >
                    {String(startIndex + i + 1).padStart(2, '0')}
                  </span>
                )}
                {s.offer && (
                  <span
                    className="ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: brandFill(brand) }}
                  >
                    {s.offer}
                  </span>
                )}
              </div>
              <h3
                className="text-xl font-semibold mb-3 leading-tight"
                style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                <a href={detailHref} className="transition group-hover:opacity-80">
                  {s.name}
                </a>
              </h3>
              {oneLiner && (
                <p className="text-[15px] leading-[1.6] mb-6" style={{ color: INK_MUTED }}>
                  {oneLiner}
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-3">
                <a
                  href={detailHref}
                  className="inline-flex items-center gap-1 text-sm font-semibold transition-all duration-300 group-hover:gap-2.5"
                  style={{ color: SITE_HEADING }}
                >
                  {skin.learnMore}
                  <span aria-hidden="true">→</span>
                </a>
                <a
                  href={bookHref}
                  className={`inline-flex items-center px-5 py-2.5 text-sm font-semibold border transition hover:shadow-sm ${skin.buttonClass}`}
                  style={{ color: SITE_HEADING, borderColor: brand }}
                >
                  {bookLabel}
                </a>
              </div>
            </div>
          </ScrollReveal>
        )
      })}
    </div>
  )
}

export default function SkinnedServices({
  skin,
  copy,
  name,
  bookHref,
  brand,
  bookLabel,
  profile,
  resolved,
  core,
  basePath,
  special,
}: ServicesPageBodyProps & { skin: ServicesSkin }): ReactNode {
  const left = skin.hero === 'left'
  const banner = skin.hero === 'banner'
  const heroInner = (
    <div className={`max-w-[800px] mx-auto px-5 sm:px-8 ${left ? 'text-left' : 'text-center'}`}>
      <EditText
        as="p"
        field="copy:services.heroEyebrow"
        label="eyebrow"
        className={`${skin.eyebrowClass} mb-5`}
        style={
          skin.eyebrowPill
            ? { color: SITE_HEADING, backgroundColor: brandTint(brand, 0.16) }
            : { color: banner ? SITE_DEEP_INK : INK_MUTED }
        }
      >
        {copy('services.heroEyebrow', 'What we do')}
      </EditText>
      <EditText
        as="h1"
        field="copy:services.heading"
        label="headline"
        className={`${skin.headingClass} mb-6`}
        style={{ color: banner ? SITE_DEEP_INK : SITE_HEADING, fontFamily: 'var(--font-display, Georgia, serif)' }}
      >
        {copy('services.heading', `Dental services at ${name}.`)}
      </EditText>
      <EditText
        as="p"
        field="copy:services.heroIntro"
        label="intro"
        className="text-base sm:text-lg leading-[1.6] mb-9"
        style={{ color: banner ? SITE_DEEP_INK : INK }}
      >
        {copy(
          'services.heroIntro',
          'Comprehensive care, gently delivered — from routine cleanings to cosmetic work and same-day fixes.',
        )}
      </EditText>
      <div className={`flex flex-wrap items-center gap-3 ${left ? '' : 'justify-center'}`}>
        <a
          href={bookHref}
          className={`inline-flex items-center px-7 py-3.5 text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95 ${skin.buttonClass}`}
          style={{ backgroundColor: brandFill(brand) }}
        >
          {bookLabel}
        </a>
        {profile.phone && (
          <a
            href={`tel:${profile.phone}`}
            className={`inline-flex items-center gap-2 px-6 py-3.5 text-base font-medium border transition hover:shadow-sm ${skin.buttonClass}`}
            style={{ color: INK, borderColor: BORDER, backgroundColor: SURFACE }}
          >
            {profile.phone}
          </a>
        )}
      </div>
      <Rule kind={skin.rule} brand={brand} />
    </div>
  )

  return (
    <>
      <section
        className="pt-10 pb-12 sm:pt-20 sm:pb-20"
        style={banner ? { backgroundColor: SITE_DEEP } : undefined}
        data-edit-field="services"
        data-edit-kind="modal"
        data-edit-label="services"
      >
        {heroInner}
      </section>

      <section
        className="pb-16 sm:pb-20"
        style={{ backgroundColor: SURFACE }}
        data-edit-field="services"
        data-edit-kind="modal"
        data-edit-label="services"
      >
        {resolved.length === 0 && (
          <div className="max-w-[760px] mx-auto px-5 sm:px-8 pt-20 sm:pt-24 pb-4 text-center">
            <p className="text-lg leading-[1.6]" style={{ color: INK }}>
              We&rsquo;re putting our full service menu together.
              {profile.phone
                ? ' In the meantime, give us a call — we’ll help you book the right visit.'
                : ' In the meantime, book a visit and we’ll take it from there.'}
            </p>
            <div
              className="dc-edit-only mt-10 rounded-2xl border-2 border-dashed py-8 px-6 text-sm font-medium"
              style={{ borderColor: BORDER, color: INK_MUTED }}
            >
              + Add your services — pick from the library and this page becomes
              your full menu, each with its own detail page.
            </div>
          </div>
        )}
        {core.length > 0 && (
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 pt-20 sm:pt-24">
            <ScrollReveal>
              <EditText
                as="h2"
                field="copy:services.coreHeading"
                label="headline"
                className={`${skin.sectionHeadingClass} mb-10 sm:mb-14`}
                style={{ color: SITE_HEADING, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                {copy('services.coreHeading', 'Core services.')}
              </EditText>
            </ScrollReveal>
            <Grid services={core} basePath={basePath} brand={brand} bookHref={bookHref} bookLabel={bookLabel} startIndex={0} skin={skin} />
          </div>
        )}
        {special.length > 0 && (
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 pt-16 sm:pt-20">
            <ScrollReveal>
              <EditText
                as="h2"
                field="copy:services.specialHeading"
                label="headline"
                className={`${skin.sectionHeadingClass} mb-10 sm:mb-14`}
                style={{ color: SITE_HEADING, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                {copy('services.specialHeading', 'Special services.')}
              </EditText>
            </ScrollReveal>
            <Grid services={special} basePath={basePath} brand={brand} bookHref={bookHref} bookLabel={bookLabel} startIndex={core.length} skin={skin} />
          </div>
        )}
      </section>

      <ClosingCTA
        heading="Not sure which one you need?"
        subhead="Book a visit and we’ll figure it out together — no judgment, no pressure."
        primary={{ label: bookLabel, href: bookHref }}
        secondary={profile.phone ? { label: profile.phone, href: `tel:${profile.phone}` } : undefined}
        brand={brand}
        variant={skin.closing}
      />
    </>
  )
}
