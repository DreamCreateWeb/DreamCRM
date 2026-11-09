export const metadata = {
  title: 'Holiday closures - DreamCRM',
  description: 'State a closure once — booking, your website, reminders and the morning digest all honour it',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { SettingsPage } from '../settings-kit'
import { getClosuresPageData } from './data'
import ClosuresPanel from './closures-panel'

export default async function ClosuresSettings() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')
  const data = await getClosuresPageData()
  return (
    <SettingsPage
      title="Holiday closures"
      subtitle="Say “closed Nov 26–27” once. Online booking, your website, patient reminders and the morning digest all know."
      panel={false}
    >
      <ClosuresPanel initial={data} />
    </SettingsPage>
  )
}
