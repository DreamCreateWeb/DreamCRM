import 'server-only'
import { cache } from 'react'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { sanitizeBlogHtml } from '@/lib/blog-sanitize'
import { getPlatformOrgId } from '@/lib/services/gsc'
import { listPublishedPosts, getPublishedPostBySlug } from '@/lib/services/blog'
import type { BlogPost } from '@/lib/db/schema/clinic'

/**
 * The public marketing blog at /blog — the PLATFORM org's posts, running on
 * the same blog system clinics use (one CMS, two audiences). Authoring
 * happens in the dashboard: platform staff use the same Posts manager
 * clinics do, scoped to the platform org.
 */

// cache(): generateMetadata and the page body share one resolution per
// request instead of issuing duplicate queries.
export const getMarketingPosts = cache(async (limit?: number): Promise<BlogPost[]> => {
  const orgId = await getPlatformOrgId()
  if (!orgId) return []
  return listPublishedPosts(orgId, { limit })
})

export const getMarketingPostBySlug = cache(async (slug: string): Promise<BlogPost | null> => {
  const orgId = await getPlatformOrgId()
  if (!orgId) return null
  return getPublishedPostBySlug(orgId, slug)
})

/* ── Launch posts (idempotent seed) ─────────────────────────────────── */

interface LaunchPost {
  slug: string
  title: string
  excerpt: string
  category: string
  bodyHtml: string
}

const LAUNCH_POSTS: LaunchPost[] = [
  {
    slug: 'dreamcrm-is-live',
    title: 'DreamCRM is live: one front office for your dental practice',
    excerpt:
      'Website, online booking, patient portal, messages, reviews, recall, and a shop — one system at one flat price, wrapped around the PMS you already run.',
    category: 'Announcements',
    bodyHtml: `
<p>Today we're opening DreamCRM to every dental practice. The pitch fits in a sentence: the five or six patient-facing subscriptions a typical practice juggles — website agency, booking widget, reminder service, review tool, recall vendor — replaced by one system, for $99–199 a month, month-to-month.</p>
<h2>What's in the box</h2>
<p>A practice website you edit by clicking the page itself. Online booking from your live availability, with visit-type rules so the schedule stays sane. A patient portal in your branding where patients confirm, self-reschedule, fill forms, and pay their balance. One inbox where portal messages and patient email merge per patient. Review collection that turns into website testimonials with one click. Recall campaigns measured in booked visits, not opens. An online store and membership plans paying out to your own bank. And a two-way Open Dental sync that goes through the official API only.</p>
<h2>What we deliberately don't do</h2>
<p>We are not a practice management system, and we don't pretend to be. Charts, procedures, claims, prescriptions — those stay in your PMS, which keeps doing what it's good at. We also don't do VoIP phones, and SMS texting is on our roadmap rather than in the product today; we'd rather tell you that on the pricing page than surprise you after the contract. There is no contract, incidentally.</p>
<h2>See it before you sign anything</h2>
<p>Dream Dental is a fully-populated demo practice: browse its public website, booking flow, and patient-facing pages. When you're convinced, setup takes about ten minutes and your own site is live on your subdomain before your next patient checks out.</p>`,
  },
  {
    slug: 'why-we-wrap-your-pms',
    title: "Why we wrap your PMS instead of replacing it",
    excerpt:
      "Nobody switches their practice management system, and they're right not to. The fix for front-office chaos is the layer around the PMS — built on official APIs, not database side doors.",
    category: 'Product',
    bodyHtml: `
<p>Every dental software pitch eventually arrives at the same fork: "switch everything to us." We think that pitch is wrong, and the data agrees — moving a practice off its PMS costs five figures, takes a quarter, and breaks insurance claims history on the way out. Practices know this, which is why they don't switch.</p>
<h2>The orbital layer is where the pain actually lives</h2>
<p>But the tools <em>around</em> the PMS — the website, booking, communications, reviews, recall — aren't sticky at all. That's where practices churn vendors, juggle logins, and pay $800–2,000 a month for software that doesn't share a database. That layer is what DreamCRM consolidates. The PMS keeps the chart; we run the relationship.</p>
<h2>Official APIs or nothing</h2>
<p>The dental integration world has a dirty open secret: several well-known vendors sync by writing directly into PMS databases. Open Dental has publicly cautioned its customers about exactly this. Our position is simple: DreamCRM talks to Open Dental exclusively through its sanctioned API. Every write we make — a booking, a cancellation, a message mirrored to the CommLog — lands in your audit trail with our name on it. Slower to build? Yes. But your database integrity isn't a growth hack.</p>
<h2>What two-way actually means</h2>
<p>Patients, appointments, providers, balances, and recall due dates flow in on a schedule. Bookings made on your website or portal push back instantly, cancellations clear the slot in the PMS so nobody gets reminded about a dead appointment, and the comms we send appear in each patient's chart. If a sync stalls, you get a banner on your Overview — never silence. That's the whole philosophy: the integration should behave the way you'd build it if you had time.</p>`,
  },
  {
    slug: 'inside-the-patient-portal',
    title: 'Inside the new patient portal: built from the research up',
    excerpt:
      'Portals fail on forgotten passwords and dead links. Ours starts from the evidence: passwordless sign-in, self-reschedule first, clinic-controlled toggles where off means gone.',
    category: 'Product',
    bodyHtml: `
<p>Before writing a line of the new portal we read the field: federal portal-adoption data, the one peer-reviewed study of a dental portal, thousands of app-store reviews of the big dental apps, and the help docs of every competitor portal. Three findings shaped everything.</p>
<h2>1. Portals die on passwords</h2>
<p>Dental visits are roughly six months apart, which makes every portal visit a cold start. Nineteen percent of patients who don't use portals cite login trouble. So ours is passwordless: patients enter their email and tap a sign-in link. No password to forget means no reason to give up at the door.</p>
<h2>2. Reschedule beats book</h2>
<p>The most-praised feature in the best dental app in the country is also its most-complained-about gap: changing an existing visit. Self-rescheduling — with a clinic-set notice window, inside of which the portal says "call us" — protects the schedule and respects the front desk. Cancellations show one line of copy we're proud of: <em>"Life happens — no judgment."</em></p>
<h2>3. Off must mean gone</h2>
<p>One incumbent's own documentation admits that turning off portal payments leaves the payment link visible to patients. We built the opposite rule into the settings page: any feature a practice toggles off disappears entirely. And because trusting a settings page is hard, there's a "Preview as a patient" button that renders the portal with your saved settings and a sample patient — before any real patient sees it.</p>
<p>The rest is craft: the clinic's own logo and colors, a next-visit card whose actions change with its state, family access so a parent runs the household from one login, and online balance payments that settle to the practice's own bank. It ships on the Pro tier today.</p>`,
  },
]

