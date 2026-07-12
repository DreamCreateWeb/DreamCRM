import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { postsAccessRedirect } from '../access'
import { listBlogPosts } from '@/lib/services/blog'
import CalendarView from './calendar-view'

export const metadata = { title: 'Content calendar - DreamCRM' }
export const dynamic = 'force-dynamic'

export interface CalendarItem {
  id: string
  title: string
  status: string
  source: string
  category: string | null
  hasBody: boolean
  ready: boolean
  scheduledFor: string | null
  publishedAt: string | null
  updatedAt: string
}

export default async function BlogCalendarPage() {
  const ctx = await requireTenant()
  const dest = postsAccessRedirect(ctx)
  if (dest) redirect(dest)

  const posts = await listBlogPosts(ctx.organizationId)
  const items: CalendarItem[] = posts.map((p) => {
    const hasBody = (p.bodyHtml ?? '').replace(/<[^>]*>/g, '').trim().length > 0
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      source: p.source,
      category: p.category,
      hasBody,
      // Passes the publish/schedule gate: real title + body + author byline.
      ready: Boolean(p.title.trim() && p.title !== 'Untitled post' && hasBody && p.authorStaffId),
      scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      updatedAt: p.updatedAt.toISOString(),
    }
  })

  return <CalendarView items={items} orgName={ctx.organizationName} />
}
