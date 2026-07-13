import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listBlogPosts, getBlogStats } from '@/lib/services/blog'
import { createBlogPostAction, createAiBlogPostAction } from './actions'
import ModuleHint from '@/components/onboarding/module-hint'
import { postsAccessRedirect } from './access'
import { blogPublicBaseUrl } from './public-base-url'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStat } from '@/components/ui/kpi-stat'
import type { PillLegendRow, Tone } from '@/lib/ui/encodings'

export const metadata = { title: 'Blog - DreamCRM' }
export const dynamic = 'force-dynamic'

/**
 * Blog dashboard — morning-huddle layout (mirrors Reviews + Overview).
 * Action-at-a-glance stat row (the freshness tile rots ok→warn→urgent so a
 * neglected blog is visible) + new/AI-draft CTAs + the post list. The blog
 * lives on the clinic's own public site (the "trunk"); we never recycle a
 * shared content library, so every post here is the clinic's own.
 */

// Post lifecycle → tone. draft is inert (neutral); scheduled is in flight,
// queued to publish (info); published is live + healthy (ok).
const STATUS_TONE: Record<'draft' | 'scheduled' | 'published', Tone> = {
  draft: 'neutral',
  scheduled: 'info',
  published: 'ok',
}
const STATUS_LABEL: Record<'draft' | 'scheduled' | 'published', string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
}
function statusKey(s: string): 'draft' | 'scheduled' | 'published' {
  return s === 'published' ? 'published' : s === 'scheduled' ? 'scheduled' : 'draft'
}

const PILL_LEGEND: PillLegendRow[] = [
  { tone: 'ok', label: 'Published', meaning: 'Live on your website' },
  { tone: 'info', label: 'Scheduled', meaning: 'Queued to publish on a future date' },
  { tone: 'neutral', label: 'Draft', meaning: 'A work in progress — only you can see it' },
]

function freshness(d: Date | null): { label: string; tone: Tone } {
  if (!d) return { label: 'Never', tone: 'urgent' }
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  const label = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`
  return { label, tone: days < 21 ? 'ok' : days < 60 ? 'warn' : 'urgent' }
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function BlogPage() {
  const ctx = await requireTenant()
  const dest = postsAccessRedirect(ctx)
  if (dest) redirect(dest)

  const [posts, stats, baseUrl] = await Promise.all([
    listBlogPosts(ctx.organizationId),
    getBlogStats(ctx.organizationId),
    // Tenant-aware: platform posts live on the marketing site, not a
    // clinic subdomain.
    blogPublicBaseUrl(ctx),
  ])
  const liveBlogUrl = baseUrl ? `${baseUrl}/blog` : ''

  const fresh = freshness(stats.lastPublishedAt)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="blog" />

      <PageHeader
        eyebrow={
          <Link href="/website" className="hover:underline underline-offset-4">
            ‹ Website
          </Link>
        }
        title="Blog"
        subtitle="Original posts on your own website — written by your team (with AI help) and reviewed before they go live. Not the recycled content library most dental sites use, which Google quietly discounts."
        legend={<EncodingLegend pills={PILL_LEGEND} />}
        actions={
          <>
            {stats.published > 0 && liveBlogUrl && (
              <ActionButton variant="ghost" size="sm" href={liveBlogUrl} target="_blank">
                View live blog ↗
              </ActionButton>
            )}
            <ActionButton variant="secondary" size="sm" href="/website/blog/calendar">
              Calendar
            </ActionButton>
            <form action={createAiBlogPostAction}>
              <ActionButton
                variant="secondary"
                size="sm"
                type="submit"
                title="Start a draft from a topic with AI — you review before publishing"
              >
                ✨ Draft with AI
              </ActionButton>
            </form>
            <form action={createBlogPostAction}>
              <ActionButton variant="primary" size="sm" type="submit">
                + New post
              </ActionButton>
            </form>
          </>
        }
      />

      {/* ── Stat row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KpiStat label="Published" value={stats.published} />
        <KpiStat label="Drafts" value={stats.drafts} sub={stats.scheduled > 0 ? `${stats.scheduled} scheduled` : undefined} />
        <KpiStat
          label="AI drafts to review"
          value={stats.aiDraftsPending}
          sub={stats.aiDraftsPending > 0 ? 'Read, then publish or edit' : undefined}
          tone={stats.aiDraftsPending > 0 ? 'warn' : undefined}
        />
        <KpiStat
          label="Last published"
          value={fresh.label}
          sub={stats.published > 0 ? undefined : 'Publish your first post'}
          tone={fresh.tone}
        />
      </div>

      {/* ── Posts ─────────────────────────────────────────────────────── */}
      {posts.length === 0 ? (
        <EmptyState
          icon="✍️"
          title="No posts yet"
          body={
            <>
              Start one from scratch, or let <strong>Draft with AI</strong> write a first pass from a topic — then
              review it, add an author, and publish.
            </>
          }
          action={
            <form action={createBlogPostAction}>
              <ActionButton variant="primary" size="sm" type="submit">
                + New post
              </ActionButton>
            </form>
          }
        />
      ) : (
        <div className="v2-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)]">
              <tr className="text-left text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                <th className="px-4 py-2">Title</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 hidden md:table-cell">Category</th>
                <th className="px-3 py-2 hidden md:table-cell">Author</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => {
                const isAiPending = p.status === 'draft' && p.source === 'ai_draft'
                const sk = statusKey(p.status)
                return (
                  <tr
                    key={p.id}
                    className="border-b border-[color:var(--color-hairline)] last:border-b-0 hover:bg-gray-50/60 dark:hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/website/blog/${p.id}`}
                          className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:text-teal-700 dark:hover:text-teal-400"
                        >
                          {p.title}
                        </Link>
                        {isAiPending && (
                          <StatusPill tone="special" label="AI · review" title="AI-drafted — read it before publishing" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill tone={STATUS_TONE[sk]} label={STATUS_LABEL[sk]} />
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      {p.category ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      {p.authorName ?? <span className="italic text-gray-400 dark:text-gray-500">No author</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
                      {fmtDate(p.updatedAt)}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {p.status === 'published' && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums mr-3">
                          <span className="font-mono-num">{p.viewCount}</span> {p.viewCount === 1 ? 'read' : 'reads'}
                        </span>
                      )}
                      {p.status === 'published' && liveBlogUrl && (
                        <a
                          href={`${liveBlogUrl}/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-400"
                        >
                          View ↗
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Coming next ───────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="v2-well p-5">
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Coming next
          </p>
          <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
            <li>· Schedule a post to publish on a future date</li>
            <li>· Cover-image generation + alt-text suggestions</li>
            <li>· Rankings + page-health for each post (lands with the SEO dashboard)</li>
            <li>· Email a new post to a Recall &amp; Outreach audience in one click</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
