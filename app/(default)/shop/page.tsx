import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ComingSoon from '@/components/ui/coming-soon'

export const metadata = {
  title: 'Shop - DreamCRM',
}

export const dynamic = 'force-dynamic'

export default async function ShopPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  return (
    <ComingSoon
      title="Shop"
      phase="Phase 3 — the differentiator"
      oneLiner="Sell whitening kits, electric brushes, retainer cases, and clinic-branded merch through your own site. The move no orbital-layer competitor (Weave, NexHealth, Modento) currently ships."
      features={[
        'Product catalog with photos, variants, inventory tracking',
        'Stripe Connect: payouts land in your bank, not ours — full margin to the clinic',
        'Birthday-triggered coupon codes per patient (auto-generated, single-use)',
        'Loyalty tiers + post-visit upsell prompts in confirmation emails',
        'Membership plans (cash-pay alternatives to insurance — popular with cosmetic + boutique practices)',
        'Live on the public site at {your-clinic}.dreamcreatestudio.com/shop',
      ]}
      matching="No direct dental competitor yet — this is the wedge. Closest reference: Shopify + a coupon app, but built into the practice software."
      todayAlternative={{
        label: 'Manage Product Orders (placeholder pages)',
        href: '/ecommerce/orders',
      }}
    />
  )
}
