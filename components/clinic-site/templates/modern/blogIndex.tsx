import type { BlogPost } from '@/lib/db/schema/clinic'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { brandFill } from '@/lib/clinic-site-theme'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_BORDER as BORDER, SITE_HEADING } from '@/components/clinic-site/tokens'
import SiteImage from '@/components/clinic-site/site-image'
import JsonLdScript from '@/components/json-ld'

import type { BlogIndexPageBodyProps } from '@/lib/site-templates/subpage-props'

/**
 * Modern's blogIndex body — moved verbatim out of the page shell (ML-52). The
 * shell owns every read / SEO / gate and hands this the values it computed.
 */
export default function ModernBlogIndex({
  blogLd,
  brand,
  headingInk,
  name,
  categories,
  basePath,
  category,
  posts,
  featured,
  featuredAuthor,
  restPosts,
  restAuthors,
  bookHref,
  data
}: BlogIndexPageBodyProps) {
  return (
    <>
      {blogLd && (
        <JsonLdScript data={blogLd} />
      )}
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative pt-14 sm:pt-20 pb-10 sm:pb-14 overflow-hidden">
        {/* Soft brand-color decorative blob */}
        <div
          aria-hidden="true"
          className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full opacity-[0.18] blur-3xl"
          style={{ backgroundColor: brandFill(brand) }}
        />
        <div className="relative max-w-[1100px] mx-auto px-5 sm:px-8 text-center">
          <ScrollReveal>
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: headingInk }}
            >
              The Blog · {name}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[68px] font-semibold leading-[1.04] tracking-[-0.02em] mb-6"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Honest answers, real questions.
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={120}>
            <p
              className="text-lg sm:text-xl leading-[1.55] mx-auto max-w-[600px]"
              style={{ color: INK_MUTED }}
            >
              Practical, no-judgment guidance on keeping your smile healthy —
              written by our team for yours.
            </p>
          </ScrollReveal>
        </div>
      </section>

      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 pb-14 sm:pb-24">
        {/* Category filter */}
        {categories.length > 0 && (
          <ScrollReveal className="flex flex-wrap gap-2 mb-12 justify-center">
            <CategoryChip label="All" href={`${basePath}/blog`} active={!category} brand={brand} />
            {categories.map((c) => (
              <CategoryChip
                key={c}
                label={c}
                href={`${basePath}/blog?category=${encodeURIComponent(c)}`}
                active={category === c}
                brand={brand}
              />
            ))}
          </ScrollReveal>
        )}

        {posts.length === 0 ? (
          <ScrollReveal
            className="rounded-2xl border border-dashed py-20 text-center"
            style={{ borderColor: BORDER, color: INK_MUTED }}
          >
            <p className="text-base">No posts yet — check back soon.</p>
          </ScrollReveal>
        ) : (
          <>
            {featured && (
              <ScrollReveal className="mb-16 sm:mb-20">
                <FeaturedPostCard
                  post={featured}
                  authorName={featuredAuthor?.name ?? null}
                  basePath={basePath}
                  brand={brand}
                />
              </ScrollReveal>
            )}

            {restPosts.length > 0 && (
              <div
                className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3"
                data-edit-field="blog"
                data-edit-kind="modal"
                data-edit-label="blog posts"
              >
                {restPosts.map((p, i) => (
                  <ScrollReveal as="article" key={p.id} delay={(i % 3) * 90}>
                    <PostCard
                      post={p}
                      authorName={restAuthors[i]?.name ?? null}
                      basePath={basePath}
                      brand={brand}
                    />
                  </ScrollReveal>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ClosingCTA
        heading="Have a question we haven’t answered?"
        subhead="We’re happy to talk it through — no pressure, no sales pitch."
        primary={{ label: 'Book a visit', href: bookHref }}
        secondary={
          data.profile.phone
            ? { label: data.profile.phone, href: `tel:${data.profile.phone}` }
            : undefined
        }
        brand={brand}
      />
    </>
  )
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  // Format in UTC so a publish date is stable regardless of the (UTC) server
  // clock — a date-only display shouldn't drift by a day near midnight.
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function CategoryChip({
  label,
  href,
  active,
  brand,
}: {
  label: string
  href: string
  active: boolean
  brand: string
}) {
  return (
    <a
      href={href}
      className="text-[13px] font-medium px-4 py-2 rounded-full border transition hover:shadow-sm"
      style={
        active
          ? {
              backgroundColor: brandFill(brand),
              color: '#fff',
              borderColor: brandFill(brand),
            }
          : { color: INK_MUTED, borderColor: BORDER, backgroundColor: 'var(--c-surface, #FFFFFF)' }
      }
    >
      {label}
    </a>
  )
}

function FeaturedPostCard({
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
  const headingInk = SITE_HEADING
  return (
    <a
      href={`${basePath}/blog/${post.slug}`}
      className="group block rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
      style={{ backgroundColor: 'var(--c-surface, #FFFFFF)', border: `1px solid ${BORDER}` }}
    >
      <div className="grid md:grid-cols-2 gap-0 items-stretch">
        <div
          className="aspect-[16/10] md:aspect-auto md:h-full w-full overflow-hidden"
          style={{ backgroundColor: `${brand}1A` }}
        >
          {post.coverImageUrl ? (
            <SiteImage
              displayWidth={640}
              src={post.coverImageUrl}
              alt=""
              className="w-full h-full object-cover transition duration-500 group-hover:scale-[1.04]"
              width={1280}
              height={800}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ color: brand }} aria-hidden="true">
              <svg className="w-14 h-14 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
          )}
        </div>
        <div className="p-8 sm:p-10 lg:p-12 flex flex-col justify-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
            style={{ color: headingInk }}
          >
            Featured · {post.category ?? 'Latest'}
          </p>
          <h2
            className="text-2xl sm:text-3xl lg:text-[36px] font-semibold leading-[1.12] tracking-[-0.015em] mb-4 transition group-hover:opacity-85"
            style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="text-base sm:text-lg leading-[1.6] mb-5 line-clamp-3" style={{ color: INK_MUTED }}>
              {post.excerpt}
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px]" style={{ color: INK_MUTED }}>
              {authorName ? `${authorName} · ` : ''}
              {fmtDate(post.publishedAt)}
            </p>
            <span
              className="inline-flex items-center gap-1.5 text-sm font-semibold transition-all duration-300 group-hover:gap-2.5"
              style={{ color: headingInk }}
            >
              Read article
              <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>
      </div>
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
  const headingInk = SITE_HEADING
  return (
    <a href={`${basePath}/blog/${post.slug}`} className="group flex flex-col h-full">
      <div
        className="aspect-[16/10] w-full rounded-2xl overflow-hidden mb-5"
        style={{ backgroundColor: `${brand}1A` }}
      >
        {post.coverImageUrl ? (
          <SiteImage
            displayWidth={384}
            src={post.coverImageUrl}
            alt=""
            className="w-full h-full object-cover transition duration-500 group-hover:scale-[1.04]"
            width={1280}
            height={800}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: brand }} aria-hidden="true">
            <svg className="w-10 h-10 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
        )}
      </div>
      {post.category && (
        <span className="text-xs font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: headingInk }}>
          {post.category}
        </span>
      )}
      <h2
        className="text-xl font-semibold leading-snug tracking-[-0.01em] mb-2 transition group-hover:opacity-80"
        style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
      >
        {post.title}
      </h2>
      {post.excerpt && (
        <p className="text-[15px] leading-[1.55] mb-4 line-clamp-3" style={{ color: INK_MUTED }}>
          {post.excerpt}
        </p>
      )}
      <p className="text-[13px] mt-auto pt-1" style={{ color: INK_MUTED }}>
        {authorName ? `${authorName} · ` : ''}
        {fmtDate(post.publishedAt)}
      </p>
    </a>
  )
}
