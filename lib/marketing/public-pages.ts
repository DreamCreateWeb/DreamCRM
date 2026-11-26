import { buildAbout } from '@/lib/marketing/about'
import { COMPARISONS, contractAnswer } from '@/lib/marketing/comparisons'
import { CHANGELOG_ENTRIES } from '@/lib/marketing/changelog'
import { DOCS } from '@/lib/marketing/docs'
import { LEGAL_UPDATED } from '@/lib/marketing/legal'
import { RESOURCE_GUIDES } from '@/lib/marketing/resources'
import { NO_SHOW_SOURCES, PRIVACY_NOTICE_RULE, REMINDER_RULE, REVIEW_RULES } from '@/lib/marketing/guide-sources'
import {
  productEmail,
  REMINDER_GUIDE_EMAILS,
  REMINDER_TEXTS,
  REVIEW_REQUEST_TEXT,
} from '@/lib/marketing/guide-templates'
import { MARKETING_PUBLIC_PATHS, TRIAL } from '@/lib/marketing/site'
import { contentKey } from '@/lib/indexnow'
import { getQuotedPlan } from '@/lib/stripe-config'

/**
 * EVERY PUBLIC PAGE OF THE MARKETING SITE, ONCE.
 *
 * Two things tell search engines what we publish: the sitemap they come and
 * read, and the IndexNow notice we send when something changes
 * (lib/indexnow.ts). If each kept its own list, a page added to one and not
 * the other would be either unannounced or announced and unlisted — and
 * nobody would see it, because both are files only a crawler reads. So there
 * is one list, and both are views of it: `app/sitemap.ts` maps it to
 * `<url>` entries, `lib/services/indexnow.ts` to path → content key.
 *
 * The only thing this cannot know on its own is the blog, whose posts live
 * in the database; the caller reads them and passes them in.
 *
 * TWO CLAIMS PER PAGE, AND BOTH MUST BE TRUE.
 *
 *  - `lastModified` — stated only where the tree holds a real date (see
 *    `app/sitemap.ts` for why a manufactured one is worse than none).
 *  - `contentKey` — a string that moves exactly when the page's own content
 *    does. A page built from a registry is keyed on that registry's entry, so
 *    re-reading a competitor's pricing page, revising a help article or
 *    changing the price announces precisely the pages that now say something
 *    different. A HAND-WRITTEN page (the home page, the product tour) has no
 *    data object to key on; it carries a constant, is announced once, and a
 *    later copy edit reaches the engines by ordinary crawling. That is a
 *    limit, stated — the alternative was a date somebody has to remember to
 *    bump, which is how a field starts lying.
 */

export interface PublicPage {
  /** Root-relative. The home page is `/`. */
  path: string
  /** A real date, or absent. Never the time of the request. */
  lastModified?: string | Date
  changeFrequency: 'weekly' | 'monthly'
  priority: number
  /** Moves exactly when this page's content does. */
  contentKey: string
}

/** What the page list needs to know about a published post. */
export interface PublicPost {
  slug: string
  publishedAt: Date | null
  updatedAt: Date | null
  /** What the `/blog` index shows of it — so the index is re-announced when
   *  its own card changes, and not when only the article's body does. */
  title?: string | null
  excerpt?: string | null
}

/** A hand-written page: announced once, then left to ordinary crawling. */
export const HAND_WRITTEN_KEY = 'hand-written'

/**
 * What a guide's page is built from, when that is not the guide's own entry.
 * The pricing guide renders the comparison registry's pricing lines, contract
 * answers and check dates — so a competitor's page re-read on the same day,
 * with no date to bump, still moves the guide's key and gets it re-announced.
 */
