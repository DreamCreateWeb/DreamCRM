export const metadata = {
  title: 'Partners - DreamCRM',
  description: 'Referral partners, their clinics, commission, and payouts',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listPartners } from '@/lib/services/referrals'
import { PageHeader } from '@/components/ui/page-header'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { moneyFromCents } from '@/lib/types/referrals'
import AddPartnerModal from './add-partner-modal'
import PartnersTable from './partners-table'

export default async function PartnersPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'partner') redirect('/partner')
  if (ctx.tenantType !== 'platform') redirect('/')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/dashboard')

  const partners = await listPartners()

  const activeCount = partners.filter((p) => p.status === 'active').length
  const totalUnpaid = partners.reduce((s, p) => s + p.unpaidCents, 0)
  const totalPaid = partners.reduce((s, p) => s + p.lifetimePaidCents, 0)
  const totalClinics = partners.reduce((s, p) => s + p.clinicCount, 0)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Platform · Dream Create"
        title="Referral partners"
        subtitle="People who refer clinics earn a share of each paid subscription. Set their rate, attribute clinics, and pay them out."
        legend={
          <EncodingLegend
            pills={[
              { tone: 'info', label: 'Invited', meaning: 'Created — invite sent, not yet accepted.' },
              { tone: 'ok', label: 'Active', meaning: 'Accepted their invite and can sign in.' },
              { tone: 'neutral', label: 'Suspended', meaning: 'Paused — no new commission accrues.' },
              { tone: 'ok', label: 'Payouts active', meaning: 'Connected a payout method; ready to withdraw.' },
              { tone: 'warn', label: 'Finishing setup', meaning: 'Started Stripe onboarding but not done.' },
            ]}
          />
        }
        actions={<AddPartnerModal />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiStat label="Partners" value={partners.length} sub={`${activeCount} active`} />
        <KpiStat label="Clinics referred" value={totalClinics} />
        <KpiStat label="Accrued (unpaid)" value={moneyFromCents(totalUnpaid)} tone={totalUnpaid > 0 ? 'warn' : undefined} sub={totalUnpaid > 0 ? 'Owed across all partners' : 'Nothing owed'} />
        <KpiStat label="Lifetime paid" value={moneyFromCents(totalPaid)} />
      </div>

      {partners.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="No referral partners yet"
          body="Add a partner — like an MSP or consultant who sends you clinics — set their commission rate, and they’ll get a portal to track earnings and take payouts."
          action={<AddPartnerModal />}
        />
      ) : (
        <PartnersTable partners={partners} />
      )}
    </div>
  )
}
