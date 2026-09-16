import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { getMarketingPosts } from '@/lib/services/marketing-blog'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  ToneTile,
  ToneDash,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'

/**
 * THE BLOG INDEX — `BRAND.md` Part 8 move 6, page 6 (the second half).
 *
 * THE SHELF AGAIN, and by now that is a language rather than a repetition:
 * the group header (a tile, a mono label, a `DAY_WIRE` hairline, the real
 * count), one row per post, hard left on the page's own `max-w-6xl` column.
 * The old body was `max-w-3xl` under a `max-w-6xl` hero, so every post began
 * ~250px right of the `h1` — page 1's cost, handed forward through five pages:
 * narrow the TEXT, never the CONTAINER.
 *
 * ONE TILE FOR THE WHOLE BLOG RATHER THAN ONE PER CATEGORY, and the reason is
 * the docs index's reason INVERTED. `/docs` gets a tile per category because
 * its four categories are a closed union in a registry — a fifth cannot
 * compile without somebody choosing a subject. A blog category is FREE TEXT
 * out of the CMS: staff type it when they write the post. A glyph map over
 * that needs a fallback, and a fallback is exactly the shape
 * `DOC_CATEGORY_GLYPH`'s header rejects — a new category silently gets
 * whatever the default is. So the blog states its subject ONCE, on the group,
 * and the rows carry the tone dash. Tier B, `BRAND.md` Part 3.
 *
 * NO EMOJI, INCLUDING IN THE EMPTY STATE, and this is the one page in the
 * move where that took an argument. Part 5 permits the animated set to mark a
 * MOMENT; an empty blog is not a moment, it is an absence, and a glyph there
 * would be decoration — which Part 5 bans by name. The empty state earns its
 * character from copy and from being USEFUL instead: it sends the reader to
 * the two surfaces that do have something to read today.
 *
 * ── WHERE PART 5's BODY-COPY CLAUSE FINALLY HAS A CALL SITE ───────────────
 *
 * Page 5 closed with an open question: Part 5 allows plain unicode emoji in
 * body copy *where a named human is writing*, and no surface on the site met
 * the precondition, because the guides have no byline and a corporate "we" is
 * the voice that clause distinguishes itself FROM. **The blog meets it.**
 * `BlogPost.authorName` is a real field, a real person fills it in the Posts
 * manager, and the post body is that person writing. So the clause has a home
 * — it is just not a home this file can furnish. The body is author-written
 * HTML out of the database; the permission belongs to whoever writes the post,
 * and the byline is what earns it. What this move does is make the byline a
 * real one (it is in the hero's spine on `/blog/[slug]` now, not a 13px grey
 * line under the title) rather than invent a glyph nobody asked for.
 */

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
          /* THE EMPTY STATE, AND IT DOES A JOB RATHER THAN APOLOGISING. The
             old one was a centred grey card reading "First posts are on their
             way" — a centred block under a hard-left hero (the drift this
             move exists to close) that left the reader with nowhere to go but
             back. This one is hard left on the page's own column, opens on
             the brand's three hues, and names the two surfaces that DO have
             something to read today. */
          <div className="max-w-2xl">
            <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
              <span
                className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
                aria-hidden="true"
              />
              Nothing here yet
            </div>
            <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
              The first posts are still being written
            </h2>
            <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
              When they land they will be the same thing the rest of this site is — what we
              built, what it does, and what it does not. Until then, two places worth your
              time: the help docs cover the whole product, and the changelog says what
              shipped last week.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <PrimaryCta href="/docs">Read the help docs</PrimaryCta>
              <GhostCta href="/changelog">See what shipped</GhostCta>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
              <ToneTile glyph="pencil" size="md" />
              <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>From the team</h2>
              <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
                <span aria-hidden="true">{total}</span>
                <span className="sr-only">{posts.length} posts</span>
              </p>
            </div>

            <ol>
              {posts.map((post) => (
                <li key={post.id} className="border-b" style={{ borderColor: DAY_WIRE }}>
                  {/* ONE LINK PER ROW covering the whole row — the old page
                      had the row link AND a "Read the post →" inside it,
                      which is a second tab stop going exactly where the
                      first one does (page 5's rule). */}
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group mkt-nudge-host block py-7 lg:grid lg:grid-cols-12 lg:gap-x-10"
                  >
                    <div className="lg:col-span-5">
                      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-gray-500 ${MONO_LABEL}`}>
                        <ToneDash glyph="pencil" />
                        {post.category && (
                          <>
                            <span className="text-teal-700">{post.category}</span>
                            <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
                          </>
                        )}
                        <time>{fmtDate(post.publishedAt)}</time>
                      </div>
                      <h3 className="mt-3 text-[1.25rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 group-hover:text-teal-700 sm:text-[1.45rem]">
                        {post.title}
                        <span className="mkt-nudge ml-2 inline-block text-teal-700" aria-hidden="true">
                          →
                        </span>
                      </h3>
                    </div>
                    <div className="lg:col-span-7">
                      {post.excerpt && (
                        <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-gray-700 lg:mt-0">
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
    </>
  )
}
