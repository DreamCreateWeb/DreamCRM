import SettingsSidebar from '../settings-sidebar'
import NotificationsPanel from './notifications-panel'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { getNotificationPrefs } from '@/lib/services/settings'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Notifications Settings - DreamCRM',
  description: 'Email and push preferences',
}

export const dynamic = 'force-dynamic'

export default async function NotificationsSettings() {
  const user = await requireUser()
  const ctx = await getTenantContext()
  const prefs = await getNotificationPrefs(user.id)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Settings" title="Notifications" subtitle="Email and push preferences." />
      <div className="v2-panel mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx?.tenantType} />
          <NotificationsPanel
            tenantType={
              ctx?.tenantType === 'platform' || ctx?.tenantType === 'patient'
                ? ctx.tenantType
                : 'clinic'
            }
            initial={{
              comments: prefs.comments,
              candidates: prefs.candidates,
              offers: prefs.offers,
              pushEverything: prefs.pushEverything,
              pushEmail: prefs.pushEmail,
              pushNothing: prefs.pushNothing,
            }}
          />
        </div>
      </div>
    </div>
  )
}
