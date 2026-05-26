import type { CSSProperties } from 'react'
import type { BlogPost } from '@/lib/db/schema/clinic'
import type { ClinicStaff, BlogFaqItem } from '@/lib/types/clinic-content'
import { sanitizeBlogHtml } from '@/lib/blog-sanitize'
import { readingTimeMinutes } from '@/lib/utils'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const BORDER = '#E8E2D9'

interface Props {
  post: BlogPost
  author: ClinicStaff | null
  reviewer: ClinicStaff | null
  related: BlogPost[]
  brand: string
  basePath: string
  isPro: boolean
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * Split well-structured body HTML at ~40% (by text length) on a top-level
 * block boundary, so a contextual CTA can sit mid-article (where dropoff
 * spikes). Returns [whole, ''] when the body is short or not cleanly block-
 * structured, so we never mangle it.
 */
function splitForCta(html: string): [string, string] {
  const blocks = html.match(/<(p|h2|h3|ul|ol|blockquote|pre|figure)\b[\s\S]*?<\/\1>/gi) || []
  if (blocks.length < 4) return [html, '']
  const joined = blocks.join('')
  if (joined.length < html.length * 0.85) return [html, '']
  const totalText = html.replace(/<[^>]+>/g, '').length
  let acc = 0
  let idx = 0
  for (let i = 0; i < blocks.length; i++) {
    acc += blocks[i].replace(/<[^>]+>/g, '').length
    if (acc >= totalText * 0.4) {
      idx = i + 1
      break
    }
  }
  if (idx <= 0 || idx >= blocks.length) return [html, '']
  return [blocks.slice(0, idx).join(''), blocks.slice(idx).join('')]
}

function bylineSuffix(person: ClinicStaff): string {
  return person.title ? `, ${person.title}` : ''
}

export default function BlogArticle({ post, author, reviewer, related, brand, basePath, isPro }: Props) {
  const clean = sanitizeBlogHtml(post.bodyHtml)
  const [firstHalf, secondHalf] = splitForCta(clean)
  const faq = ((post.faq as BlogFaqItem[] | null) ?? []).filter((f) => f?.q && f?.a)
  const bookHref = isPro ? `${basePath}/book` : `${basePath}#contact`
  const proseStyle = { ['--tw-prose-links' as keyof CSSProperties]: brand } as CSSProperties
  const readMin = readingTimeMinutes(clean)

  return (
    <article className="max-w-[760px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
      <a href={`${basePath}/blog`} className="text-[13px] font-medium hover:underline" style={{ color: INK_MUTED }}>
        ← All posts
      </a>

      <header className="mt-6 mb-8">
        {post.category && (
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: brand }}>
            {post.category}
          </span>
        )}
        <h1
          className="text-3xl sm:text-[42px] font-bold leading-[1.1] tracking-[-0.02em] mt-3 mb-5"
          style={{ color: INK }}
        >
          {post.title}
        </h1>
        <div className="flex items-center gap-3">
          {author?.photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={author.photoUrl} alt={author.name} className="w-11 h-11 rounded-full object-cover" />
          ) : author ? (
            <span
              className="flex items-center justify-center w-11 h-11 rounded-full text-white text-sm font-bold"
              style={{ backgroundColor: brand }}
            >
              {author.name.charAt(0).toUpperCase()}
            </span>
          ) : null}
          <div className="text-sm" style={{ color: INK_MUTED }}>
            {author && (
              <span className="block font-semibold" style={{ color: INK }}>
                {author.name}
                {bylineSuffix(author)}
              </span>
            )}
            <span>
              {fmtDate(post.publishedAt)}
              {' · '}
              {readMin} min read
            </span>
          </div>
        </div>
        {reviewer && (
          <p className="text-[12px] mt-3 inline-flex items-center gap-1.5" style={{ color: INK_MUTED }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" style={{ color: brand }}>
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z"
                clipRule="evenodd"
              />
            </svg>
            Medically reviewed by {reviewer.name}
            {bylineSuffix(reviewer)}
          </p>
        )}
      </header>

      {post.coverImageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={post.coverImageUrl} alt={post.coverImageAlt ?? ''} className="w-full aspect-[16/9] object-cover rounded-2xl mb-10" />
      )}

      <div className="prose prose-lg prose-stone max-w-none" style={proseStyle} dangerouslySetInnerHTML={{ __html: firstHalf }} />

      {secondHalf && (
        <>
          {/* Contextual in-content CTA at the ~40% mark */}
          <div className="my-10 rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4" style={{ backgroundColor: `${brand}14` }}>
            <p className="text-[15px] leading-snug flex-1" style={{ color: INK }}>
              Have a question about this, or want to be seen? We&apos;ll talk it through — no judgment, ever.
            </p>
            <a
              href={bookHref}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-sm transition hover:opacity-95 shrink-0"
              style={{ backgroundColor: brand }}
            >
              Book a Visit
            </a>
          </div>
          <div className="prose prose-lg prose-stone max-w-none" style={proseStyle} dangerouslySetInnerHTML={{ __html: secondHalf }} />
        </>
      )}

      {faq.length > 0 && (
        <section className="mt-12 pt-8 border-t" style={{ borderColor: BORDER }}>
          <h2 className="text-2xl font-bold tracking-[-0.01em] mb-5" style={{ color: INK }}>
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {faq.map((f, i) => (
              <div key={i}>
                <h3 className="text-[17px] font-semibold mb-1.5" style={{ color: INK }}>
                  {f.q}
                </h3>
                <p className="text-[15px] leading-[1.6]" style={{ color: INK_MUTED }}>
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {author?.bio && (
        <div className="mt-12 pt-8 border-t" style={{ borderColor: BORDER }}>
          <p className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: INK_MUTED }}>
            About the author
          </p>
          <div className="flex items-start gap-4">
            {author.photoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={author.photoUrl} alt={author.name} className="w-14 h-14 rounded-full object-cover shrink-0" />
            )}
            <div>
              <p className="font-semibold" style={{ color: INK }}>
                {author.name}
                {bylineSuffix(author)}
              </p>
              <p className="text-[15px] leading-[1.55] mt-1" style={{ color: INK_MUTED }}>
                {author.bio}
              </p>
            </div>
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-12 pt-8 border-t" style={{ borderColor: BORDER }}>
          <p className="text-[11px] uppercase tracking-wider font-semibold mb-4" style={{ color: INK_MUTED }}>
            Keep reading
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {related.map((r) => (
              <a key={r.id} href={`${basePath}/blog/${r.slug}`} className="group">
                <div className="aspect-[16/10] w-full rounded-xl overflow-hidden mb-3" style={{ backgroundColor: `${brand}1A` }}>
                  {r.coverImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.coverImageUrl} alt="" className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                  )}
                </div>
                {r.category && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: brand }}>
                    {r.category}
                  </span>
                )}
                <p className="text-[15px] font-bold leading-snug mt-1 transition group-hover:opacity-80" style={{ color: INK }}>
                  {r.title}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* End CTA */}
      <div className="mt-12 rounded-2xl p-8 text-center" style={{ backgroundColor: `${brand}14` }}>
        <p className="text-xl font-bold tracking-[-0.01em] mb-4" style={{ color: INK }}>
          Questions about your smile? We&apos;re happy to help.
        </p>
        <a
          href={bookHref}
          className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
          style={{ backgroundColor: brand }}
        >
          Book a Visit
        </a>
      </div>
    </article>
  )
}
