import { notFound } from 'next/navigation'
import { getConfirmContextByToken } from '@/lib/services/appointment-confirm'
import { formatClinicDayTime } from '@/lib/format-datetime'
import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import ConfirmForm from './confirm-form'

export const metadata = {
  title: 'Confirm your visit',
  description: 'Confirm your upcoming appointment.',
  // Token-authenticated patient page (renders the patient's name) — never
  // index, never follow.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

/**
 * Public one-click confirm page — `https://…/c/<token>`. The patient lands
 * here from the reminder email's "Confirm my visit" button. Confirmation is a
 * POST (the button) — never on GET, so inbox link-prefetchers can't confirm a
 * visit by scanning the email. Token IS the auth (the /r + /w pattern).
 * Wears the CLINIC's brand via MinimalSiteChrome.
 */
export default async function ConfirmVisitPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const ctx = await getConfirmContextByToken(token)
  if (!ctx) notFound()

  const brand = ctx.brandColor || '#9CAF9F'
  const siteUrl = ctx.slug ? `https://${ctx.slug}.${SITE_DOMAIN}` : null

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FRAUNCES_HREF} />
      <style>{`:root { --font-display: 'Fraunces', Georgia, serif; --site-header-h: 64px; }`}</style>
      <MinimalSiteChrome
        clinicName={ctx.clinicName}
        logoUrl={ctx.logoUrl}
        brand={brand}
        homeHref={siteUrl}
      >
        <div className="px-4 py-12 sm:py-16">
          <div className="max-w-lg mx-auto">
            <ConfirmForm
              token={token}
              brand={brand}
              clinicName={ctx.clinicName}
              clinicPhone={ctx.clinicPhone}
              patientFirstName={ctx.patientFirstName}
              whenLabel={formatClinicDayTime(ctx.startTime, ctx.timeZone)}
              visitTypeLabel={ctx.visitTypeLabel}
              providerName={ctx.providerName}
              prepInstructions={ctx.prepInstructions}
              initialState={ctx.state}
              bookUrl={siteUrl ? `${siteUrl}/book` : null}
            />
          </div>
        </div>
      </MinimalSiteChrome>
    </>
  )
}
