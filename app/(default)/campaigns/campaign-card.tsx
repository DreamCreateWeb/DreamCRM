'use client'

import { useTransition } from 'react'
import Image from 'next/image'
import { CampaignProperties } from './campaigns-properties'
import { changeCampaignStatus, removeCampaign } from './actions'
import { CAMPAIGN_STATUSES, type CampaignStatus } from '@/lib/types/campaigns'
import { formatShortDate } from '@/lib/utils'

export interface CampaignCardData {
  id: number
  name: string
  description: string | null
  status: CampaignStatus
  startDate: string | null
  endDate: string | null
  budgetCents: number
  members: { name: string; image: string | null }[]
}

export default function CampaignCard({ campaign }: { campaign: CampaignCardData }) {
  const { typeColor, categoryIcon } = CampaignProperties()
  const [pending, startTransition] = useTransition()

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await changeCampaignStatus(campaign.id, status)
    })
  }
  function handleDelete() {
    if (!confirm(`Delete campaign "${campaign.name}"?`)) return
    startTransition(async () => {
      await removeCampaign(campaign.id)
    })
  }

  return (
    <div className="col-span-full sm:col-span-6 xl:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <div className="flex flex-col h-full p-5">
        <header>
          <div className="flex items-center justify-between">
            {categoryIcon(String((campaign.id % 3) + 1))}
            <div className="flex shrink-0 -space-x-3 -ml-px">
              {campaign.members.slice(0, 4).map((m, i) =>
                m.image ? (
                  <Image
                    key={i}
                    className="rounded-full border-2 border-white dark:border-gray-800 box-content"
                    src={m.image}
                    width={28}
                    height={28}
                    alt={m.name}
                    unoptimized
                  />
                ) : (
                  <span
                    key={i}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 bg-violet-200 text-violet-700 text-xs font-semibold"
                    title={m.name}
                  >
                    {m.name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                )
              )}
            </div>
          </div>
        </header>
        <div className="grow mt-2">
          <h2 className="text-xl leading-snug font-semibold text-gray-800 dark:text-gray-100 mb-1">
            {campaign.name}
          </h2>
          <div className="text-sm">{campaign.description ?? 'No description.'}</div>
        </div>
        <footer className="mt-5">
          <div className="text-sm font-medium text-gray-500 mb-2">
            {campaign.startDate ? formatShortDate(campaign.startDate) : '—'}
            <span className="text-gray-400 dark:text-gray-600"> -&gt; </span>
            {campaign.endDate ? formatShortDate(campaign.endDate) : '—'}
          </div>
          <div className="flex justify-between items-center">
            <select
              value={campaign.status}
              disabled={pending}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`text-xs inline-flex font-medium rounded-full text-center px-2.5 py-1 border-none ${typeColor(campaign.status)} disabled:opacity-60`}
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="text-sm font-medium text-red-500 hover:text-red-600 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
