import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ComingSoon from '@/components/ui/coming-soon'

export const metadata = {
  title: 'Integrations - DreamCRM',
}

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  return (
    <ComingSoon
      title="Integrations"
      phase="Phase 4"
      oneLiner="DreamCRM wraps your existing PMS — Open Dental, Dentrix, Eaglesoft — rather than replacing it. Sync patient records, appointments, and balances in both directions."
      features={[
        'Open Dental (open API, friendly vendor list — first integration)',
        'Dentrix Hub / Ascend (second priority)',
        'Eaglesoft and Curve Dental (after the first two ship)',
        'Two-way sync: bookings + patient profile + balance + appointment status',
        'Per-clinic mapping UI: which PMS fields populate which DreamCRM columns',
        'Audit log of every sync operation for HIPAA-friendly traceability',
      ]}
      matching="NexHealth (the gold standard for PMS-bridge depth)"
      todayAlternative={{
        label: 'Import patients via CSV in Settings',
        href: '/settings/clinic',
      }}
    />
  )
}
