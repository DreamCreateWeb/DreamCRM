export const metadata = {
  title: 'Automated emails - DreamCRM',
  description: 'Edit the emails your patients receive automatically',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getEmailAutomations } from '@/lib/services/email-automations'
import { getReminderSettings } from '@/lib/services/reminder-automation'
import { PageHeader } from '@/components/ui/page-header'
import EmailsHub from './emails-hub'

export default async function AutomatedEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const [config, reminder, sp] = await Promise.all([
    getEmailAutomations(ctx.organizationId),
    getReminderSettings(ctx.organizationId),
    searchParams,
  ])
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  return (
    <>
      <PageHeader
        eyebrow="Clinic settings"
        title="Automated emails"
        subtitle="These are the emails your patients get automatically — confirmations, reminders, and more. Turn any of them on or off, and edit the wording so it sounds like you. The dates, buttons, and links are filled in and sent for you."
      />

      <div className="mb-8">
        <EmailsHub config={config} reminder={reminder} canManage={canManage} focusKey={sp?.email ?? null} />
      </div>
    </>
  )
}
