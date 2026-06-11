import SettingsSidebar from '../settings-sidebar'
import AccountPanel from './account-panel'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Account Settings - DreamCRM',
  description: 'Manage your profile and credentials',
}

export const dynamic = 'force-dynamic'

export default async function AccountSettings() {
  const user = await requireUser()
  const ctx = await getTenantContext()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Settings" title="Account" subtitle="Your profile, sign-in email, and credentials." />

      <div className="v2-panel mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx?.tenantType} />
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
