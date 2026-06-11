import { listClinics } from '@/lib/services/clinics'
import { listActivePartners } from '@/lib/services/referrals'
import { formatMoneyShort, formatNumberShort } from '@/lib/utils/format'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { type PillLegendRow } from '@/lib/ui/encodings'
import ClinicsList from './clinics-list'
import AddClinicModal from './add-clinic-modal'

const PLAN_PILLS: PillLegendRow[] = [
  { tone: 'neutral', label: 'Basic', meaning: 'Basic plan tier' },
  { tone: 'info', label: 'Pro', meaning: 'Pro plan tier' },
  { tone: 'special', label: 'Premium', meaning: 'Premium plan tier' },
]

const STATUS_PILLS: PillLegendRow[] = [
  { tone: 'ok', label: 'active', meaning: 'Paying or trialing — healthy' },
  { tone: 'urgent', label: 'past due', meaning: 'Payment failed — needs intervention' },
  { tone: 'neutral', label: 'canceled', meaning: 'Inactive — no live subscription' },
  { tone: 'info', label: 'setup pending', meaning: 'You created this clinic — owner hasn’t accepted the invite / added billing yet' },
  { tone: 'neutral', label: 'comped', meaning: 'Platform-granted plan, no Stripe subscription (free account)' },
]

export default async function PlatformClinics() {
  const [rows, partners] = await Promise.all([listClinics(), listActivePartners()])

  // Aggregate top-line numbers from the rows we already have
  let activeCount = 0
  let pastDueCount = 0
  let newIn30d = 0
  let mrrCents = 0
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000
  for (const r of rows) {
    if (r.subscriptionStatus === 'active' || r.subscriptionStatus === 'trialing') {
      activeCount++
      mrrCents += r.monthlyContributionCents
    }
    if (
      r.subscriptionStatus === 'past_due' ||
      r.subscriptionStatus === 'unpaid' ||
      r.subscriptionStatus === 'incomplete_expired'
    ) {
      pastDueCount++
    }
    if (r.createdAt.getTime() >= thirtyDaysAgo) newIn30d++
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Platform · Dream Create"
        title="Clinics"
        subtitle="All clinic tenants on Dream Create — drill in to manage their plan, projects, and site."
        legend={<EncodingLegend pills={[...PLAN_PILLS, ...STATUS_PILLS]} />}
        actions={
          <>
            <ActionButton href="/dashboard" variant="secondary">
              ← Overview
            </ActionButton>
            <ActionButton href="/ecommerce/invoices" variant="secondary">
              Subscriptions
            </ActionButton>
            <AddClinicModal partners={partners} />
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiStat label="Total Clinics" value={formatNumberShort(rows.length)} sub={`${newIn30d} new in 30d`} />
        <KpiStat label="Active Subscribers" value={formatNumberShort(activeCount)} sub="Paying or trialing" />
        <KpiStat
          label="Past Due"
          value={formatNumberShort(pastDueCount)}
          sub={pastDueCount > 0 ? 'Needs intervention' : 'All paid up'}
          tone={pastDueCount > 0 ? 'warn' : undefined}
        />
        <KpiStat label="Combined MRR" value={formatMoneyShort(mrrCents)} sub="From active clinics" />
      </div>

      <ClinicsList rows={rows} />
    </div>
  )
}
