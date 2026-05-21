import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ComingSoon from '@/components/ui/coming-soon'

export const metadata = {
  title: 'Reviews & Reputation - DreamCRM',
}

export const dynamic = 'force-dynamic'

export default async function ReviewsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  return (
    <ComingSoon
      title="Reviews & Reputation"
      phase="Phase 2"
      oneLiner="Post-visit prompts to Google, Yelp, and Facebook — without the spammy autopilot most clinics fear."
      features={[
        'Send a review request 24–48h after every completed appointment',
        'Smart-route happy patients to public review sites; private feedback for everyone else (NPS-style triage)',
        'Live dashboard of average rating, review velocity, and per-source mix',
        'Reply to Google reviews from inside DreamCRM',
        'Per-patient opt-out + spam-safe rate limiting on requests',
      ]}
      matching="Weave, Birdeye, RevenueWell"
      todayAlternative={{
        label: 'Send a one-off review-request email from the Recall module',
        href: '/marketing/campaigns',
      }}
    />
  )
}
