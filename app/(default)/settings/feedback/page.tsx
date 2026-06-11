export const metadata = {
  title: 'Feedback Settings - DreamCRM',
  description: 'Send feedback and (for platform admins) read what others have sent',
}

import SettingsSidebar from '../settings-sidebar'
import FeedbackPanel from './feedback-panel'
import FeedbackAdmin from './feedback-admin'
import { getTenantContext } from '@/lib/auth/context'
import { listRecentFeedback } from '@/lib/services/settings'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

export default async function FeedbackSettings() {
  const ctx = await getTenantContext()
  const isPlatformAdmin =
    ctx?.tenantType === 'platform' && (ctx.role === 'owner' || ctx.role === 'admin')
  const recent = isPlatformAdmin ? await listRecentFeedback(50) : []

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Settings" title="Send feedback" subtitle="Tell us what's working and what's not." />

      <div className="v2-panel mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx?.tenantType} />
          <div className="grow">
            <FeedbackPanel />
            {isPlatformAdmin && (
              <FeedbackAdmin
                entries={recent.map((r) => ({
                  id: r.id,
                  category: r.category,
                  rating: r.rating,
                  message: r.message,
                  createdAt: r.createdAt.toISOString(),
                  submitterName: r.submitterName,
                  submitterEmail: r.submitterEmail,
                  organizationName: r.organizationName,
                  organizationType: r.organizationType,
                }))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
