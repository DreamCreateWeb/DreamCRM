import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { STARTER_BLOG_TOPICS } from '@/lib/services/blog'
import { sanitizeBlogHtml } from '@/lib/blog-sanitize'
import { DEMO_OFFICE_PHOTOS } from './media'

// The blog plan and its posts.

// ── Blog seeding (shared by new-clinic-seed + self-heal) ────────────────
// Curated set covering every state the /blog dashboard + public blog show:
// two published posts bylined to demo staff (p1 = Dr. Jordan Reyes,
// p3 = Maria Vega, RDH — the ids seeded into clinicProfile.staff), one plain
// draft, and one AI-drafted post still awaiting review (drives the
// "AI · review" badge + the publish gate). Content comes from the shared
// STARTER_BLOG_TOPICS so there's a single source of truth. Additive +
// idempotent on slug.
interface BlogPostSeed {
  slug: string
  status: 'draft' | 'scheduled' | 'published'
  source: 'manual' | 'ai_draft'
  authorStaffId: string | null
  authorName: string | null
  // p3 = Maria (hygienist) writes the gum-health post, reviewed by p1 (Dr.
  // Reyes) — exercises the public "Medically reviewed by" byline line.
  medicallyReviewedByStaffId: string | null
  publishedDaysAgo: number | null
  scheduledInDays: number | null
  coverImageUrl: string | null
  coverImageAlt?: string | null
  faq?: Array<{ q: string; a: string }>
  viewCount: number
  // idea-to-draft stub: empty body so it lands in the calendar's "Ideas" lane.
  isStub?: boolean
}

const DEMO_BLOG_PLAN: BlogPostSeed[] = [
  {
    slug: 'what-to-expect-at-your-first-visit',
    status: 'published',
    source: 'manual',
    authorStaffId: 'p1',
    authorName: 'Dr. Jordan Reyes',
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: 9,
    scheduledInDays: null,
    coverImageUrl: DEMO_OFFICE_PHOTOS[0].url,
    coverImageAlt: 'A bright, modern dental treatment room with natural light',
    viewCount: 142,
  },
  {
    slug: 'why-your-gums-matter',
    status: 'published',
    source: 'manual',
    authorStaffId: 'p3',
    authorName: 'Maria Vega, RDH',
    medicallyReviewedByStaffId: 'p1',
    publishedDaysAgo: 28,
    scheduledInDays: null,
    coverImageUrl: DEMO_OFFICE_PHOTOS[2].url,
    coverImageAlt: 'A dental hygienist reviewing gum health with a smiling patient',
    faq: [
      {
        q: 'Is it normal for my gums to bleed when I floss?',
        a: 'A little bleeding when you first start flossing is common and usually settles within a week or two. If it keeps happening, mention it at your next visit.',
      },
      {
        q: 'How often should I have my gums checked?',
        a: 'For most people, a check-up and cleaning every six months keeps gums healthy and catches any early changes.',
      },
      {
        q: 'Can gum problems be reversed?',
        a: 'Early gum inflammation (gingivitis) is very reversible with good home care and a professional cleaning. More advanced issues are managed rather than fully reversed — so earlier is always better.',
      },
    ],
    viewCount: 87,
  },
  {
    slug: 'teeth-whitening-what-actually-works',
    status: 'draft',
    source: 'manual',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: null,
    coverImageUrl: null,
    viewCount: 0,
  },
  {
    // Scheduled to auto-publish — exercises the Content Engine cron path.
    slug: 'sensitive-teeth-what-helps',
    status: 'scheduled',
    source: 'manual',
    authorStaffId: 'p1',
    authorName: 'Dr. Jordan Reyes',
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: 6,
    coverImageUrl: DEMO_OFFICE_PHOTOS[1].url,
    coverImageAlt: 'A calm dental reception area with warm wood and plants',
    viewCount: 0,
  },
  {
    // AI draft pending review (full body, awaiting an author + publish).
    slug: 'bringing-your-kids-to-the-dentist',
    status: 'draft',
    source: 'ai_draft',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: null,
    coverImageUrl: null,
    viewCount: 0,
  },
  {
    // Idea stub — lands in the calendar's "Ideas to draft" lane.
    slug: 'do-you-need-a-night-guard',
    status: 'draft',
    source: 'ai_draft',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: null,
    coverImageUrl: null,
    viewCount: 0,
    isStub: true,
  },
]

export async function seedBlogPostsForOrg(orgId: string, now: Date, existingSlugs: Set<string>) {
  const topicBySlug = new Map(STARTER_BLOG_TOPICS.map((t) => [t.slug, t]))
  const dayMs = 24 * 60 * 60 * 1000
  let added = 0
  for (const plan of DEMO_BLOG_PLAN) {
    const publishedAt =
      plan.publishedDaysAgo != null ? new Date(now.getTime() - plan.publishedDaysAgo * dayMs) : null
    const scheduledFor =
      plan.scheduledInDays != null ? new Date(now.getTime() + plan.scheduledInDays * dayMs) : null
    const reviewedAt = plan.medicallyReviewedByStaffId ? publishedAt ?? now : null
    if (existingSlugs.has(plan.slug)) {
      // Backfill Track-A fields (reviewer + view count) on legacy demo posts
      // that predate them, so the demo always showcases the latest module.
      await db
        .update(schema.blogPost)
        .set({
          medicallyReviewedByStaffId: plan.medicallyReviewedByStaffId,
          medicallyReviewedAt: reviewedAt,
          viewCount: plan.viewCount,
          coverImageAlt: plan.coverImageAlt ?? null,
          faq: plan.faq ?? null,
        })
        .where(and(eq(schema.blogPost.organizationId, orgId), eq(schema.blogPost.slug, plan.slug)))
      continue
    }
    const topic = topicBySlug.get(plan.slug)
    if (!topic) continue
    await db.insert(schema.blogPost).values({
      id: newId('post'),
      organizationId: orgId,
      title: topic.title,
      slug: topic.slug,
      excerpt: topic.excerpt,
      bodyHtml: plan.isStub ? '' : sanitizeBlogHtml(topic.bodyHtml),
      category: topic.category,
      status: plan.status,
      source: plan.source,
      authorStaffId: plan.authorStaffId,
      authorName: plan.authorName,
      medicallyReviewedByStaffId: plan.medicallyReviewedByStaffId,
      medicallyReviewedAt: reviewedAt,
      coverImageUrl: plan.coverImageUrl,
      coverImageAlt: plan.coverImageAlt ?? null,
      faq: plan.faq ?? null,
      viewCount: plan.viewCount,
      scheduledFor,
      publishedAt,
      createdAt: publishedAt ?? now,
      updatedAt: publishedAt ?? now,
    })
    added++
  }
  return { added }
}
