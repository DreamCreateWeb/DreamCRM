import SettingsSidebar from '../settings-sidebar'
import AppsPanel from './apps-panel'
import { requireUser } from '@/lib/session'
import { listConnectedApps } from '@/lib/services/settings'

export const metadata = {
  title: 'Apps Settings - DreamCRM',
  description: 'Manage connected integrations',
}

export const dynamic = 'force-dynamic'

export default async function AppsSettings() {
  const user = await requireUser()
  const apps = await listConnectedApps(user.id)
  const connected = Object.fromEntries(apps.map((a) => [a.appKey, a.enabled])) as Record<string, boolean>

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Account Settings</h1>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar />
          <AppsPanel connected={connected} />
        </div>
      </div>
    </div>
  )
}
