import { getTenantContext } from '@/lib/auth/context'
import { getShopConfig } from '@/lib/services/shop'
import { canTakeBalancePayments } from '@/lib/services/balance-payments'
import { shopConnectConfigured } from '@/lib/services/shop-connect'
import PaymentsIntroCard from './payments-intro-card'

/**
 * THE PAYMENTS DOOR (docs/ACTIVATION.md S5) — the intro OVER the existing
 * Stripe Connect. The one thing the money workspace cannot run without is
 * the practice's own Stripe account, so the card says where that stands
 * (connected · needs finishing in Stripe · not connected, with the real
 * connect link) and offers one button. Turning on without Stripe is
 * allowed — the hub's own connect card is the next step — the card just
 * says so.
 */
export default async function PaymentsIntro() {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') return null
  const [cfg, ready] = await Promise.all([
    getShopConfig(ctx.organizationId).catch(() => null),
    canTakeBalancePayments(ctx.organizationId).catch(() => false),
  ])
  const status = cfg?.stripeAccountStatus ?? 'none'
  return (
    <PaymentsIntroCard
      orgName={ctx.organizationName}
      canManage={ctx.role === 'owner' || ctx.role === 'admin'}
      stripe={ready ? 'ready' : status === 'none' ? 'none' : 'pending'}
      connectConfigured={shopConnectConfigured()}
      isDemo={ctx.isDemo}
    />
  )
}
