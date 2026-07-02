import { notFound } from 'next/navigation'
import { getOfferByToken } from '@/lib/services/appointment-waitlist'
import { formatClinicDayTime } from '@/lib/format-datetime'
import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import ClaimForm from './claim-form'

export const metadata = {
  title: 'An earlier opening',
  description: 'Claim an earlier appointment time.',
  // Token-authenticated patient page (renders the patient's name) — never
  // index, never follow.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

/**
 * Public fast-pass claim page — `https://…/w/<token>`. The patient lands here
 * from the "an earlier time opened up" email. One button: claim the slot.
 * First click wins (advisory-lock booking underneath); losers get a warm
 * "someone beat you to it" + a link to the clinic's booking page; the token
 * IS the auth (same pattern as the review landing /r/<token>).
 *
 * Wears the CLINIC's brand via MinimalSiteChrome — the patient never leaves
 * their dentist's world.
 */
export default async function WaitlistClaimPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const offer = await getOfferByToken(token)
  if (!offer) notFound()

  const brand = offer.brandColor || '#9CAF9F'
  const bookUrl = offer.slug ? `https://${offer.slug}.${SITE_DOMAIN}/book` : null

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FRAUNCES_HREF} />
      <style>{`:root { --font-display: 'Fraunces', Georgia, serif; --site-header-h: 64px; }`}</style>
      <MinimalSiteChrome
        clinicName={offer.clinicName}
        logoUrl={offer.logoUrl}
        brand={brand}
        homeHref={bookUrl ? bookUrl.replace('/book', '') : null}
      >
        <div className="px-4 py-12 sm:py-16">
          <div className="max-w-lg mx-auto">
            <ClaimForm
              token={token}
              brand={brand}
              clinicName={offer.clinicName}
              clinicPhone={offer.clinicPhone}
              patientFirstName={offer.patientFirstName}
              whenLabel={formatClinicDayTime(offer.slotStart, offer.timeZone)}
              visitTypeLabel={offer.visitTypeLabel}
              providerName={offer.providerName}
              initialStatus={offer.status}
              bookUrl={bookUrl}
            />
          </div>
        </div>
      </MinimalSiteChrome>
    </>
  )
}
