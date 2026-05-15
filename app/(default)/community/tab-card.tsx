import Link from 'next/link'
import Image from 'next/image'
import EditMenu from '@/components/edit-menu'

export interface TabUser {
  id: string
  name: string
  email: string
  image: string | null
  location: string | null
  bio: string
}

export default function TabCard({ user }: { user: TabUser }) {
  return (
    <div className="col-span-full sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <div className="flex flex-col h-full">
        <div className="grow p-5">
          <div className="relative">
            <div className="absolute top-0 right-0">
              <EditMenu align="right" />
            </div>
          </div>
          <header>
            <div className="flex justify-center mb-2">
              {user.image ? (
                <Image className="rounded-full" src={user.image} width={64} height={64} alt={user.name} unoptimized />
              ) : (
                <div className="rounded-full bg-violet-200 dark:bg-violet-500/30 w-16 h-16 flex items-center justify-center text-2xl font-bold text-violet-700 dark:text-violet-200">
                  {(user.name?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
            <div className="text-center">
              <h2 className="text-xl leading-snug font-semibold text-gray-800 dark:text-gray-100">{user.name}</h2>
            </div>
            <div className="flex justify-center items-center text-sm text-gray-500 dark:text-gray-400">
              {user.location || '—'}
            </div>
          </header>
          <div className="text-center mt-2">
            <div className="text-sm">{user.bio}</div>
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700/60">
          <Link
            className="block text-center text-sm text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 font-medium px-3 py-4"
            href={`mailto:${user.email}`}
          >
            <div className="flex items-center justify-center">
              <svg className="fill-current shrink-0 mr-2" width="16" height="16" viewBox="0 0 16 16">
                <path d="M8 0C3.6 0 0 3.1 0 7s3.6 7 8 7h.6l5.4 2v-4.4c1.2-1.2 2-2.8 2-4.6 0-3.9-3.6-7-8-7z" />
              </svg>
              <span>Send Email</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
