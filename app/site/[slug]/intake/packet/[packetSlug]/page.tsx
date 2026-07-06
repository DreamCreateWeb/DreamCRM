import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { getPacketWithForms } from '@/lib/services/forms'
import type { FormTemplateSchema, FormTranslations } from '@/lib/types/forms'
import { readableInk } from '@/lib/clinic-site-theme'
import { submitIntakeForm, readInsuranceCardAction } from '../../[formSlug]/actions'
import PacketRunner, { type PacketForm } from './packet-runner'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

interface Props {
  params: Promise<{ slug: string; packetSlug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug, packetSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const result = await getPacketWithForms(data.orgId, packetSlug)
  if (!result) return {}
  const name = data.profile.displayName ?? data.orgName
  return {
    title: `${result.packet.title} — ${name}`,
    description: `Patient forms for ${name}.`,
    alternates: { canonical: `${publicSiteUrl(data)}/intake/packet/${packetSlug}` },
    robots: { index: false, follow: false },
  }
}

export default async function IntakePacketPage({ params }: Props) {
  const { slug, packetSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const result = await getPacketWithForms(data.orgId, packetSlug)
  if (!result) notFound()

  const name = data.profile.displayName ?? data.orgName
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const headingInk = readableInk(brand)
  const basePath = await resolveSiteBasePath(slug)

  const forms: PacketForm[] = result.forms.map((f) => ({
    id: f.id,
    title: f.title,
    schema: f.schema as FormTemplateSchema,
    translations: (f.translations as FormTranslations | null) ?? null,
  }))

        
  return (
    <div className="min-h-screen font-inter antialiased" style={{ backgroundColor: BG, color: INK }}>
      <header className="sticky top-0 z-40 backdrop-blur-md border-b" style={{ backgroundColor: 'var(--c-bg, #FAF7F2)', borderColor: BORDER }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between gap-4">
          <a href={basePath} className="flex items-center gap-3 min-w-0">
            {data.profile.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={data.profile.logoUrl} alt={name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
            ) : (
              <span className="flex items-center justify-center w-10 h-10 rounded-lg text-white text-base font-bold shrink-0" style={{ backgroundColor: brand }}>
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
          <div className="mb-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] mb-5" style={{ color: headingInk }}>
              Patient forms
            </p>
            <h1
              className="text-[30px] sm:text-[42px] lg:text-[56px] font-semibold leading-[1.06] tracking-[-0.015em] mb-4"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {result.packet.title}
            </h1>
            <p className="text-lg leading-[1.55] mx-auto max-w-[560px]" style={{ color: INK_MUTED }}>
              {forms.length} quick {forms.length === 1 ? 'form' : 'forms'} to complete before your visit — we&rsquo;ll take them one at a time.
            </p>
          </div>

          <PacketRunner
            orgId={data.orgId}
            brand={brand}
            clinicName={name}
            forms={forms}
            action={submitIntakeForm}
            ocrAction={readInsuranceCardAction}
          />
        </div>
      </main>

      <footer className="border-t" style={{ borderColor: BORDER }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-8 text-center text-sm" style={{ color: INK_MUTED }}>
          © {new Date().getFullYear()} {name}
        </div>
      </footer>
    </div>
  )
}
