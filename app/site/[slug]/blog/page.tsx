import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts, listPublishedCategories, getPostAuthor } from '@/lib/services/blog'
import type { BlogPost } from '@/lib/db/schema/clinic'
import BlogChrome from './blog-chrome'

const BG = '#FAF7F2'
const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const BORDER = '#E8E2D9'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ category?: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/blog`
  const title = `Blog — ${name}`
  const description = `Oral-health tips, treatment guides, and news from ${name}.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function ClinicBlogIndexPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { category } = await searchParams
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = `/site/${slug}`
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const name = data.profile.displayName ?? data.orgName

  const [posts, categories] = await Promise.all([
    listPublishedPosts(data.orgId, { category }),
    listPublishedCategories(data.orgId),
  ])
  const authors = await Promise.all(posts.map((p) => getPostAuthor(data.orgId, p)))

  return (
    <BlogChrome data={data} basePath={basePath}>
      <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: brand }}>
            From {name}
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: INK }}>
            The Blog
          </h1>
          <p className="text-lg leading-[1.55] mt-3 max-w-[560px]" style={{ color: INK_MUTED }}>
            Practical, no-judgment guidance on keeping your smile healthy — written by our team.
          </p>
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-10">
            <CategoryChip basePath={basePath} label="All" href={`${basePath}/blog`} active={!category} brand={brand} />
            {categories.map((c) => (
              <CategoryChip
                key={c}
                basePath={basePath}
                label={c}
                href={`${basePath}/blog?category=${encodeURIComponent(c)}`}
                active={category === c}
                brand={brand}
              />
            ))}
          </div>
        )}

        {posts.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed py-20 text-center"
            style={{ borderColor: BORDER, color: INK_MUTED }}
          >
            <p className="text-base">No posts yet — check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
              <PostCard
                key={p.id}
                post={p}
                authorName={authors[i]?.name ?? null}
                basePath={basePath}
                brand={brand}
              />
            ))}
          </div>
        )}
      </div>
    </BlogChrome>
  )
}

function CategoryChip({
  label,
  href,
  active,
  brand,
}: {
  basePath: string
  label: string
  href: string
  active: boolean
  brand: string
}) {
  return (
    <a
      href={href}
      className="text-[13px] font-medium px-3.5 py-1.5 rounded-full border transition"
      style={
        active
          ? { backgroundColor: brand, color: '#fff', borderColor: brand }
          : { color: INK_MUTED, borderColor: BORDER, backgroundColor: 'transparent' }
      }
    >
      {label}
    </a>
  )
}

function PostCard({
  post,
  authorName,
  basePath,
  brand,
}: {
  post: BlogPost
  authorName: string | null
  basePath: string
  brand: string
}) {
  return (
    <a href={`${basePath}/blog/${post.slug}`} className="group flex flex-col">
      <div
        className="aspect-[16/10] w-full rounded-xl overflow-hidden mb-4"
        style={{ backgroundColor: `${brand}1A` }}
      >
        {post.coverImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={post.coverImageUrl}
            alt=""
            className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: brand }}>
            <svg className="w-10 h-10 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
        )}
      </div>
      {post.category && (
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: brand }}>
          {post.category}
        </span>
      )}
      <h2
        className="text-xl font-bold leading-snug tracking-[-0.01em] mb-2 transition group-hover:opacity-80"
        style={{ color: INK }}
      >
        {post.title}
      </h2>
      {post.excerpt && (
        <p className="text-[15px] leading-[1.55] mb-3 line-clamp-3" style={{ color: INK_MUTED }}>
          {post.excerpt}
        </p>
      )}
      <p className="text-[13px] mt-auto" style={{ color: INK_MUTED }}>
        {authorName ? `${authorName} · ` : ''}
        {fmtDate(post.publishedAt)}
      </p>
    </a>
  )
}
