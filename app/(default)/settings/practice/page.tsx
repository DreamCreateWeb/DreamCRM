export const metadata = {
  title: 'Practice settings - DreamCRM',
  description: 'Providers, visit types, chairs, and recall cadence',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import SettingsSidebar from '../settings-sidebar'
import { PageHeader } from '@/components/ui/page-header'
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
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Clinic settings"
        title="Practice setup"
        subtitle="Your providers, visit types, chairs, and recall cadence — the settings that drive booking + recall."
      />
      <div className="v2-panel mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
          <PracticePanel initial={data} />
        </div>
      </div>
    </div>
  )
}
