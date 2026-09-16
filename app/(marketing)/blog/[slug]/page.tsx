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
  ToneTile,
  ToneDash,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'
import { usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import JsonLdScript from '@/components/json-ld'

/**
 * A BLOG POST — `BRAND.md` Part 8 move 6, page 6 (the second half).
 *
 * ── THE FIFTH BESPOKE HERO, AND THE COUNT HAS NOW BEEN WRONG FOUR TIMES ───
 *
 * DREAMCRM-80 lists this file under *"already inheriting the new chrome from
 * move 4; bodies only"*. It was not: this route opened with a hand-rolled
 * `<h1>` inside a bare `mx-auto max-w-3xl` article and never called
 * `PageHero`. `compare/[vendor]` (page 2), `GuideShell` (page 5),
 * `docs/[slug]` and this file are four instances of the same miscount, all in
 * the same direction, and the cause is stable enough to state as a rule:
 * **move 4's "all eight subpages inherit it" counted ROUTE GROUPS, and a page
 * that renders its own hero does not inherit the one it never called.** The
 * reliable check is `git grep -L PageHero` over the route files, not a count
 * of subpages.
 *
 * ── THE BYLINE IS THE MOVE ────────────────────────────────────────────────
 *
 * Everything else here is the language pages 1–5 settled. The one thing this
 * page has that no other marketing page has is a NAMED HUMAN, and the old
 * layout buried it: `authorName · date` as a 13.6px grey line under the
 * title, smaller than the breadcrumb above it. It is in the hero's spine now,
 * beside the subject tile and the category — the shape `GuideShell` gives a
 * guide's read time and `/docs/[slug]` gives its category.
 *
 * That matters beyond typography, and page 5 is why. `BRAND.md` Part 5 allows
 * plain unicode emoji in body copy **where a named human is writing**, and
 * page 5 had to close with that clause having NO call site anywhere on the
 * site: the resource guides have no author field, and a corporate "we" is the
 * voice the clause distinguishes itself from. This page has the field. So the
 * permission lands here, on the author, in prose they write — which is why
 * this file adds no glyph of its own and Part 5's table is untouched for the
 * sixth page running. **A byline is what earns that clause; a component
 * cannot.**
 *
 * ── THE PRICE RESOLVES (DREAMCRM-38), EIGHTH SURFACE ──────────────────────
 *
 * The closing CTA said "$200/mo founding practice rate" as a literal.
 * `tests/marketing/pricing-price-source.test.tsx` scans this route now.
 *
 * ── THE COVER IMAGE, AND PART 11's LAYOUT-SHIFT DEFECT IS CLOSED ──────────
 *
 * `BRAND.md` Part 11 records it by name: *"The blog cover at
 * `app/(marketing)/blog/[slug]/page.tsx` has neither [width nor height] today
 * — a real layout-shift defect"*. It is the only `<img>` on the designed
 * marketing pages, it sits above the fold on every post, and it arrived with
 * no reserved box, so every post reflowed its whole article when the cover
 * loaded.
 *
 * **THE HONEST FIX IS A RATIO, NOT A GUESS, AND THE DIFFERENCE MATTERS.**
 * `blog_post` stores `cover_image_url` and `cover_image_alt` and no
 * dimensions — so there is no true intrinsic size to declare, and typing one
 * would be a number that is wrong for every upload that is not exactly that
 * shape. What the attributes actually buy in a modern browser is an
 * `aspect-ratio` for the box while the bytes are in flight, so this declares
 * the ratio WE impose (16:9) and crops to it with `object-cover` — which the
 * old markup already did. The box is therefore correct before the image
 * arrives and correct after it, whatever was uploaded, and the CSS
 * `aspect-[16/9]` and the attributes agree by construction.
 *
 * `loading="eager"` + `fetchPriority="high"`: Part 11 gives `priority` to the
 * one above-the-fold asset, and on a post this is it.
 *
 * Stated limit, because Part 11 asks for AVIF/WebP with a raster fallback and
 * this does not do that: the cover is an author-supplied URL out of the CMS,
 * so its encoding is whatever was uploaded. That is a content-pipeline job
 * (the clinic sites solve it with `<SiteImage>` through `/_next/image`), not
 * a brand one, and it is left standing in Part 11 rather than quietly dropped.
 */

export const dynamic = 'force-dynamic'

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')

/** Ours, resolved rather than typed (DREAMCRM-38). Pure config — no database,
 *  no Stripe call — so this costs nothing at render. */
const PLAN = getQuotedPlan()

/** The ratio the cover box reserves. See the header: the database stores no
 *  dimensions, so this is the crop we impose rather than a measurement. */
const COVER_W = 1600
const COVER_H = 900

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
  const author = post.authorName ?? 'The DreamCRM team'

  const blogPostingLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt ?? excerptFromHtml(post.bodyHtml),
    url,
    ...(post.publishedAt ? { datePublished: post.publishedAt.toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: post.updatedAt.toISOString() } : {}),
    ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
    author: { '@type': 'Organization', name: author },
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
        {/* THE BYLINE, IN THE SPINE. The one marketing page with a named
            human on it, and the old layout had that name smaller than the
            breadcrumb above it. Mono, dot-separated — the same shape a
            guide's read time and a doc's category take. */}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
          <ToneTile glyph="pencil" size="sm" />
          <span>{author}</span>
          {post.publishedAt && (
            <>
              <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
              <time dateTime={post.publishedAt.toISOString()}>{fmtDate(post.publishedAt)}</time>
            </>
          )}
          <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          <Link href="/blog" className="mkt-nudge-host inline-flex items-center gap-2 text-teal-700 hover:underline">
            <span className="mkt-nudge-back" aria-hidden="true">
              ←
            </span>
            All posts
          </Link>
        </div>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 pb-6 pt-2 sm:px-6">
        <div className="lg:grid lg:grid-cols-12 lg:gap-x-10">
          <article className="max-w-2xl lg:col-span-8">
          {post.coverImageUrl && (
            /* The box is reserved before the bytes arrive — see the header
               for why this is a declared RATIO rather than a measured size. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverImageUrl}
              alt={post.coverImageAlt ?? ''}
              width={COVER_W}
              height={COVER_H}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="mt-2 aspect-[16/9] w-full rounded-[14px] border object-cover"
              style={{ borderColor: DAY_WIRE }}
            />
          )}

          {/* bodyHtml is sanitized at write time (sanitizeBlogHtml) — same
              trust path as the clinic public blogs. The `prose` sizes step UP
              to `1rem` here for the reason `GuideP` does: a post is a reading
              column, not a paragraph in a grid. */}
          <div
            className="prose prose-gray mt-8 max-w-none text-[1rem] prose-headings:font-bold prose-headings:tracking-[-0.02em] prose-p:leading-relaxed prose-p:text-gray-700 prose-a:text-teal-700"
            dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
          />

          {faq.length > 0 && (
            <section className="mt-12 border-t pt-8" style={{ borderColor: DAY_WIRE }}>
              <h2 className="text-[1.45rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 sm:text-[1.6rem]">
                Questions, answered
              </h2>
              {/* `FaqList` rather than a fourth private copy of the rotating
                  `+` tile — it was promoted into the shared kit on move 6
                  page 6's first half for exactly this call site. */}
              <FaqList className="mt-5" items={faq.map((f) => ({ q: f.q, a: f.a }))} />
            </section>
          )}

        </article>

          {/* ── THE MARGIN — `More posts`, out of the article's basement and
                 into the space a 1440 post was wasting. Same call the help
                 article makes, for the same reason: this is real content
                 rather than a table of contents, so it STACKS below `lg`
                 instead of hiding. ── */}
          {others.length > 0 && (
            <aside className="mt-12 lg:col-span-4 lg:mt-0">
              <div className="lg:sticky lg:top-24">
                <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
                  <ToneTile glyph="pencil" size="md" />
                  <p className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>More posts</p>
                  <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
                    <span aria-hidden="true">{String(others.length).padStart(2, '0')}</span>
                    <span className="sr-only">{others.length} posts</span>
                  </p>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {others.map((p) => (
                    <li key={p.id} className="flex items-start gap-2.5">
                      <ToneDash glyph="pencil" className="mt-[0.6em]" />
                      <Link
                        href={`/blog/${p.slug}`}
                        className="text-[0.95rem] leading-snug text-gray-600 hover:text-teal-700 hover:underline"
                      >
                        {p.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* ── THE CLOSE — the page's bookend ──────────────────────────────
             The 36px gradient rule that opened the page under the eyebrow,
             closing it. Deliberately not the old centred `teal-50/60` panel,
             which was a centred block under what is now a hard-left hero. ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            While you are here
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Run your front office from one system
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Website, booking, portal, reviews, recall — {usd(PLAN.price)}/mo at the founding
            practice rate, month-to-month.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start free — 7 days</PrimaryCta>
            <GhostCta href="/product">See what DreamCRM does</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
