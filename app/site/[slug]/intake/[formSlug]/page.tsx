import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
} from '@/lib/services/clinic-site'
import { getFormTemplateBySlug } from '@/lib/services/forms'
import type { FormTemplateSchema } from '@/lib/types/forms'
import IntakeFormRunner from './intake-form-runner'
import { submitIntakeForm } from './actions'

interface Props {
  params: Promise<{ slug: string; formSlug: string }>
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

export default async function IntakeFormPage({ params }: Props) {
  const { slug, formSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const template = await getFormTemplateBySlug(data.orgId, formSlug)
  if (!template) notFound()

  const name = data.profile.displayName ?? data.orgName
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const basePath = `/site/${slug}`
  const schema = template.schema as FormTemplateSchema

  const BG = '#FAF7F2'
  const INK = '#1C1A17'
  const INK_MUTED = '#6B635A'
  const SURFACE = '#FFFFFF'
  const BORDER = '#E8E2D9'

  return (
    <div
      className="min-h-screen font-inter antialiased"
      style={{ backgroundColor: BG, color: INK }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ backgroundColor: `${BG}EE`, borderColor: BORDER }}
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between gap-4">
          <a href={basePath} className="flex items-center gap-3 min-w-0">
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
          </a>
        </div>
      </header>

      <main className="py-12 sm:py-20">
        <div className="max-w-[720px] mx-auto px-5 sm:px-8">
          <div className="mb-10">
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
              style={{ color: brand }}
            >
              Patient intake
            </p>
            <h1
              className="text-3xl sm:text-4xl font-bold leading-[1.1] tracking-[-0.02em] mb-3"
              style={{ color: INK }}
            >
              {template.title}
            </h1>
            {template.description && (
              <p className="text-lg leading-[1.55]" style={{ color: INK_MUTED }}>
                {template.description}
              </p>
            )}
          </div>

          <IntakeFormRunner
            orgId={data.orgId}
            templateId={template.id}
            schema={schema}
            brand={brand}
            clinicName={name}
            action={submitIntakeForm}
          />
        </div>
      </main>

      <footer className="border-t" style={{ borderColor: BORDER }}>
        <div
          className="max-w-[1240px] mx-auto px-5 sm:px-8 py-8 text-center text-sm"
          style={{ color: INK_MUTED }}
        >
          © {new Date().getFullYear()} {name} · Powered by{' '}
          <a
            href="https://dreamcreateweb.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
            style={{ color: INK }}
          >
            DreamCreate
          </a>
        </div>
      </footer>
    </div>
  )
}
