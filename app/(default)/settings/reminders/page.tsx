export const metadata = {
  title: 'Reminder Settings - DreamCRM',
  description: 'Automatic appointment reminders',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getReminderSettings } from '@/lib/services/reminder-automation'
import RemindersForm from './reminders-form'
import { PageHeader } from '@/components/ui/page-header'

export default async function ReminderSettingsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const settings = await getReminderSettings(ctx.organizationId)

  return (
    <>
      <PageHeader
        eyebrow="Clinic settings"
        title="Reminders"
        subtitle="Automatic appointment reminders — keep your chairs full without lifting a finger."
      />

      <div className="v2-panel mb-8 p-6">
        <div className="max-w-2xl">
          <RemindersForm initial={settings} />
        </div>
      </div>
    </>
  )
}
