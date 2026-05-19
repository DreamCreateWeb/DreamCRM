export const metadata = {
  title: 'Feedback Settings - DreamCRM',
  description: 'Send feedback and (for platform admins) read what others have sent',
}

import SettingsSidebar from '../settings-sidebar'
import FeedbackPanel from './feedback-panel'
import FeedbackAdmin from './feedback-admin'
import { getTenantContext } from '@/lib/auth/context'
import { listRecentFeedback } from '@/lib/services/settings'

export const dynamic = 'force-dynamic'

export default async function FeedbackSettings() {
  const ctx = await getTenantContext()
  const isPlatformAdmin =
    ctx?.tenantType === 'platform' && (ctx.role === 'owner' || ctx.role === 'admin')
  const recent = isPlatformAdmin ? await listRecentFeedback(50) : []

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Account Settings</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
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
