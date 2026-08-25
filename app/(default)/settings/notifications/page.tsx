import NotificationsPanel from './notifications-panel'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { getNotificationPrefs } from '@/lib/services/settings'
import { SettingsPage } from '../settings-kit'

export const metadata = {
  title: 'Notifications Settings - DreamCRM',
  description: 'Email and push preferences',
}

export const dynamic = 'force-dynamic'

export default async function NotificationsSettings() {
  const user = await requireUser()
  const ctx = await getTenantContext()
  const prefs = await getNotificationPrefs(user.id)
  // The recurring report emails (morning digest + Monday week-in-review) are
  // per-staff mutable, and their footer points at THIS page — so this page
  // carries the mute (Phase-2 self-sweep). Clinic staff only.
  let emailReportsOptedOut: boolean | null = null
  if (ctx?.tenantType === 'clinic' && ctx.organizationId) {
    const { getDigestOptOut } = await import('@/lib/services/staff-notification-pref')
    emailReportsOptedOut = await getDigestOptOut(ctx.organizationId, user.id).catch(() => false)
  }

  return (
    <>
      <SettingsPage title="Notifications" subtitle="Email and push preferences.">
        <NotificationsPanel
          tenantType={
            ctx?.tenantType === 'platform' || ctx?.tenantType === 'patient'
              ? ctx.tenantType
              : 'clinic'
          }
          initial={{
            comments: prefs.comments,
            candidates: prefs.candidates,
            // `offers` is deliberately NOT passed: no dispatch site has ever
            // sent to that bucket, so its toggle row was cut (2026-08-25
            // overhaul). The column stays; `saveNotificationPrefs` treats
            // absent fields as "leave stored value alone".
            emailMode:
              prefs.emailMode === 'all' || prefs.emailMode === 'none' ? prefs.emailMode : 'urgent',
            pushNothing: prefs.pushNothing,
          }}
          emailReportsOptedOut={emailReportsOptedOut}
        />
      </SettingsPage>
    </>
  )
}
