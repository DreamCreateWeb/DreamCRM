import { notFound } from 'next/navigation'
import { getNpsByToken } from '@/lib/services/nps'
import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import SurveyForm from './survey-form'

export const metadata = {
  title: 'One quick question',
  description: 'A ten-second question about your visit.',
  // Token-authenticated patient page — never index, never follow.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap'

/**
 * Public post-visit survey landing — `https://…/n/<token>` (the /r pattern:
 * the token IS the auth). 0–10 tap → optional comment → thanks; recorded via
 * POST actions, never on GET, so email scanners can't answer surveys.
 */
export default async function NpsSurveyPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const ctx = await getNpsByToken(token)
  if (!ctx) notFound()

  const brand = ctx.brandColor || '#9CAF9F'

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
        homeHref={null}
      >
        <div className="px-4 py-12 sm:py-16">
          <div className="max-w-lg mx-auto">
            <SurveyForm
              token={token}
              brand={brand}
              clinicName={ctx.clinicName}
              patientFirstName={ctx.patientFirstName}
              initialScore={ctx.score}
            />
          </div>
        </div>
      </MinimalSiteChrome>
    </>
  )
}
