import SettingsSidebar from '../settings-sidebar'
import AccountPanel from './account-panel'
import { requireUser } from '@/lib/session'

export const metadata = {
  title: 'Account Settings - DreamCRM',
  description: 'Manage your profile and credentials',
}

export const dynamic = 'force-dynamic'

export default async function AccountSettings() {
  const user = await requireUser()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Account Settings</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar />
          <AccountPanel
            initialUser={{
              id: user.id,
              name: user.name ?? '',
              email: user.email ?? '',
              image: user.image ?? null,
              companyName: (user as any).companyName ?? null,
              city: (user as any).city ?? null,
              postalCode: (user as any).postalCode ?? null,
              streetAddress: (user as any).streetAddress ?? null,
              country: (user as any).country ?? null,
            }}
          />
        </div>
      </div>
    </div>
  )
}
