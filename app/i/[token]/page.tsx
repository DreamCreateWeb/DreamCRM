import { notFound } from 'next/navigation'
import { getPlanLandingByToken, finalizePlanSetup } from '@/lib/services/payment-plans'
import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import PlanForm from './plan-form'

export const metadata = {
  title: 'Your payment plan',
  description: 'Review and accept your payment plan in about two minutes.',
  // Token-authenticated patient page — never index, never follow.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap'

/**
 * Public payment-plan landing — `https://…/i/<token>` (the /b pattern: the
 * token IS the auth). 'proposed' shows the terms + accept (Stripe setup-mode
 * Checkout saves the card, then the return trip charges the first
 * installment); after that the same link is the patient's "where's my plan"
 * status page for the plan's whole life.
 */
export default async function PaymentPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = searchParams ? await searchParams : {}
  const setupSession = typeof sp.setup_session === 'string' ? sp.setup_session : null

  // Return trip from Stripe setup — finalize (CAS) + first charge, then load
  // the now-active context. Idempotent on reload.
  let justAccepted = false
  if (setupSession && setupSession.length < 200) {
    try {
      const r = await finalizePlanSetup(token, setupSession)
      justAccepted = r.ok
    } catch (err) {
      console.warn('[plan-landing] finalize failed', err)
    }
  }

  const ctx = await getPlanLandingByToken(token)
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
            <PlanForm
              token={token}
              brand={brand}
              clinicName={ctx.clinicName}
              clinicPhone={ctx.clinicPhone}
              patientFirstName={ctx.patientFirstName}
              state={ctx.state}
              totalCents={ctx.totalCents}
              installments={ctx.installments}
              installmentCents={ctx.installmentCents}
              lastInstallmentCents={ctx.lastInstallmentCents}
              installmentsPaid={ctx.installmentsPaid}
              nextChargeAtIso={ctx.nextChargeAt ? ctx.nextChargeAt.toISOString() : null}
              canPay={ctx.canPay}
              justAccepted={justAccepted}
            />
          </div>
        </div>
      </MinimalSiteChrome>
    </>
  )
}
