import { redirect } from 'next/navigation'
import SettingsSidebar from '../settings-sidebar'
import BillingPanel from './billing-panel'
import { PageHeader } from '@/components/ui/page-header'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { getBilling } from '@/lib/services/settings'
import { db, schema } from '@/lib/db'
import { and, eq } from 'drizzle-orm'

export const metadata = {
  title: 'Billing Settings - DreamCRM',
  description: 'Subscription, payment method and past invoices',
}

export const dynamic = 'force-dynamic'

export default async function BillingSettings() {
  const user = await requireUser()
  const ctx = await getTenantContext()
  if (ctx && ctx.tenantType !== 'clinic') redirect('/settings/account')
  const billing = await getBilling(user.id)
  const paid = await db
    .select({
      id: schema.invoices.id,
      invoiceNumber: schema.invoices.invoiceNumber,
      totalCents: schema.invoices.totalCents,
      currency: schema.invoices.currency,
      paidAt: schema.invoices.paidAt,
    })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.status, 'paid')))
    .limit(20)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Settings" title="Billing" subtitle="Subscription, payment method, and past invoices." />
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx?.tenantType} />
          <BillingPanel
            initial={{
              plan: (billing?.plan ?? 'free') as 'free' | 'pro' | 'team' | 'enterprise',
              cardLast4: billing?.cardLast4 ?? null,
              cardBrand: billing?.cardBrand ?? null,
              cardExpMonth: billing?.cardExpMonth ?? null,
              cardExpYear: billing?.cardExpYear ?? null,
              billingEmail: billing?.billingEmail ?? null,
              billingAddress: billing?.billingAddress ?? null,
              renewsAt: billing?.renewsAt ? billing.renewsAt.toISOString() : null,
              hasStripeCustomer: !!billing?.stripeCustomerId,
            }}
            pastInvoices={paid.map((p) => ({
              id: p.id,
              year: p.paidAt ? new Date(p.paidAt).getFullYear() : new Date().getFullYear(),
              invoiceNumber: p.invoiceNumber,
              totalCents: p.totalCents,
              currency: p.currency,
            }))}
          />
        </div>
      </div>
    </div>
  )
}
