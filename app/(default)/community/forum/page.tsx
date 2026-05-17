import ForumLeftContent from './forum-left-content'
import ForumEntries from './forum-entries'
import ForumRightContent from './forum-right-content'
import NewThreadModal from './new-thread-modal'
import SortTabs from './sort-tabs'
import { requireUser } from '@/lib/session'
import { listThreads } from '@/lib/services/community'

export const metadata = {
  title: 'Forum - DreamCRM',
  description: 'Community discussion',
}

export const dynamic = 'force-dynamic'

export default async function Forum({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  await requireUser()
  const params = await searchParams
  const sort = (['popular', 'newest', 'following'].includes(params.sort ?? '') ? params.sort : 'newest') as
    | 'popular'
    | 'newest'
    | 'following'
  const threads = await listThreads(sort)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 md:py-0 w-full max-w-[96rem] mx-auto">
      <div className="xl:flex">
        <div className="md:flex flex-1">
          <ForumLeftContent />
          <div className="flex-1 md:ml-8 xl:mx-4 2xl:mx-8">
            <div className="md:py-8">
              <div className="flex items-center justify-between mb-4 gap-2">
                <SortTabs current={sort} />
                <div className="hidden md:block">
                  <NewThreadModal trigger="inline" />
                </div>
              </div>
              <div className="space-y-2">
                <ForumEntries
                  entries={threads.map((t) => ({
                    id: t.id,
                    title: t.title,
                    category: t.category,
                    views: t.views,
                    createdAt: t.createdAt,
                    authorName: t.authorName,
                    authorImage: t.authorImage,
                    replyCount: t.replyCount,
                  }))}
                />
              </div>
            </div>
          </div>
        </div>
        <ForumRightContent />
      </div>
    </div>
  )
}
