import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import SettingsSidebar from '../settings-sidebar'
import BillingPanel from './billing-panel'
import SocialConnectionsCard from './social-connections-card'
import { PageHeader } from '@/components/ui/page-header'
import { requireTenant } from '@/lib/auth/context'
import { getOrgSubscriptionSummary, listOrgStripeInvoices } from '@/lib/services/billing'
import { db, schema } from '@/lib/db'
import { getPlanById, socialAddonConfigured } from '@/lib/stripe-config'
import {
  socialAddonAvailable,
  socialAddonPriceCents,
  socialConnectionLimit,
} from '@/lib/types/social-entitlements'
import type { PlanTier } from '@/lib/modules/types'

export const metadata = {
  title: 'Billing Settings - DreamCRM',
  description: 'Subscription, payment method and past invoices',
}

export const dynamic = 'force-dynamic'

export default async function BillingSettings() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/settings/account')

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
  const managedBilling = !profileRow?.stripeSubscriptionId

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Clinic settings" title="Billing" subtitle="Your subscription, payment, and past invoices." />
      <div className="v2-panel mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
          <div className="grow">
            <BillingPanel
              planTier={ctx.planTier}
              subscriptionStatus={ctx.subscriptionStatus ?? summary?.status ?? null}
              interval={summary?.interval ?? null}
              renewsAt={summary?.currentPeriodEnd ? summary.currentPeriodEnd.toISOString() : null}
              cancelAtPeriodEnd={summary?.cancelAtPeriodEnd ?? false}
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
                managedBilling={managedBilling}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
