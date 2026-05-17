import SearchForm from '@/components/search-form'
import FilterButton from '@/components/dropdown-filter'
import PaginationNumeric from '@/components/pagination-numeric'
import CampaignCard, { type CampaignCardData } from './campaign-card'
import CreateCampaignModal from './create-campaign-modal'
import { requireUser } from '@/lib/session'
import { listCampaigns, getCampaignMembers } from '@/lib/services/campaigns'

export const metadata = {
  title: 'Campaigns - DreamCRM',
  description: 'Marketing campaigns',
}

export const dynamic = 'force-dynamic'

export default async function Campaigns({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireUser()
  const params = await searchParams
  const campaigns = await listCampaigns({ search: params.q })
  const members = await getCampaignMembers(campaigns.map((c) => c.id))
  const membersByCampaign = new Map<number, { name: string; image: string | null }[]>()
  for (const m of members) {
    const arr = membersByCampaign.get(m.campaignId) ?? []
    arr.push({ name: m.name, image: m.image })
    membersByCampaign.set(m.campaignId, arr)
  }

  const cards: CampaignCardData[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    budgetCents: c.budgetCents,
    members: membersByCampaign.get(c.id) ?? [],
  }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Campaigns</h1>
        </div>
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <SearchForm />
          <FilterButton align="right" />
          <CreateCampaignModal />
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No campaigns yet. Click <strong>Create Campaign</strong> to get started.
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {cards.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}

      <div className="mt-8">
        <PaginationNumeric />
      </div>
    </div>
  )
}