/**
 * Idempotent (by slug) seed of the marketing launch posts onto the platform
 * org. Runs on deploy alongside the demo resync; existing posts are never
 * touched, so edits made in the Posts manager stick.
 */
export async function seedPlatformBlogPosts(): Promise<{ created: number }> {
  const orgId = await getPlatformOrgId()
  if (!orgId) return { created: 0 }

  let created = 0
  for (const post of LAUNCH_POSTS) {
    const [existing] = await db
      .select({ id: schema.blogPost.id })
      .from(schema.blogPost)
      .where(and(eq(schema.blogPost.organizationId, orgId), eq(schema.blogPost.slug, post.slug)))
      .limit(1)
    if (existing) continue

    const now = new Date()
    await db.insert(schema.blogPost).values({
      id: newId('post'),
      organizationId: orgId,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      bodyHtml: sanitizeBlogHtml(post.bodyHtml),
      category: post.category,
      status: 'published',
      source: 'manual',
      authorStaffId: null,
      authorName: 'The DreamCRM team',
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    created++
  }

  // One-time content correction for rows seeded with the original copy: the
  // launch post overstated SMS status ("still in carrier registration").
  // Exact-sentence match means a manually edited post is never touched.
  const STALE_SMS_SENTENCE =
    "our SMS channel is still in carrier registration; we'd"
  const FIXED_SMS_SENTENCE =
    'SMS texting is on our roadmap rather than in the product today; we\u2019d'
  const [livePost] = await db
    .select({ id: schema.blogPost.id, bodyHtml: schema.blogPost.bodyHtml })
    .from(schema.blogPost)
    .where(and(eq(schema.blogPost.organizationId, orgId), eq(schema.blogPost.slug, 'dreamcrm-is-live')))
    .limit(1)
  if (livePost?.bodyHtml?.includes(STALE_SMS_SENTENCE)) {
    await db
      .update(schema.blogPost)
      .set({
        bodyHtml: livePost.bodyHtml.replace(STALE_SMS_SENTENCE, FIXED_SMS_SENTENCE),
        updatedAt: new Date(),
      })
      .where(eq(schema.blogPost.id, livePost.id))
  }

  return { created }
}
