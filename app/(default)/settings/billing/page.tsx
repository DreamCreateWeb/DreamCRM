import { redirect } from 'next/navigation'
import SettingsSidebar from '../settings-sidebar'
import BillingPanel from './billing-panel'
import { PageHeader } from '@/components/ui/page-header'
import { requireTenant } from '@/lib/auth/context'
import { getOrgSubscriptionSummary, listOrgStripeInvoices } from '@/lib/services/billing'

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
  const [summary, invoices] = await Promise.all([
    getOrgSubscriptionSummary(ctx.organizationId),
    listOrgStripeInvoices(ctx.organizationId, 12),
  ])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Settings" title="Billing" subtitle="Your subscription, payment, and past invoices." />
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
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
        </div>
      </div>
    </div>
  )
}
