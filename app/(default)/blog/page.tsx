import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { listBlogPosts, getBlogStats } from '@/lib/services/blog'
import { createBlogPostAction, createAiBlogPostAction } from './actions'

export const metadata = { title: 'Blog - DreamCRM' }
export const dynamic = 'force-dynamic'

/**
 * Blog dashboard — morning-huddle layout (mirrors Reviews + Overview).
 * Action-at-a-glance stat row (the freshness tile rots green→amber→red so a
 * neglected blog is visible) + new/AI-draft CTAs + the post list. The blog
 * lives on the clinic's own public site (the "trunk"); we never recycle a
 * shared content library, so every post here is the clinic's own.
 */

function freshness(d: Date | null): { label: string; tone: 'ok' | 'warn' | 'bad' } {
  if (!d) return { label: 'Never', tone: 'bad' }
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  const label = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`
  return { label, tone: days < 21 ? 'ok' : days < 60 ? 'warn' : 'bad' }
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function BlogPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [posts, stats] = await Promise.all([
    listBlogPosts(ctx.organizationId),
    getBlogStats(ctx.organizationId),
  ])

  // Canonical public URL for the "View live blog" link.
  const [profile] = await db
    .select({ websiteDomain: clinicProfile.websiteDomain })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, ctx.organizationId))
    .limit(1)
  const baseUrl = org
    ? publicSiteUrl({
        slug: org.slug,
        profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
      })
    : ''
  const liveBlogUrl = baseUrl ? `${baseUrl}/blog` : ''

  const fresh = freshness(stats.lastPublishedAt)
  const now = new Date()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
            Content · {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Blog
          </h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
            Original posts on your own website — written by your team (with AI help),
            reviewed before they go live. Not the recycled content library every other
            dental site ships, which Google quietly discounts.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stats.published > 0 && liveBlogUrl && (
            <a
              href={liveBlogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-medium px-3 py-2 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              View live blog ↗
            </a>
          )}
          <form action={createAiBlogPostAction}>
            <button
              type="submit"
              className="text-[13px] font-medium px-3 py-2 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
              title="Start a draft from a topic with AI — you review before publishing"
            >
              ✨ Draft with AI
            </button>
          </form>
          <form action={createBlogPostAction}>
            <button
              type="submit"
              className="text-[13px] font-semibold px-3 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              + New post
            </button>
          </form>
        </div>
      </div>

      {/* ── Stat row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi label="Published" value={stats.published} />
        <Kpi label="Drafts" value={stats.drafts} />
        <Kpi
          label="AI drafts to review"
          value={stats.aiDraftsPending}
          hint={stats.aiDraftsPending > 0 ? 'Read + publish or edit' : undefined}
          tone={stats.aiDraftsPending > 0 ? 'warn' : undefined}
        />
        <Kpi
          label="Last published"
          value={fresh.label}
          hint={stats.published > 0 ? undefined : 'Publish your first post'}
          tone={fresh.tone}
        />
      </div>

      {/* ── Posts ─────────────────────────────────────────────────────── */}
      {posts.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-12 text-center">
          <p className="text-3xl mb-3">✍️</p>
          <p className="text-stone-700 dark:text-stone-200 font-medium mb-1">No posts yet</p>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 max-w-md mx-auto">
            Start one from scratch, or let <strong>Draft with AI</strong> write a first pass
            from a topic — then review it, add an author, and publish.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/80 dark:bg-stone-900/80 border-b border-stone-200 dark:border-stone-700/60">
              <tr className="text-left text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
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
                const isAiPending = p.status !== 'published' && p.source === 'ai_draft'
                return (
                  <tr
                    key={p.id}
                    className="border-b border-stone-100 dark:border-stone-700/40 last:border-b-0 hover:bg-stone-50/60 dark:hover:bg-stone-800/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/blog/${p.id}`}
                          className="font-medium text-stone-800 dark:text-stone-100 hover:text-violet-600 dark:hover:text-violet-400"
                        >
                          {p.title}
                        </Link>
                        {isAiPending && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-500/10 px-1.5 py-0.5 rounded">
                            AI · review
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          p.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                            : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                        }`}
                      >
                        {p.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-stone-500 dark:text-stone-400 hidden md:table-cell">
                      {p.category ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-stone-500 dark:text-stone-400 hidden md:table-cell">
                      {p.authorName ?? <span className="italic text-stone-400">No author</span>}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-stone-500 dark:text-stone-400 tabular-nums">
                      {fmtDate(p.updatedAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {p.status === 'published' && liveBlogUrl && (
                        <a
                          href={`${liveBlogUrl}/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] text-stone-400 dark:text-stone-500 hover:text-violet-600 dark:hover:text-violet-400"
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
        <div className="bg-stone-100 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Coming next
          </p>
          <ul className="text-[12px] text-stone-600 dark:text-stone-300 space-y-1">
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

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'ok' | 'warn' | 'bad'
}) {
  const valueColor =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'bad'
          ? 'text-rose-700 dark:text-rose-300'
          : 'text-stone-900 dark:text-stone-100'
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${valueColor}`}>{value}</p>
      {hint && <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">{hint}</p>}
    </div>
  )
}
