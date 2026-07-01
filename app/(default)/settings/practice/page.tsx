export const metadata = {
  title: 'Practice settings - DreamCRM',
  description: 'Providers, visit types, chairs, and recall cadence',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { SettingsPage } from '../settings-kit'
import { getPracticeSettings } from './actions'
import PracticePanel from './practice-panel'

export default async function PracticeSettings() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')
  // Any clinic staff can VIEW practice setup (it's a clinic-wide surface);
  // mutations stay owner/admin-gated in the actions. The panel shows a
  // read-only notice + disables controls for non-editors (data.canEdit).

  const data = await getPracticeSettings()

  return (
    <>
      <SettingsPage
        title="Practice setup"
        subtitle="Your providers, visit types, chairs, and recall cadence — the settings that drive booking + recall."
      >
        <PracticePanel initial={data} />
      </SettingsPage>
    </>
  )
}
