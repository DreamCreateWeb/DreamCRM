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
  // Unreadable ≠ not connected (audit round 2): a failed read must not tell a
  // practice with a live Stripe account to connect it again.
  const [cfg, ready] = await Promise.all([
    getShopConfig(ctx.organizationId).catch(() => 'unreadable' as const),
    canTakeBalancePayments(ctx.organizationId).catch(() => 'unreadable' as const),
  ])
  const stripe =
    cfg === 'unreadable' || ready === 'unreadable'
      ? 'unreadable'
      : ready
        ? 'ready'
        : (cfg?.stripeAccountStatus ?? 'none') === 'none'
          ? 'none'
          : 'pending'
  return (
    <PaymentsIntroCard
      orgName={ctx.organizationName}
      canManage={ctx.role === 'owner' || ctx.role === 'admin'}
      stripe={stripe}
      connectConfigured={shopConnectConfigured()}
      isDemo={ctx.isDemo}
    />
  )
}
