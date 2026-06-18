export const metadata = {
  title: 'Reminder Settings - DreamCRM',
  description: 'Automatic appointment reminders',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getReminderSettings } from '@/lib/services/reminder-automation'
import SettingsSidebar from '../settings-sidebar'
import RemindersForm from './reminders-form'
import { PageHeader } from '@/components/ui/page-header'

export default async function ReminderSettingsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const settings = await getReminderSettings(ctx.organizationId)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Clinic settings"
        title="Reminders"
        subtitle="Automatic appointment reminders — keep your chairs full without lifting a finger."
      />

      <div className="v2-panel mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
          <div className="grow p-6 bg-gray-50 dark:bg-gray-900/20 rounded-r-xl">
            <div className="max-w-2xl">
              <RemindersForm initial={settings} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
