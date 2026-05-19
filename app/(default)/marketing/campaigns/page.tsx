import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { marketingTerminology } from '@/lib/marketing/terminology'
import { listMarketingCampaigns } from '@/lib/services/marketing-campaigns'
import { formatRelativeDate } from '@/lib/utils/format'
import NewCampaignButton from './new-campaign-button'

export const metadata = {
  title: 'Campaigns - DreamCRM',
  description: 'Marketing campaigns',
}

export const dynamic = 'force-dynamic'

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  scheduled: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  active: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  paused: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
}

export default async function CampaignsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  const t = marketingTerminology(ctx.tenantType)

  const campaigns = await listMarketingCampaigns(ctx.organizationId)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-4">
        <div className="mb-3 sm:mb-0">
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Campaigns
          </h1>
          <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">
            Email campaigns you've drafted, scheduled, or sent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/marketing/audiences"
            className="text-[12px] font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            Audiences →
          </Link>
          <NewCampaignButton campaignTypes={t.campaignTypes} />
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-10 text-center">
          <p className="text-sm text-stone-400 dark:text-stone-500 italic">
            No campaigns yet. Create one to start writing your first email.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/80 dark:bg-stone-900/80 border-b border-stone-200 dark:border-stone-700/60">
              <tr className="text-left text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-stone-100 dark:border-stone-700/40 last:border-b-0 hover:bg-stone-50/60 dark:hover:bg-stone-800/30"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/marketing/campaigns/${c.id}`}
                      className="font-medium text-stone-800 dark:text-stone-100 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-stone-500 dark:text-stone-400 max-w-[24rem] truncate">
                    {c.subject || <span className="italic text-stone-300 dark:text-stone-600">no subject</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        STATUS_PILL[c.status] ?? STATUS_PILL.draft
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-stone-500 dark:text-stone-400 capitalize">
                    {c.sendChannel}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-stone-500 dark:text-stone-400 tabular-nums">
                    {c.sentAt ? formatRelativeDate(c.sentAt) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">
                    {formatRelativeDate(c.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
