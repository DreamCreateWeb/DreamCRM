import SettingsSidebar from '../settings-sidebar'
import NotificationsPanel from './notifications-panel'
import { requireUser } from '@/lib/session'
import { getNotificationPrefs } from '@/lib/services/settings'

export const metadata = {
  title: 'Notifications Settings - DreamCRM',
  description: 'Email and push preferences',
}

export const dynamic = 'force-dynamic'

export default async function NotificationsSettings() {
  const user = await requireUser()
  const prefs = await getNotificationPrefs(user.id)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Account Settings</h1>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar />
          <NotificationsPanel
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
