import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import SubscriptionPanel from './subscription-panel'
import SocialConnectionsCard from './social-connections-card'
import { SettingsPage } from '../settings-kit'
import { requireTenant } from '@/lib/auth/context'
import { getModuleLabel } from '@/lib/modules'
import { getOrgSubscriptionSummary, listOrgStripeInvoices, syncCheckoutSuccess } from '@/lib/services/billing'
import { db, schema } from '@/lib/db'
import { getPlanById, socialAddonConfigured } from '@/lib/stripe-config'
import {
  socialAddonAvailable,
  socialAddonPriceCents,
  socialConnectionLimit,
} from '@/lib/types/social-entitlements'
import type { PlanTier } from '@/lib/modules/types'

export const metadata = {
  title: 'Plan & billing - DreamCRM',
  description: 'Your subscription, plan, payment method, and past invoices',
}

export const dynamic = 'force-dynamic'

export default async function BillingSettings({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string; interval?: string; checkout?: string; session_id?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/settings/account')

  // `?upgrade=<module>` arrives via requirePlan's redirect (now folded into this
  // page) — show the "{module} is on a higher plan" banner above the grid.
  // `?interval=annual|monthly` persists the plan-grid billing-period toggle
  // across reloads (the panel writes it back on change).
  const { upgrade, interval: intervalParam, checkout, session_id: sessionId } = await searchParams

  // Checkout return: sync the new subscription NOW (org-verified) so activation
  // doesn't hinge on webhook timing — an expired-trial owner would otherwise
  // bounce straight back into the trial-ended wall after paying. Then redirect
  // to a clean URL so the whole request (tenant context, wall, sidebar) is
  // re-resolved against the freshly-synced state and a refresh can't re-sync.
  if (checkout === 'success' && sessionId) {
    await syncCheckoutSuccess(ctx.organizationId, sessionId)
    redirect('/settings/billing?checkout=success')
  }

  // Subscription truth lives org-scoped on clinic_profile (written by the Stripe
  // webhook) + the live subscription. Invoices come from Stripe scoped to THIS
  // org's customer — the old `invoices` table read had no org filter (a tenant
  // could see every clinic's rows); it's gone.
  const [summary, invoices, profileRow] = await Promise.all([
    getOrgSubscriptionSummary(ctx.organizationId),
    listOrgStripeInvoices(ctx.organizationId, 12),
    db
      .select({
        socialAddon: schema.clinicProfile.socialAddon,
        stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
        billingMode: schema.clinicProfile.billingMode,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ])

  // Social-connection entitlement props for the card.
  const planTier = ctx.planTier as PlanTier
  const addonActive = profileRow?.socialAddon === 1
  const socialLimit = socialConnectionLimit(planTier, addonActive)
  const addonRaisesTo = socialConnectionLimit(planTier, true)
  const addonCents = socialAddonPriceCents(planTier)
  // Comped/managed clinics have a granted tier but no Stripe subscription.
  // hasSubscription drives the panel's trial-vs-subscribed layout (no sub yet
  // = plan grid); trulyManaged drives the social card's "contact us" copy —
  // a self-serve TRIAL clinic has no sub either but is NOT managed billing.
  const managedBilling = !profileRow?.stripeSubscriptionId
  const trulyManaged =
    profileRow?.billingMode === 'managed' || profileRow?.billingMode === 'comped'

  return (
    <>
      <SettingsPage
        title="Plan & billing"
        subtitle="What you have, what it costs, when it renews — change your plan and see past invoices."
      >
          {checkout === 'success' && (
            <p className="mb-4 rounded-[var(--r-md)] bg-emerald-500/15 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
              You’re all set — thanks! Your plan is active. If anything below still shows the old
              plan, give it a few seconds and refresh.
            </p>
          )}
          {checkout === 'cancelled' && (
            <p className="mb-4 rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
              No changes made — checkout was cancelled. Pick a plan whenever you’re ready.
            </p>
          )}
          <SubscriptionPanel
            planTier={ctx.planTier}
            subscriptionStatus={ctx.subscriptionStatus ?? summary?.status ?? null}
            interval={summary?.interval ?? null}
            initialInterval={intervalParam === 'annual' || intervalParam === 'monthly' ? intervalParam : null}
            renewsAt={summary?.currentPeriodEnd ? summary.currentPeriodEnd.toISOString() : null}
            cancelAtPeriodEnd={summary?.cancelAtPeriodEnd ?? false}
            card={summary?.card ?? null}
            nextChargeCents={summary?.nextChargeCents ?? null}
            nextChargeCurrency={summary?.nextChargeCurrency ?? null}
            hasSubscription={!managedBilling}
            onTrial={ctx.onTrial ?? false}
            trialEndsAt={ctx.trialEndsAt ? ctx.trialEndsAt.toISOString() : null}
            upgradeModuleLabel={upgrade ? getModuleLabel('clinic', upgrade) ?? null : null}
            invoices={invoices.map((inv) => ({
              id: inv.id,
              number: inv.number,
              amountPaidCents: inv.amountPaidCents,
              currency: inv.currency,
              status: inv.status,
              createdAt: inv.createdAt.toISOString(),
              hostedInvoiceUrl: inv.hostedInvoiceUrl,
            }))}
          />
          <div className="px-6 pb-6">
            <SocialConnectionsCard
              planName={getPlanById(planTier)?.name ?? planTier}
              socialLimit={socialLimit}
              addonActive={addonActive}
              addonAvailable={socialAddonAvailable(planTier)}
              addonPriceDollars={addonCents != null ? Math.round(addonCents / 100) : null}
              addonRaisesTo={addonRaisesTo}
              addonConfigured={socialAddonConfigured()}
              managedBilling={trulyManaged}
            />
          </div>
      </SettingsPage>
    </>
  )
}
