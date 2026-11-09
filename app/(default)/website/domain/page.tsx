import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getCustomDomainStatus } from '@/lib/services/custom-domain'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { CLINIC_DEFAULT_TZ } from '@/lib/clinic-timezone'
import { isDomainBuyingAvailable, listDomainPurchases } from '@/lib/services/domain-purchase'
import { isLivePurchasesEnabled } from '@/lib/name-com'
import { PageFrame } from '@/components/ui/page-frame'
import { ActionButton } from '@/components/ui/action-button'
import CustomDomainCard from './custom-domain-card'
import BuyDomainCard from './buy-domain-card'
import EmailDomainCard from './email-domain-card'
import { getEmailDomainState } from '@/lib/services/email-domain'
import { emailDomainFor } from '@/lib/email-identity'

export const metadata = {
  title: 'Domain - DreamCRM',
  description: 'Put your website on your own domain.',
}

export const dynamic = 'force-dynamic'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

/**
 * The Domain page — a first-class stop in the Website workspace (it used to
 * hide behind an anchor on the clinic-settings form). Hosts the same
 * auto-polling connect card: enter a domain → copy the two DNS records →
 * the card watches App Runner and flips itself to Active.
 */
export default async function WebsiteDomainPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')
  // Domain changes are owner/admin-only (the actions enforce it too).
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/website')

  const status = await getCustomDomainStatus(ctx.organizationId).catch(() => null)
  // "Checked <time>" renders at the practice's wall-clock (the server runs in
  // UTC; the card is a client component, so the zone travels as a prop).
  const timeZone = await getClinicTimeZone(ctx.organizationId).catch(() => CLINIC_DEFAULT_TZ)
  // Tier 3 (ML-63): the email card only exists once the site is live on its own domain.
  const emailSiteDomain = status?.state === 'active' ? emailDomainFor(status.domain) : null
  const emailState = emailSiteDomain ? await getEmailDomainState(ctx.organizationId).catch(() => null) : null
  // The card always shows the subdomain as the free fallback address (not the
  // custom domain, which may not be live yet).
  const subdomainUrl = `https://${ctx.organizationSlug}.${SITE_DOMAIN}`

  // Buy-a-domain ships DARK: the section only renders once the NAMECOM_*
  // secrets exist (and never for the demo org — real money adjacency).
  const buyingAvailable = isDomainBuyingAvailable() && !ctx.isDemo
  const purchases = buyingAvailable ? await listDomainPurchases(ctx.organizationId).catch(() => []) : []

  return (
    <PageFrame width="4xl"
        hub={{ href: '/website', label: 'Website' }}
        title="Domain"
        subtitle={
          buyingAvailable
            ? 'Your site works at its free address from day one — buy a domain right here, or connect one you already own.'
            : 'Your site works at its free address from day one — connecting your own domain takes two DNS records.'
        }
        actions={
          <ActionButton variant="secondary" size="sm" href={subdomainUrl} target="_blank">
            View live ↗
          </ActionButton>
        }
    >
      <div className="v2-panel">
        <CustomDomainCard initialStatus={status} subdomainUrl={subdomainUrl} timeZone={timeZone} />
        <EmailDomainCard initialState={emailState} siteDomain={emailSiteDomain} timeZone={timeZone} />
      </div>
      {buyingAvailable && <BuyDomainCard purchases={purchases} dryRunMode={!isLivePurchasesEnabled()} />}
    </PageFrame>
  )
}
