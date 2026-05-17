import FeedLeftContent from './feed-left-content'
import FeedPosts, { type FeedPostItem } from './feed-posts'
import FeedRightContent from './feed-right-content'
import FeedComposer from './feed-composer'
import { requireUser } from '@/lib/session'
import { listFeedPosts } from '@/lib/services/community'

export const metadata = {
  title: 'Feed - DreamCRM',
  description: 'Activity feed',
}

export const dynamic = 'force-dynamic'

export default async function Feed() {
  const user = await requireUser()
  const posts = await listFeedPosts()
  const items: FeedPostItem[] = posts.map((p) => ({
    id: p.id,
    body: p.body,
    imageUrl: p.imageUrl,
    likes: p.likes,
    comments: p.comments,
    createdAt: p.createdAt,
    authorName: p.authorName,
    authorImage: p.authorImage,
  }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 md:py-0 w-full max-w-[96rem] mx-auto">
      <div className="xl:flex">
        <div className="md:flex flex-1">
          <FeedLeftContent />
          <div className="flex-1 md:ml-8 xl:mx-4 2xl:mx-8">
            <div className="md:py-8">
              <div className="space-y-4">
                <FeedComposer userName={user.name?.split(' ')[0] ?? user.email ?? 'there'} />
                <FeedPosts posts={items} />
              </div>
            </div>
          </div>
        </div>
        <FeedRightContent />
      </div>
    </div>
  )
}
