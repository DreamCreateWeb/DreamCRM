import { notFound } from 'next/navigation'
import { getPayLandingByToken, finalizePayTokenReturn } from '@/lib/services/balance-outreach'
import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import PayForm from './pay-form'

export const metadata = {
  title: 'Pay your balance',
  description: 'Pay your balance online in about a minute.',
  // Token-authenticated patient page (renders the patient's name + balance) —
  // never index, never follow.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap'

/**
 * Public email-to-pay landing — `https://…/b/<token>`. The patient lands here
 * from the "your balance" email; the token IS the auth (the /r /w /c
 * pattern). Always shows the LIVE PMS balance (never the emailed snapshot),
 * takes payment through the clinic's connected Stripe account, and finalizes
 * the return trip idempotently (the Connect webhook is the backstop).
 */
export default async function PayBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = searchParams ? await searchParams : {}
  const sessionId = typeof sp.session_id === 'string' ? sp.session_id : null

  // Return trip from Stripe — finalize before loading the (now updated) context.
  let paidCents: number | null = null
  if (sessionId && sessionId.length < 200) {
    try {
      const r = await finalizePayTokenReturn(token, sessionId)
      paidCents = r?.paidCents ?? null
    } catch (err) {
      console.warn('[pay-landing] finalize failed', err)
    }
  }

  const ctx = await getPayLandingByToken(token)
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
            <PayForm
              token={token}
              brand={brand}
              clinicName={ctx.clinicName}
              clinicPhone={ctx.clinicPhone}
              patientFirstName={ctx.patientFirstName}
              balanceCents={ctx.balanceCents}
              balanceUpdatedAtIso={ctx.balanceUpdatedAt ? ctx.balanceUpdatedAt.toISOString() : null}
              canPay={ctx.canPay}
              justPaidCents={paidCents}
            />
          </div>
        </div>
      </MinimalSiteChrome>
    </>
  )
}
