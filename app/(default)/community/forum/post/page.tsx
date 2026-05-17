import { notFound } from 'next/navigation'
import ForumLeftContent from '../forum-left-content'
import ForumEntry from './forum-entry'
import ForumPostRightContent from './forum-post-right-content'
import { requireUser } from '@/lib/session'
import { getThread, listThreads } from '@/lib/services/community'

export const metadata = {
  title: 'Forum Post - DreamCRM',
  description: 'Thread detail',
}

export const dynamic = 'force-dynamic'

export default async function ForumPost({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireUser()
  const params = await searchParams
  let id = params.id ? Number(params.id) : NaN
  if (Number.isNaN(id)) {
    const latest = await listThreads('newest')
    if (latest.length === 0) notFound()
    id = latest[0].id
  }
  const data = await getThread(id)
  if (!data) notFound()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 md:py-0 w-full max-w-[96rem] mx-auto">
      <div className="xl:flex">
        <div className="md:flex flex-1">
          <ForumLeftContent />
          <div className="flex-1 md:ml-8 xl:mx-4 2xl:mx-8">
            <div className="md:py-8">
              <ForumEntry thread={data.thread} replies={data.replies} />
            </div>
          </div>
        </div>
        <ForumPostRightContent />
      </div>
    </div>
  )
}
