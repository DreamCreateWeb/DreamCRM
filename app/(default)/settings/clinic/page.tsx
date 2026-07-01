export const metadata = {
  title: 'Clinic Profile - DreamCRM',
  description: 'Edit your clinic name, contact details, and branding',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import { listLibraryForPicker } from '@/lib/services/service-library'
import { listClinicGmailAccounts } from '@/lib/services/clinic-sender'
import { getGbpSyncState } from '@/lib/services/gbp-sync'
import ClinicProfilePanel from './clinic-profile-panel'
import CustomDomainCard from './custom-domain-card'
import GbpSyncCard from './gbp-sync-card'
import CalendarFeedCard from './calendar-feed-card'
import ClinicSettingsNav, { type NavGroup } from './clinic-settings-nav'
import { SettingsPage } from '../settings-kit'
import { ActionButton } from '@/components/ui/action-button'
import type { CustomDomainStatus } from '@/lib/services/custom-domain'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

export default async function ClinicSettings() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  // Library available to this clinic's picker — every `active` entry plus
  // any `pending` entries this org submitted (1B own-pending visibility).
  const library = await listLibraryForPicker(ctx.organizationId)

  // Connected Google mailboxes the clinic can send patient email from (Tier 2).
  const gmailAccounts = await listClinicGmailAccounts(ctx.organizationId)

  // Google Business Profile sync state. GBP is free on every plan tier (Basic
  // included; see lib/types/social-entitlements.ts), so the "Sync from Google"
  // card loads for all clinics. The card itself renders a connect-prompt when no
  // GBP is linked, so it's safe to always load.
  const gbpState = await getGbpSyncState(ctx.organizationId)

  const siteUrl = profile?.websiteDomain
    ? `https://${profile.websiteDomain}`
    : `https://${ctx.organizationSlug}.${SITE_DOMAIN}`
  // The custom-domain card always shows the subdomain as the free fallback
  // address (not the custom domain, which may not be live yet).
  const subdomainUrl = `https://${ctx.organizationSlug}.${SITE_DOMAIN}`
  const customDomainStatus = (profile?.customDomainStatus as CustomDomainStatus | null) ?? null
  // Canonical app origin for the calendar-feed subscribe URL.
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || `https://www.${SITE_DOMAIN}`
  const canManageClinic = ctx.role === 'owner' || ctx.role === 'admin'

  // The section rail. Every section is listed at once (the fix for the old
  // 15-subtab maze); ids match the section anchors in the panel + the card
  // wrappers below. "Sync from Google" only appears when a GBP card renders.
  const navGroups: NavGroup[] = [
    {
      label: 'Your clinic',
      items: [
        { id: 'basics', label: 'Basics' },
        { id: 'contact', label: 'Contact & email' },
        { id: 'hours', label: 'Hours' },
      ],
    },
    {
      label: 'Website content',
      items: [
        { id: 'branding', label: 'Branding & media' },
        { id: 'services', label: 'Services' },
        { id: 'staff', label: 'Team' },
        { id: 'stats', label: 'Trust stats' },
        { id: 'photos', label: 'Office photos' },
      ],
    },
    {
      label: 'Insurance & payments',
      items: [
        { id: 'insurance', label: 'Insurance carriers' },
        { id: 'methods', label: 'Payment methods' },
        { id: 'financing', label: 'Financing' },
        { id: 'cancellation', label: 'Cancellation policy' },
      ],
    },
    {
      label: 'Connections & domain',
      items: [
        ...(gbpState ? [{ id: 'google-sync', label: 'Sync from Google' }] : []),
        { id: 'calendar-feed', label: 'Calendar feed' },
        { id: 'custom-domain', label: 'Custom domain' },
      ],
    },
  ]

  return (
    <>
      <SettingsPage
        title="Clinic profile"
        subtitle="Your clinic name, contact details, branding, and website content."
        actions={
          <ActionButton href={siteUrl} variant="secondary" target="_blank">
            Preview your website ↗
          </ActionButton>
        }
        panel={false}
      >
        <ClinicSettingsNav groups={navGroups} />
        <div className="v2-panel mb-8">
          <ClinicProfilePanel
            profile={profile ?? null}
            orgName={ctx.organizationName}
            orgId={ctx.organizationId}
            library={library}
            gmailAccounts={gmailAccounts}
          />
          {gbpState && (
            <div id="google-sync" className="scroll-mt-28">
              <GbpSyncCard state={gbpState} />
            </div>
          )}
          <div id="calendar-feed" className="scroll-mt-28">
            <CalendarFeedCard
              initialToken={profile?.calendarFeedToken ?? null}
              baseUrl={appBaseUrl}
              canManage={canManageClinic}
            />
          </div>
          <div
            id="custom-domain"
            className="scroll-mt-28 border-t border-gray-200 dark:border-gray-700/60"
          >
            <CustomDomainCard initialStatus={customDomainStatus} subdomainUrl={subdomainUrl} />
          </div>
        </div>
      </SettingsPage>
    </>
  )
}
