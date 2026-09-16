import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { getMarketingPosts } from '@/lib/services/marketing-blog'
import { MarketingEmoji } from '@/components/marketing/emoji'
import { PageHero, PrimaryCta, GhostCta, MONO_LABEL, DAY_WIRE } from '@/components/marketing/ui'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Blog — DreamCRM',
  alternates: { canonical: '/blog' },
  description:
    'Product announcements and essays on running a modern dental front office — from the team building DreamCRM.',
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}

/**
 * THE BLOG INDEX — `BRAND.md` Part 8 move 6, page 6.
 *
 * This one really did inherit move 4's `PageHero`, so the work was the body:
 * a `max-w-3xl` list under a `max-w-6xl` hero, which started every post 192px
 * right of the `h1` at 1440. One column now, the reading measure held by
 * narrowing the TEXT — the constraint pages 1–5 each paid for.
 *
 * THE EMPTY STATE IS THIS PAGE'S ONE MOMENT, AND IT IS THE FIRST CALL SITE
 * `planet` HAS EVER HAD. `BRAND.md` Part 5's table gives that glyph exactly
 * one use: *"the space register itself, where a page needs a mark and not a
 * mood"* — and until now nothing on the site had needed one, so the entry sat
 * in the registry describing a case with no example. An empty blog is that
 * case precisely. There is nothing to celebrate (no popper), nothing shipped
 * (no rocket) and nothing got better (no sparkles); the page simply needs to
 * not read as a 404. It is decorative by default — `MarketingEmoji` emits
 * `alt=""` unless given a `label`, and the line under it already says what
 * is happening, so announcing "ringed planet" would be noise rather than
 * access.
 *
 * **This is the one empty state on the marketing site**, which is what keeps
 * the glyph from becoming decoration. The rule that stops it spreading is the
 * one Part 5 already states: a glyph that is not marking anything is the
 * sparkle that got rejected.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER — pages 1–5's answer.
 *
 * `/blog` IS DELIBERATELY OUTSIDE `e2e/marketing-viewport.spec.ts` and has no
 * axe stop, and that is not this move's choice: its body comes from the
 * DATABASE and both suites are seed-free by design, so a guard here would go
 * red for fixture reasons. The spec says so in its own header. Both states of
 * this page — the empty one and a populated one — were measured by hand at
 * 390 / 834 / 1440 instead, which is what a page outside the guards costs.
 */
export default async function MarketingBlogPage() {
  // /blog was the clinic dashboard's post manager before it moved into the
  // Website workspace (/website/blog) —
  // signed-in clinic staff following old bookmarks get a breadcrumb redirect
  // (matching the /calendar → /appointments convention). Platform staff and
  // signed-out visitors see the public marketing blog.
  const ctx = await getTenantContext()
  if (ctx?.tenantType === 'clinic') redirect('/website/blog')

  const posts = await getMarketingPosts()
  const total = String(posts.length).padStart(2, '0')

  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Notes from the front office"
        sub="Product announcements and essays on running a modern dental practice — written by the team, not a content farm."
      />

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        {posts.length === 0 ? (
          <div
            className="max-w-2xl rounded-[14px] border bg-white px-6 py-10 text-center"
            style={{ borderColor: DAY_WIRE }}
          >
            <MarketingEmoji name="planet" size={44} className="mb-3" />
            <p className="text-[1.1rem] font-bold tracking-[-0.02em] text-gray-950">
              Nothing written down yet.
            </p>
            <p className="mx-auto mt-2 max-w-md text-[0.95rem] leading-relaxed text-gray-600">
              First posts are on their way. Meanwhile the{' '}
              <Link href="/docs" className="font-semibold text-teal-700 hover:underline">
                help docs
              </Link>{' '}
              cover the whole product, and the{' '}
              <Link href="/resources" className="font-semibold text-teal-700 hover:underline">
                practice growth library
              </Link>{' '}
              has the guides we would have written first anyway.
            </p>
          </div>
        ) : (
          <>
            <div
              className="flex items-center gap-3 border-b pb-3"
              style={{ borderColor: DAY_WIRE }}
            >
              <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>Everything we have written</h2>
              <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
                <span aria-hidden="true">{total}</span>
                <span className="sr-only">
                  {posts.length} post{posts.length === 1 ? '' : 's'}
                </span>
              </p>
            </div>
            <ol>
              {posts.map((post) => (
                <li key={post.id} className="border-b" style={{ borderColor: DAY_WIRE }}>
                  <Link href={`/blog/${post.slug}`} className="mkt-nudge-host group block py-8">
                    <div className="grid gap-x-10 gap-y-3 lg:grid-cols-12">
                      <div className="lg:col-span-5">
                        <p
                          className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-gray-500 ${MONO_LABEL}`}
                        >
                          {post.category && <span className="text-teal-700">{post.category}</span>}
                          {post.category && (
                            <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
                          )}
                          <time>{fmtDate(post.publishedAt)}</time>
                        </p>
                        <h3 className="mt-3 text-[1.25rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 sm:text-[1.45rem]">
                          <span className="inline-flex items-start gap-2 group-hover:underline">
                            {post.title}
                            {/* ONE LINK PER ROW and the arrow lives inside it —
                                page 5's rule. A second "Read the post →"
                                pointing at the same href is a second tab stop
                                that goes exactly where the first one does.
                                `mkt-nudge` is gated to a fine pointer in
                                `MarketingMotionStyles`, so it does not fire on
                                a touch-and-hold (Part 6). */}
                            <span
                              className="mkt-nudge mt-[0.3em] shrink-0 text-teal-700"
                              aria-hidden="true"
                            >
                              →
                            </span>
                          </span>
                        </h3>
                      </div>
                      {post.excerpt && (
                        <p className="max-w-2xl text-[0.95rem] leading-relaxed text-gray-700 lg:col-span-7">
                          {post.excerpt}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      {/* ── THE CLOSE — the page's bookend ─────────────────────────────── */}
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
            See where your practice actually stands
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            The grader checks your website, your Google listing and your reviews — free, instant,
            yours to keep, whether or not you ever read another word of this.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/grade">Grade your practice free</PrimaryCta>
            <GhostCta href="/signup">Start free — 7 days</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
