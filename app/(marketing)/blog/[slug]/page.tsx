import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMarketingPostBySlug, getMarketingPosts } from '@/lib/services/marketing-blog'
import { excerptFromHtml } from '@/lib/utils'
import type { BlogFaqItem } from '@/lib/types/clinic-content'
import BlogViewBeacon from '@/components/clinic-site/blog-view-beacon'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  FaqList,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'
import { getQuotedPlan } from '@/lib/stripe-config'
import JsonLdScript from '@/components/json-ld'

export const dynamic = 'force-dynamic'

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')

/** DREAMCRM-38: every surface that quotes the plan resolves it, never types it. */
const PLAN = getQuotedPlan()

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = await getMarketingPostBySlug(slug)
  if (!post) return {}
  // Honor the editor's SEO panel — same precedence as the clinic renderer.
  const title = post.seoTitle?.trim() || `${post.title} — DreamCRM blog`
  const description =
    post.seoDescription?.trim() || post.excerpt?.trim() || excerptFromHtml(post.bodyHtml)
  const url = `${BASE}/blog/${post.slug}`
  // Posts without a cover fall back to the brand OG image — a page-level
  // openGraph block replaces the inherited one, so without this the share
  // card would have no image at all. '/opengraph-image' resolves absolute
  // via metadataBase (1200×630, so large-card works either way).
  const image = post.coverImageUrl
    ? { url: post.coverImageUrl, alt: post.coverImageAlt ?? post.title }
    : { url: '/opengraph-image', alt: title }
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'DreamCRM',
      type: 'article',
      ...(post.publishedAt ? { publishedTime: post.publishedAt.toISOString() } : {}),
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
    },
  }
}

/**
 * A BLOG POST — `BRAND.md` Part 8 move 6, page 6.
 *
 * **THE FIFTH BESPOKE HERO, AND DREAMCRM-80's OWN AUDIT MISSED IT TOO.** Like
 * `/docs/[slug]`, the issue lists this route under *"already inheriting the
 * new chrome from move 4; bodies only"*, and like `/docs/[slug]` it rendered
 * a bare `<article className="mx-auto max-w-3xl">` with a hand-rolled
 * breadcrumb, `h1` and byline. The tell that catches this class every time is
 * `git grep PageHero -- 'app/(marketing)'`; a count of route folders has now
 * been wrong four times in the same direction.
 *
 * THE PART 11 LAYOUT-SHIFT DEFECT IS CLOSED HERE. `BRAND.md` Part 11 names
 * this exact `<img>`: *"the blog cover at `app/(marketing)/blog/[slug]/page.tsx`
 * has neither [width nor height] today — a real layout-shift defect."* The
 * issue said this is the cheapest it will ever be to fix, and it was right,
 * so the note in Part 11 comes down with this PR.
 *
 * The fix is `width` / `height` attributes plus a matching `aspect-[…]`, and
 * the reasoning matters because the obvious objection is that we do not know
 * an author-supplied image's intrinsic size. We do not need to: what the
 * browser reserves space from is the RATIO those two attributes express, and
 * `object-cover` makes the actual pixels fit the reserved box. 1200×630 is
 * not an arbitrary pick — it is the ratio `app/opengraph-image.tsx` already
 * uses for the share card, so a cover that was sized for sharing arrives
 * uncropped, and a cover that was not is cropped consistently rather than
 * setting the page's height from whatever came out of a phone.
 *
 * It stays a raw `<img>` on purpose. `next/image` would need the storage host
 * in `next.config.js`'s `remotePatterns`, and an optimizer 400 on a public
 * page is a worse failure than an unoptimized cover — Part 11 does not ask
 * for the optimizer, it asks for the reserved box. The existing
 * `eslint-disable` line stays with it.
 *
 * NO EMOJI FROM US, and this page is the one place Part 5's body-copy clause
 * could actually apply: `post.authorName` can be a NAMED HUMAN writing in the
 * first person, which is the clause's precondition. But `bodyHtml` is the
 * author's, rendered through `dangerouslySetInnerHTML` — so a plain unicode
 * emoji in a sentence here is THEIRS to write and ours to leave alone, and
 * the chrome around it stays clean. Nothing in this file emits one. (When
 * `authorName` is null the byline falls back to a corporate "we", which is
 * exactly the voice the clause distinguishes itself from — page 5's finding,
 * still true.)
 *
 * SECTION CONTAINERS ALL MATCH — one `max-w-6xl` column, reading measure held
 * by narrowing the text. `/blog/[slug]` is outside `marketing-viewport.spec.ts`
 * and has no axe stop because its body comes from the DATABASE and both
 * suites are seed-free; measured by hand at 390 / 834 / 1440 instead.
 */
function fmtDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })
}

export default async function MarketingBlogPostPage({ params }: Props) {
  const { slug } = await params
  // Independent fetches — overlap them (cache() dedupes the org lookup).
  const [post, recent] = await Promise.all([
    getMarketingPostBySlug(slug),
    getMarketingPosts(4),
  ])
  if (!post) notFound()

  const others = recent.filter((p) => p.slug !== slug).slice(0, 3)
  const faq = (Array.isArray(post.faq) ? post.faq : []) as BlogFaqItem[]
  const url = `${BASE}/blog/${post.slug}`

  const blogPostingLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt ?? excerptFromHtml(post.bodyHtml),
    url,
    ...(post.publishedAt ? { datePublished: post.publishedAt.toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: post.updatedAt.toISOString() } : {}),
    ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
    author: { '@type': 'Organization', name: post.authorName ?? 'The DreamCRM team' },
    publisher: { '@type': 'Organization', name: 'Dream Create' },
  }
  const faqLd =
    faq.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        }
      : null

  return (
    <>
      <JsonLdScript data={blogPostingLd} />
      {faqLd && <JsonLdScript data={faqLd} />}
      <BlogViewBeacon postId={post.id} />

      <PageHero
        eyebrow={post.category ?? 'Blog'}
        title={post.title}
        sub={post.excerpt ?? undefined}
      >
        {/* The byline spine — `PageHero`'s `children` slot, the fourth run
            page 5 measured on the guide hero and found costs nothing thanks to
            the bottom fade. The breadcrumb link lives here rather than above
            the `h1`: the old page opened on a navigation control instead of
            on what the post is about. */}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
          <span>{post.authorName ?? 'The DreamCRM team'}</span>
          <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          <time>{fmtDate(post.publishedAt)}</time>
          <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          <Link href="/blog" className="rounded-sm text-teal-700 hover:underline">
            All posts
          </Link>
        </div>
      </PageHero>

      <article className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        {post.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt={post.coverImageAlt ?? ''}
            // EXPLICIT WIDTH AND HEIGHT — `BRAND.md` Part 11, and the
            // layout-shift defect it names. The browser reserves the box from
            // this RATIO before a byte of the image arrives; `object-cover`
            // then fits whatever actually came out of the author's camera.
            // 1200x630 is the ratio `app/opengraph-image.tsx` already uses.
            width={1200}
            height={630}
            decoding="async"
            className="aspect-[1200/630] w-full rounded-[14px] border object-cover"
            style={{ borderColor: DAY_WIRE }}
          />
        )}

        {/* bodyHtml is sanitized at write time (sanitizeBlogHtml) — same
            trust path as the clinic public blogs. The reading measure is held
            on the PROSE rather than by narrowing the container, so the article
            starts on the same hard-left edge as the `h1` above it. */}
        <div
          className={`prose prose-gray max-w-2xl prose-headings:font-bold prose-headings:tracking-[-0.02em] prose-headings:text-gray-950 prose-p:text-gray-700 prose-a:text-teal-700 ${
            post.coverImageUrl ? 'mt-10' : ''
          }`}
          dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
        />

        {faq.length > 0 && (
          <section className="mt-14">
            <div
              className="mb-5 flex items-center gap-3 border-b pb-3"
              style={{ borderColor: DAY_WIRE }}
            >
              <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>Questions, answered</h2>
              <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
                <span aria-hidden="true">{String(faq.length).padStart(2, '0')}</span>
                <span className="sr-only">
                  {faq.length} question{faq.length === 1 ? '' : 's'}
                </span>
              </p>
            </div>
            {/* `FaqList` — the recipe promoted out of `/pricing` on the
                sibling PR in this move. This page had a FOURTH private copy of
                it, missing the card shadow and the 200ms turn. */}
            <FaqList items={faq.map((f) => ({ q: f.q, a: f.a }))} className="max-w-3xl" />
          </section>
        )}

        {others.length > 0 && (
          <aside className="mt-14 max-w-2xl">
            <div
              className="flex items-center gap-3 border-b pb-3"
              style={{ borderColor: DAY_WIRE }}
            >
              <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>More posts</h2>
            </div>
            <ul>
              {others.map((p) => (
                <li key={p.id} className="border-b" style={{ borderColor: DAY_WIRE }}>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="block py-3.5 text-[0.95rem] font-semibold leading-snug text-gray-950 hover:text-teal-700 hover:underline"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>

      {/* ── THE CLOSE — the page's bookend ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            One system
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Run your front office from one place
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Website, booking, portal, reviews, recall — ${PLAN.price}/mo founding practice rate,
            month-to-month, and seven days free to try it.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
            <GhostCta href="/grade">Grade your practice free</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
