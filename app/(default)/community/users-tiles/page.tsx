import SearchForm from '@/components/search-form'
import TileCard, { type TileUser } from '../tile-card'
import PaginationNumeric from '@/components/pagination-numeric'
import { requireUser } from '@/lib/session'
import { listCommunityUsers } from '@/lib/services/community'

export const metadata = {
  title: 'Users - DreamCRM',
  description: 'Member directory',
}

export const dynamic = 'force-dynamic'

export default async function UsersTiles() {
  await requireUser()
  const users = await listCommunityUsers()
  const tiles: TileUser[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    location: [u.city, u.country].filter(Boolean).join(', ') || null,
    bio: u.companyName ? `${u.role} at ${u.companyName}` : u.role,
  }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Members</h1>
        </div>
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <SearchForm />
        </div>
      </div>

      {tiles.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No members yet.
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {tiles.map((u) => (
            <TileCard key={u.id} user={u} />
          ))}
        </div>
      )}

      <div className="mt-8">
        <PaginationNumeric />
      </div>
    </div>
  )
}
