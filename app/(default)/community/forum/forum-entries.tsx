import Link from 'next/link'
import Image from 'next/image'
import { relativeTime } from '@/lib/utils'

interface ForumEntry {
  id: number
  title: string
  category: string
  views: number
  createdAt: Date
  authorName: string | null
  authorImage: string | null
  replyCount: number
}

function Avatar({ name, image, size = 32 }: { name: string | null; image: string | null; size?: number }) {
  if (image) {
    return <Image className="rounded-full" src={image} width={size} height={size} alt={name ?? 'User'} unoptimized />
  }
  return (
    <div
      className="rounded-full bg-violet-200 dark:bg-violet-500/30 flex items-center justify-center text-xs font-semibold text-violet-700 dark:text-violet-200"
      style={{ width: size, height: size }}
    >
      {(name?.[0] ?? '?').toUpperCase()}
    </div>
  )
}

export default function ForumEntries({ entries }: { entries: ForumEntry[] }) {
  if (entries.length === 0) {
    return (
      <article className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5 text-sm text-gray-500 dark:text-gray-400">
        No threads yet — start the conversation!
      </article>
    )
  }
  return (
    <>
      {entries.map((entry) => (
        <article key={entry.id} className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <div className="flex flex-start space-x-4">
            <div className="shrink-0 mt-1.5">
              <Avatar name={entry.authorName} image={entry.authorImage} />
            </div>
            <div className="grow">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">
                <Link href={`/community/forum/post?id=${entry.id}`}>{entry.title}</Link>
              </h2>
              <footer className="flex flex-wrap text-sm">
                <div className="flex items-center after:block after:content-['·'] last:after:content-[''] after:text-sm after:text-gray-400 dark:after:text-gray-600 after:px-2">
                  <span className="font-medium text-violet-500">{entry.authorName ?? 'Anonymous'}</span>
                </div>
                <div className="flex items-center after:block after:content-['·'] last:after:content-[''] after:text-sm after:text-gray-400 dark:after:text-gray-600 after:px-2">
                  <span className="text-gray-500 dark:text-gray-400">{entry.replyCount} replies</span>
                </div>
                <div className="flex items-center after:block after:content-['·'] last:after:content-[''] after:text-sm after:text-gray-400 dark:after:text-gray-600 after:px-2">
                  <span className="text-gray-500 dark:text-gray-400">{entry.views} views</span>
                </div>
                <div className="flex items-center">
                  <span className="text-gray-500 dark:text-gray-400">{relativeTime(entry.createdAt)}</span>
                </div>
              </footer>
            </div>
          </div>
        </article>
      ))}
    </>
  )
}
