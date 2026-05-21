import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ComingSoon from '@/components/ui/coming-soon'

export const metadata = {
  title: 'Practice Analytics - DreamCRM',
}

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  return (
    <ComingSoon
      title="Practice Analytics"
      phase="Phase 4"
      oneLiner="Dental-shaped KPIs the front desk actually uses — not the generic web-app charts most platforms ship."
      features={[
        'New-patient acquisition by source (Google, referral, walk-in, website, recall)',
        'Recall conversion: due → sent → opened → booked, with revenue rollup',
        'No-show + cancellation rate trend; comparison to industry benchmark',
        'Hygiene reappointment rate (patients who leave the chair already rebooked)',
        'Schedule utilization by provider + chair, surfaced as gaps not %',
        'Website funnel: visits → contact-form submissions → consultations booked',
      ]}
      matching="NexHealth Analytics, Dental Intelligence, Adit"
      todayAlternative={{
        label: 'See today\'s morning huddle on the Overview dashboard',
        href: '/',
      }}
    />
  )
}
