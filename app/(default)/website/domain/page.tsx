import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireTenant } from '@/lib/auth/context'
import { getCustomDomainStatus } from '@/lib/services/custom-domain'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import CustomDomainCard from './custom-domain-card'

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
  // The card always shows the subdomain as the free fallback address (not the
  // custom domain, which may not be live yet).
  const subdomainUrl = `https://${ctx.organizationSlug}.${SITE_DOMAIN}`

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-4xl mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/website" className="hover:underline underline-offset-4">
            ‹ Website
          </Link>
        }
        title="Domain"
        subtitle="Your site works at its free address from day one — connecting your own domain takes two DNS records."
        actions={
          <ActionButton variant="secondary" size="sm" href={subdomainUrl} target="_blank">
            View live ↗
          </ActionButton>
        }
      />
      <div className="v2-panel">
        <CustomDomainCard initialStatus={status} subdomainUrl={subdomainUrl} />
      </div>
    </div>
  )
}
