import Link from 'next/link'
import Image from 'next/image'
import EditMenu from '@/components/edit-menu'

export interface TileUser {
  id: string
  name: string
  email: string
  image: string | null
  location: string | null
  bio: string
}

export default function TileCard({ user }: { user: TileUser }) {
  return (
    <div className="col-span-full sm:col-span-6 xl:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <div className="flex flex-col h-full">
        <div className="grow p-5">
          <div className="flex justify-between items-start">
            <header>
              <div className="flex mb-2">
                <div className="relative inline-flex items-start mr-5">
                  {user.image ? (
                    <Image className="rounded-full" src={user.image} width={64} height={64} alt={user.name} unoptimized />
                  ) : (
                    <div className="rounded-full bg-violet-200 dark:bg-violet-500/30 w-16 h-16 flex items-center justify-center text-2xl font-bold text-violet-700 dark:text-violet-200">
                      {user.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>
                <div className="mt-1 pr-1">
                  <h2 className="text-xl leading-snug font-semibold text-gray-800 dark:text-gray-100">{user.name}</h2>
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    {user.location || '—'}
                  </div>
                </div>
              </div>
            </header>
            <EditMenu align="right" className="shrink-0" />
          </div>
          <div className="mt-2">
            <div className="text-sm">{user.bio}</div>
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700/60">
          <div className="flex divide-x divide-gray-100 dark:divide-gray-700/60">
            <Link className="block flex-1 text-center text-sm text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 font-medium px-3 py-4" href={`mailto:${user.email}`}>
              <div className="flex items-center justify-center">
                <svg className="fill-current shrink-0 mr-2" width="16" height="16" viewBox="0 0 16 16">
                  <path d="M8 0C3.6 0 0 3.1 0 7s3.6 7 8 7h.6l5.4 2v-4.4c1.2-1.2 2-2.8 2-4.6 0-3.9-3.6-7-8-7z" />
                </svg>
                <span>Send Email</span>
              </div>
            </Link>
            <Link
              className="block flex-1 text-center text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-200 font-medium px-3 py-4 group"
              href={`/community/profile?id=${user.id}`}
            >
              <div className="flex items-center justify-center">
                <span>View Profile</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