const GUIDE_SOURCES: Record<string, () => unknown> = {
  'dental-software-pricing': () =>
    COMPARISONS.map((c) => [c.slug, c.name, c.reportedPricing, c.pricingChecked ?? null, contractAnswer(c)]),
  // The no-show guide quotes outside pages word for word and dates each read
  // (`guide-sources.ts`), and shows the product's own missed-visit note
  // (`guide-templates.ts`). A re-read source or an edit to that email changes
  // what the page says without touching the guide's own entry.
  'dental-cancellation-no-show-policy': () => [NO_SHOW_SOURCES, productEmail('no_show_rebook')],
  // The reminder guide is the product's four appointment emails, four
  // hand-written texts and a quoted rule: all three live outside its entry.
  // The review guide: the rules it quotes, its one text, the product's
  // review request email.
  'dental-review-request-templates': () => [REVIEW_RULES, REVIEW_REQUEST_TEXT, productEmail('review_request')],
  // The welcome guide: the privacy-notice rule it quotes and the product's
  // two new-patient emails.
  'dental-new-patient-welcome-letter': () => [
    PRIVACY_NOTICE_RULE,
    productEmail('intake_request'),
    productEmail('portal_invite'),
  ],
  // The growth guide quotes one line of Google's policy from the same data.
  'how-to-get-more-dental-patients': () => REVIEW_RULES.googlePolicy.says.gating,
  'dental-appointment-reminder-templates': () => [
    REMINDER_RULE,
    REMINDER_TEXTS,
    REMINDER_GUIDE_EMAILS.map((key) => productEmail(key)),
  ],
}

function postModified(post: PublicPost): Date | null {
  return post.updatedAt ?? post.publishedAt
}

function postKey(post: PublicPost): string {
  const modified = postModified(post)
  return modified ? modified.toISOString() : 'undated'
}

/** The key of a top-level page that is built from data rather than typed. */
function staticPageKey(path: string, posts: readonly PublicPost[]): string {
  switch (path) {
    case '/pricing': {
      const plan = getQuotedPlan()
      return contentKey({
        monthly: plan.price,
        annual: plan.annualPrice,
        list: plan.listPrice ?? null,
        trial: TRIAL,
      })
    }
    case '/privacy':
    case '/terms':
      return `legal:${LEGAL_UPDATED}`
    // The facts page is data end to end — the listing kit, arranged.
    case '/about':
      return contentKey(buildAbout())
    // An index page changes when its list does.
    case '/compare':
      return contentKey(COMPARISONS.map((c) => [c.slug, c.name, c.pricingChecked?.on ?? null]))
    case '/docs':
      return contentKey(DOCS.map((d) => [d.slug, d.title, d.summary]))
    case '/resources':
      return contentKey(RESOURCE_GUIDES.map((g) => [g.slug, g.title, g.datePublished]))
    case '/changelog':
      return contentKey(CHANGELOG_ENTRIES)
    case '/blog':
      return contentKey(
        posts.map((p) => [p.slug, p.title ?? null, p.excerpt ?? null, p.publishedAt?.toISOString() ?? null]),
      )
    default:
      return HAND_WRITTEN_KEY
  }
}

/**
 * The whole public marketing site. `posts` are the PLATFORM org's published
 * posts, newest first, exactly as `/blog` lists them.
 */
export function publicPages(posts: readonly PublicPost[]): PublicPage[] {
  const top: PublicPage[] = ['/', ...MARKETING_PUBLIC_PATHS].map((path) => ({
    path,
    changeFrequency: 'weekly' as const,
    priority: path === '/' ? 1 : 0.8,
    contentKey: staticPageKey(path, posts),
  }))

  const compare: PublicPage[] = COMPARISONS.map((c) => ({
    path: `/compare/${c.slug}`,
    ...(c.pricingChecked ? { lastModified: c.pricingChecked.on } : {}),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
    contentKey: contentKey(c),
  }))

  const docs: PublicPage[] = DOCS.map((d) => ({
    path: `/docs/${d.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
    contentKey: contentKey(d),
  }))

  const guides: PublicPage[] = RESOURCE_GUIDES.map((g) => ({
    path: `/resources/${g.slug}`,
    lastModified: g.datePublished,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
    // A guide whose body is built from another registry changes when THAT
    // does, not only when its own entry is edited.
    contentKey: contentKey(GUIDE_SOURCES[g.slug] ? [g, GUIDE_SOURCES[g.slug]()] : g),
  }))

  const blog: PublicPage[] = posts.map((post) => {
    const modified = postModified(post)
    return {
      path: `/blog/${post.slug}`,
      ...(modified ? { lastModified: modified } : {}),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
      contentKey: postKey(post),
    }
  })

  return [...top, ...compare, ...docs, ...guides, ...blog]
}
