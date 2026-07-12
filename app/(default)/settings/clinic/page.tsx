export const metadata = {
  title: 'Business Profile - DreamCRM',
  description: 'Your clinic name, contact details, hours, and logo',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import { listClinicGmailAccounts } from '@/lib/services/clinic-sender'
import { getGbpSyncState } from '@/lib/services/gbp-sync'
import ClinicProfilePanel from './clinic-profile-panel'
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
  const customDomainStatus = (profile?.customDomainStatus as CustomDomainStatus | null) ?? null
  // Canonical app origin for the calendar-feed subscribe URL.
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || `https://www.${SITE_DOMAIN}`
  const canManageClinic = ctx.role === 'owner' || ctx.role === 'admin'

  // The section rail. Every section is listed at once (the fix for the old
  // 15-subtab maze); ids match the section anchors in the panel + the card
  // wrappers below. "Sync from Google" only appears when a GBP card renders.
  const navGroups: NavGroup[] = [
    {
      label: 'Your business',
      items: [
        { id: 'basics', label: 'Basics' },
        { id: 'contact', label: 'Contact & email' },
        { id: 'hours', label: 'Hours' },
        { id: 'logo', label: 'Logo' },
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
        title="Business profile"
        subtitle="Your clinic name, contact details, hours, and logo — the identity every module shares."
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
          {/* The domain manager moved to the Website workspace — this stub
              keeps the old #custom-domain deep links landing somewhere honest. */}
          <div
            id="custom-domain"
            className="scroll-mt-28 border-t border-gray-200 dark:border-gray-700/60"
          >
            <div className="p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Custom domain</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Your domain now lives in the Website workspace
                  {customDomainStatus ? <> — currently <strong>{customDomainStatus.domain}</strong></> : null}.
                </p>
              </div>
              <ActionButton variant="secondary" size="sm" href="/website/domain">
                Manage your domain →
              </ActionButton>
            </div>
          </div>
        </div>
      </SettingsPage>
    </>
  )
}
