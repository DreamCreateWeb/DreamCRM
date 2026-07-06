import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
} from '@/lib/services/clinic-site'
import { getFormTemplateBySlug } from '@/lib/services/forms'
import type { FormTemplateSchema, FormTranslations } from '@/lib/types/forms'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import { readableInk } from '@/lib/clinic-site-theme'
import IntakeFormRunner from './intake-form-runner'
import { submitIntakeForm, readInsuranceCardAction } from './actions'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

interface Props {
  params: Promise<{ slug: string; formSlug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props) {
  const { slug, formSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const template = await getFormTemplateBySlug(data.orgId, formSlug)
  if (!template) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/intake/${formSlug}`
  return {
    title: `${template.title} — ${name}`,
    description: template.description ?? `Intake form for ${name}.`,
    alternates: { canonical: url },
    // Intake forms shouldn't be indexed — they're patient-specific and
    // collecting PII over a link, not destination content.
    robots: { index: false, follow: false },
  }
}

export default async function IntakeFormPage({ params, searchParams }: Props) {
  const { slug, formSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const template = await getFormTemplateBySlug(data.orgId, formSlug)
  if (!template) notFound()

  // Kiosk mode (?kiosk=1) — fill-at-the-desk tablet. Locks the chrome (no
  // links off the form) and auto-resets after each submission so the front
  // desk can hand the tablet patient-to-patient. Launched from /intake-forms.
  const sp = searchParams ? await searchParams : {}
  const kiosk = sp.kiosk === '1'

  const name = data.profile.displayName ?? data.orgName
  const brand = data.profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const basePath = await resolveSiteBasePath(slug)
  const schema = template.schema as FormTemplateSchema

          
  return (
    <div
      className="min-h-screen font-inter antialiased"
      style={{ backgroundColor: BG, color: INK }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ backgroundColor: 'var(--c-bg, #FAF7F2)', borderColor: BORDER }}
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between gap-4">
          <KioskAwareHome href={basePath} kiosk={kiosk}>
            {data.profile.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={data.profile.logoUrl}
                alt={name}
                className="w-10 h-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span
                className="flex items-center justify-center w-10 h-10 rounded-lg text-white text-base font-bold shrink-0"
                style={{ backgroundColor: brand }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="font-semibold text-[17px] leading-tight truncate" style={{ color: INK }}>
              {name}
            </span>
          </KioskAwareHome>
        </div>
      </header>

      <main className="py-12 sm:py-20">
        <div className="max-w-[720px] mx-auto px-5 sm:px-8">
          <div className="mb-10 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: headingInk }}
            >
              Patient intake
            </p>
            <h1
              className="text-[30px] sm:text-[42px] lg:text-[56px] font-semibold leading-[1.06] tracking-[-0.015em] mb-4"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {template.title}
            </h1>
            {template.description && (
              <p className="text-lg leading-[1.55] mx-auto max-w-[560px]" style={{ color: INK_MUTED }}>
                {template.description}
              </p>
            )}
            <p
              className="text-xs mt-5 inline-flex items-center gap-1.5"
              style={{ color: INK_MUTED }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Takes about 5–10 minutes · Your responses are private
            </p>
          </div>

          <ScrollReveal>
            <div
              className="rounded-2xl sm:rounded-3xl p-5 sm:p-9 shadow-sm"
              style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
            >
              <IntakeFormRunner
                orgId={data.orgId}
                templateId={template.id}
                schema={schema}
                brand={brand}
                clinicName={name}
                action={submitIntakeForm}
                ocrAction={readInsuranceCardAction}
                translations={template.translations as FormTranslations | null}
                kioskMode={kiosk}
              />
            </div>
          </ScrollReveal>
        </div>
      </main>

      <footer className="border-t" style={{ borderColor: BORDER }}>
        <div
          className="max-w-[1240px] mx-auto px-5 sm:px-8 py-8 text-center text-sm"
          style={{ color: INK_MUTED }}
        >
          © {new Date().getFullYear()} {name}
          {!kiosk && (
            <>
              {' '}· Powered by{' '}
              <a
                href="https://dreamcreateweb.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
                style={{ color: INK }}
              >
                DreamCreate
              </a>
            </>
          )}
        </div>
      </footer>
    </div>
  )
}

/** The header identity: a home link normally; inert in kiosk mode so a
 *  patient can't wander off the form on the front-desk tablet. */
function KioskAwareHome({
  href,
  kiosk,
  children,
}: {
  href: string
  kiosk: boolean
  children: React.ReactNode
}) {
  if (kiosk) return <span className="flex items-center gap-3 min-w-0">{children}</span>
  return (
    <a href={href} className="flex items-center gap-3 min-w-0">
      {children}
    </a>
  )
}
