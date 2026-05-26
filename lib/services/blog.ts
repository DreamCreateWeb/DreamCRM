import 'server-only'
import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { blogPost } from '@/lib/db/schema/clinic'
import type { BlogPost } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { newId, slugify } from '@/lib/utils'
import { sanitizeBlogHtml } from '@/lib/blog-sanitize'
import type { ClinicStaff, BlogFaqItem } from '@/lib/types/clinic-content'

/**
 * Blog service. Posts are clinic-owned, live on the public site by slug, and
 * carry an author byline that points at a clinicProfile.staff[] entry (so the
 * E-E-A-T byline reuses the "Meet the Team" record the clinic already curates).
 *
 * The clinician-review gate lives here: AI drafts and seeds are created with
 * status='draft'; only `publishBlogPost` flips a post live, and it requires a
 * title, a body, and an author byline first. All body HTML is sanitized on
 * every write (single XSS chokepoint).
 */

// Suggested categories for the editor dropdown. Free-text in the DB — clinics
// can type their own — but these cover the common dental shapes.
export const BLOG_CATEGORY_SUGGESTIONS = [
  'Oral Health',
  'Treatments',
  'Cosmetic',
  'Kids & Family',
  'Patient Resources',
  'Office News',
] as const

export const BlogPostInput = z.object({
  title: z.string().max(160).optional(),
  slug: z.string().max(120).optional(),
  excerpt: z.string().max(400).optional().nullable(),
  bodyHtml: z.string().max(200_000).optional().nullable(),
  bodyJson: z.any().optional().nullable(),
  coverImageUrl: z.string().max(2000).optional().nullable(),
  coverImageAlt: z.string().max(300).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional().nullable(),
  faq: z
    .array(z.object({ q: z.string().max(300), a: z.string().max(2000) }))
    .max(20)
    .optional()
    .nullable(),
  authorStaffId: z.string().max(120).optional().nullable(),
  medicallyReviewedByStaffId: z.string().max(120).optional().nullable(),
  seoTitle: z.string().max(160).optional().nullable(),
  seoDescription: z.string().max(320).optional().nullable(),
  // Only ever set forward to 'ai_draft' (when the editor applies an AI draft).
  // Seed provenance is set by the seeder and never overwritten from the editor.
  source: z.enum(['manual', 'ai_draft']).optional(),
})
export type BlogPostInputT = z.infer<typeof BlogPostInput>

export interface BlogStats {
  published: number
  drafts: number
  scheduled: number
  aiDraftsPending: number
  lastPublishedAt: Date | null
}

// ── Slug uniqueness (per org) ───────────────────────────────────────────────

async function uniqueSlug(organizationId: string, baseTitle: string, exceptId?: string): Promise<string> {
  const root = slugify(baseTitle) || 'post'
  let attempt = root
  let n = 1
  while (true) {
    const [existing] = await db
      .select({ id: blogPost.id })
      .from(blogPost)
      .where(and(eq(blogPost.organizationId, organizationId), eq(blogPost.slug, attempt)))
      .limit(1)
    if (!existing || existing.id === exceptId) return attempt
    n += 1
    attempt = `${root}-${n}`
  }
}

// ── Author byline resolution ────────────────────────────────────────────────

async function loadStaff(organizationId: string): Promise<ClinicStaff[]> {
  const [profile] = await db
    .select({ staff: clinicProfile.staff })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  return ((profile?.staff as ClinicStaff[] | null) ?? []).filter((s) => s && s.id && s.name)
}

/** The clinic's team members, used to populate the author dropdown. */
export async function listAuthorOptions(organizationId: string): Promise<ClinicStaff[]> {
  return loadStaff(organizationId)
}

/** Resolve a post's full author record (name / title / bio / photo) for the
 * public byline. Falls back to the snapshotted authorName when the staff
 * entry has since been removed. */
export async function getPostAuthor(
  organizationId: string,
  post: Pick<BlogPost, 'authorStaffId' | 'authorName'>,
): Promise<ClinicStaff | null> {
  if (!post.authorStaffId) {
    return post.authorName ? { id: 'snapshot', name: post.authorName } : null
  }
  const staff = await loadStaff(organizationId)
  const match = staff.find((s) => s.id === post.authorStaffId)
  if (match) return match
  return post.authorName ? { id: post.authorStaffId, name: post.authorName } : null
}

async function snapshotAuthorName(
  organizationId: string,
  authorStaffId: string | null | undefined,
): Promise<string | null> {
  if (!authorStaffId) return null
  const staff = await loadStaff(organizationId)
  return staff.find((s) => s.id === authorStaffId)?.name ?? null
}

// ── Admin reads ─────────────────────────────────────────────────────────────

/** All non-archived posts for the admin dashboard, newest activity first. */
export async function listBlogPosts(organizationId: string): Promise<BlogPost[]> {
  return db
    .select()
    .from(blogPost)
    .where(and(eq(blogPost.organizationId, organizationId), isNull(blogPost.archivedAt)))
    .orderBy(desc(blogPost.updatedAt))
}

export async function getBlogPost(organizationId: string, id: string): Promise<BlogPost | null> {
  const [row] = await db
    .select()
    .from(blogPost)
    .where(and(eq(blogPost.id, id), eq(blogPost.organizationId, organizationId)))
    .limit(1)
  return row ?? null
}

export async function getBlogStats(organizationId: string): Promise<BlogStats> {
  const rows = await db
    .select({
      status: blogPost.status,
      source: blogPost.source,
      publishedAt: blogPost.publishedAt,
    })
    .from(blogPost)
    .where(and(eq(blogPost.organizationId, organizationId), isNull(blogPost.archivedAt)))

  let published = 0
  let drafts = 0
  let scheduled = 0
  let aiDraftsPending = 0
  let lastPublishedAt: Date | null = null
  for (const r of rows) {
    if (r.status === 'published') {
      published += 1
      if (r.publishedAt && (!lastPublishedAt || r.publishedAt > lastPublishedAt)) {
        lastPublishedAt = r.publishedAt
      }
    } else if (r.status === 'scheduled') {
      scheduled += 1
    } else {
      drafts += 1
      if (r.source === 'ai_draft') aiDraftsPending += 1
    }
  }
  return { published, drafts, scheduled, aiDraftsPending, lastPublishedAt }
}

// ── Public reads ────────────────────────────────────────────────────────────

/** Published, non-archived posts for the public site, newest first. */
export async function listPublishedPosts(
  organizationId: string,
  opts: { category?: string; limit?: number } = {},
): Promise<BlogPost[]> {
  const rows = await db
    .select()
    .from(blogPost)
    .where(
      and(
        eq(blogPost.organizationId, organizationId),
        eq(blogPost.status, 'published'),
        isNull(blogPost.archivedAt),
      ),
    )
    .orderBy(desc(blogPost.publishedAt))
  const filtered = opts.category
    ? rows.filter((r) => r.category === opts.category)
    : rows
  return opts.limit ? filtered.slice(0, opts.limit) : filtered
}

/** Distinct categories across a clinic's published posts (for the index filter). */
export async function listPublishedCategories(organizationId: string): Promise<string[]> {
  const rows = await listPublishedPosts(organizationId)
  const seen = new Set<string>()
  for (const r of rows) if (r.category) seen.add(r.category)
  return Array.from(seen).sort()
}

export async function getPublishedPostBySlug(
  organizationId: string,
  slug: string,
): Promise<BlogPost | null> {
  const [row] = await db
    .select()
    .from(blogPost)
    .where(
      and(
        eq(blogPost.organizationId, organizationId),
        eq(blogPost.slug, slug),
        eq(blogPost.status, 'published'),
        isNull(blogPost.archivedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

/** Up to `limit` other published posts to show as "Related" — same category
 * first, then most-recent fill-ins. In-memory (clinic post volumes are small). */
export async function listRelatedPosts(
  organizationId: string,
  currentPostId: string,
  category: string | null,
  limit = 3,
): Promise<BlogPost[]> {
  const all = (await listPublishedPosts(organizationId)).filter((p) => p.id !== currentPostId)
  const sameCat = category ? all.filter((p) => p.category === category) : []
  const sameCatIds = new Set(sameCat.map((p) => p.id))
  const rest = all.filter((p) => !sameCatIds.has(p.id))
  return [...sameCat, ...rest].slice(0, limit)
}

/** Resolve a post's author + medical reviewer in one staff load. Author falls
 * back to its snapshotted name if the staff entry was removed. */
export async function resolvePostPeople(
  organizationId: string,
  post: Pick<BlogPost, 'authorStaffId' | 'authorName' | 'medicallyReviewedByStaffId'>,
): Promise<{ author: ClinicStaff | null; reviewer: ClinicStaff | null }> {
  const staff = await loadStaff(organizationId)
  const byId = (id: string | null) => (id ? staff.find((s) => s.id === id) ?? null : null)
  let author = byId(post.authorStaffId)
  if (!author && post.authorName) author = { id: 'snapshot', name: post.authorName }
  return { author, reviewer: byId(post.medicallyReviewedByStaffId) }
}

/** Increment a published post's pageview counter. Called fire-and-forget from
 * a client beacon on the public post page (so SSR / bot renders don't count).
 * No-ops on drafts / archived / preview. */
export async function incrementViewCount(id: string): Promise<void> {
  await db
    .update(blogPost)
    .set({ viewCount: sql`${blogPost.viewCount} + 1` })
    .where(and(eq(blogPost.id, id), eq(blogPost.status, 'published'), isNull(blogPost.archivedAt)))
}

// ── Mutations ───────────────────────────────────────────────────────────────

/** Create an empty draft and return it — the "New post" entry point. The
 * editor then autosaves into it via updateBlogPost. */
export async function createBlankBlogPost(
  organizationId: string,
  opts: { source?: BlogPost['source'] } = {},
): Promise<BlogPost> {
  const title = 'Untitled post'
  const slug = await uniqueSlug(organizationId, title)
  const [row] = await db
    .insert(blogPost)
    .values({
      id: newId('post'),
      organizationId,
      title,
      slug,
      bodyHtml: '',
      status: 'draft',
      source: opts.source ?? 'manual',
    })
    .returning()
  return row
}

export async function updateBlogPost(
  organizationId: string,
  id: string,
  input: BlogPostInputT,
): Promise<BlogPost | null> {
  const data = BlogPostInput.parse(input)
  const current = await getBlogPost(organizationId, id)
  if (!current) return null

  const patch: Partial<typeof blogPost.$inferInsert> = { updatedAt: new Date() }

  if (data.title !== undefined) patch.title = data.title.trim() || 'Untitled post'
  // Slug: explicit slug wins; otherwise keep the existing one (we don't
  // silently re-slug on every title edit — published URLs must be stable).
  if (data.slug !== undefined && data.slug.trim()) {
    patch.slug = await uniqueSlug(organizationId, data.slug, id)
  }
  if (data.excerpt !== undefined) patch.excerpt = data.excerpt || null
  if (data.bodyHtml !== undefined) patch.bodyHtml = sanitizeBlogHtml(data.bodyHtml ?? '')
  if (data.bodyJson !== undefined) patch.bodyJson = data.bodyJson ?? null
  if (data.coverImageUrl !== undefined) patch.coverImageUrl = data.coverImageUrl || null
  if (data.coverImageAlt !== undefined) patch.coverImageAlt = data.coverImageAlt || null
  if (data.category !== undefined) patch.category = data.category || null
  if (data.tags !== undefined) patch.tags = data.tags && data.tags.length ? data.tags : null
  if (data.faq !== undefined) {
    // Drop blank rows from the editor so we don't persist or render empties.
    const cleaned = (data.faq ?? []).filter((f) => f.q?.trim() && f.a?.trim())
    patch.faq = cleaned.length ? (cleaned as BlogFaqItem[]) : null
  }
  if (data.seoTitle !== undefined) patch.seoTitle = data.seoTitle || null
  if (data.seoDescription !== undefined) patch.seoDescription = data.seoDescription || null
  if (data.source !== undefined) patch.source = data.source
  if (data.authorStaffId !== undefined) {
    patch.authorStaffId = data.authorStaffId || null
    patch.authorName = await snapshotAuthorName(organizationId, data.authorStaffId)
  }
  if (data.medicallyReviewedByStaffId !== undefined) {
    patch.medicallyReviewedByStaffId = data.medicallyReviewedByStaffId || null
    // Stamp the review time when a reviewer is set; clear it when removed.
    patch.medicallyReviewedAt = data.medicallyReviewedByStaffId
      ? current.medicallyReviewedAt ?? new Date()
      : null
  }

  const [row] = await db
    .update(blogPost)
    .set(patch)
    .where(and(eq(blogPost.id, id), eq(blogPost.organizationId, organizationId)))
    .returning()
  return row ?? null
}

export class BlogPublishError extends Error {}

/** The publish/schedule gate: a real title, body, and author byline (E-E-A-T)
 * must all be present before a post can go live or be scheduled to. */
function assertPublishable(post: BlogPost): void {
  if (!post.title.trim() || post.title === 'Untitled post') {
    throw new BlogPublishError('Give the post a title first.')
  }
  if (!post.bodyHtml || post.bodyHtml.replace(/<[^>]*>/g, '').trim().length < 1) {
    throw new BlogPublishError('Write some content first.')
  }
  if (!post.authorStaffId) {
    throw new BlogPublishError('Choose an author first — every post needs a real byline.')
  }
}

/** Flip a post live now. Enforces the gate. publishedAt is stamped once, on
 * the first publish, so re-publishing keeps the original date. */
export async function publishBlogPost(organizationId: string, id: string): Promise<BlogPost> {
  const post = await getBlogPost(organizationId, id)
  if (!post) throw new BlogPublishError('Post not found.')
  assertPublishable(post)
  const [row] = await db
    .update(blogPost)
    .set({
      status: 'published',
      publishedAt: post.publishedAt ?? new Date(),
      scheduledFor: null,
      updatedAt: new Date(),
    })
    .where(and(eq(blogPost.id, id), eq(blogPost.organizationId, organizationId)))
    .returning()
  return row
}

/** Schedule an already-review-approved post to auto-publish at a future time.
 * Enforces the same gate as publishing — unreviewed AI is never scheduled. */
export async function scheduleBlogPost(
  organizationId: string,
  id: string,
  scheduledFor: Date,
): Promise<BlogPost> {
  const post = await getBlogPost(organizationId, id)
  if (!post) throw new BlogPublishError('Post not found.')
  assertPublishable(post)
  if (!(scheduledFor instanceof Date) || Number.isNaN(scheduledFor.getTime())) {
    throw new BlogPublishError('Pick a valid date to schedule.')
  }
  if (scheduledFor.getTime() <= Date.now()) {
    throw new BlogPublishError('Pick a future date to schedule.')
  }
  const [row] = await db
    .update(blogPost)
    .set({ status: 'scheduled', scheduledFor, updatedAt: new Date() })
    .where(and(eq(blogPost.id, id), eq(blogPost.organizationId, organizationId)))
    .returning()
  return row
}

/** Pull a scheduled post back to a draft (clears the scheduled time). */
export async function unscheduleBlogPost(organizationId: string, id: string): Promise<BlogPost | null> {
  const [row] = await db
    .update(blogPost)
    .set({ status: 'draft', scheduledFor: null, updatedAt: new Date() })
    .where(and(eq(blogPost.id, id), eq(blogPost.organizationId, organizationId)))
    .returning()
  return row ?? null
}

export async function unpublishBlogPost(organizationId: string, id: string): Promise<BlogPost | null> {
  const [row] = await db
    .update(blogPost)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(and(eq(blogPost.id, id), eq(blogPost.organizationId, organizationId)))
    .returning()
  return row ?? null
}

/** Soft delete. Archived posts disappear from the dashboard and the public
 * site but stay in the table (audit + recoverability). */
export async function archiveBlogPost(organizationId: string, id: string): Promise<void> {
  await db
    .update(blogPost)
    .set({ archivedAt: new Date(), status: 'draft', scheduledFor: null, updatedAt: new Date() })
    .where(and(eq(blogPost.id, id), eq(blogPost.organizationId, organizationId)))
}

/** Turn AI topic ideas into review-gated draft stubs (title + category + the
 * angle as a starting excerpt, empty body). The clinic drafts each into a full
 * post on demand. Returns how many were created. */
export async function createTopicStubs(
  organizationId: string,
  ideas: Array<{ title: string; angle?: string | null; category?: string | null }>,
): Promise<number> {
  let created = 0
  for (const idea of ideas) {
    const title = (idea.title ?? '').trim()
    if (!title) continue
    const slug = await uniqueSlug(organizationId, title)
    await db.insert(blogPost).values({
      id: newId('post'),
      organizationId,
      title: title.slice(0, 160),
      slug,
      excerpt: idea.angle?.trim().slice(0, 400) || null,
      bodyHtml: '',
      category: idea.category?.trim().slice(0, 80) || null,
      status: 'draft',
      source: 'ai_draft',
    })
    created += 1
  }
  return created
}

/** Cron: publish every scheduled post whose time has arrived. Global (all
 * orgs). Idempotent — only flips status='scheduled' rows. */
export async function publishDueScheduledPosts(now: Date = new Date()): Promise<{ published: number }> {
  const due = await db
    .select()
    .from(blogPost)
    .where(
      and(eq(blogPost.status, 'scheduled'), isNull(blogPost.archivedAt), lte(blogPost.scheduledFor, now)),
    )
  let published = 0
  for (const p of due) {
    await db
      .update(blogPost)
      .set({ status: 'published', publishedAt: p.publishedAt ?? p.scheduledFor ?? now, updatedAt: new Date() })
      .where(eq(blogPost.id, p.id))
    published += 1
  }
  return { published }
}

// ── Starter content (onboarding + demo) ─────────────────────────────────────

export interface StarterTopic {
  slug: string
  title: string
  excerpt: string
  category: string
  bodyHtml: string
}

/**
 * Dental-tuned starter topics — evergreen, anti-shame, E-E-A-T-friendly. New
 * clinics get these as DRAFTS so the editor isn't empty (they review + add a
 * byline before publishing — we never auto-publish, the whole point vs. the
 * recycled content-library vendors). The demo seeder publishes a couple of
 * these to showcase the public surface.
 */
export const STARTER_BLOG_TOPICS: StarterTopic[] = [
  {
    slug: 'what-to-expect-at-your-first-visit',
    title: 'What to expect at your first visit',
    excerpt:
      'A calm walk-through of your first appointment with us — what we do, how long it takes, and why there is nothing to be nervous about.',
    category: 'Patient Resources',
    bodyHtml:
      '<p>If it has been a while since your last dental visit, you are not alone — and you will not get a lecture from us. We see people every day who have put off coming in, and our only goal is to help you feel comfortable and get you healthy.</p>' +
      '<h2>What happens when you arrive</h2>' +
      '<p>We start with a short conversation about your health history and anything that has been bothering you. Then we take a gentle look around, usually with a few digital X-rays so we can see what is happening below the surface.</p>' +
      '<h2>How long it takes</h2>' +
      '<p>A first visit usually runs about an hour. If you would like a cleaning the same day, let us know when you book and we will set aside the time.</p>' +
      '<p>Have a question before you come in? <strong>Call us or book online</strong> — we are happy to talk through anything first.</p>',
  },
  {
    slug: 'why-your-gums-matter',
    title: 'Why your gums matter more than you think',
    excerpt:
      'Healthy gums are the foundation of a healthy mouth. Here is what to watch for and a few simple habits that make a real difference.',
    category: 'Oral Health',
    bodyHtml:
      '<p>When most people think about their teeth, they think about cavities. But the health of your gums is just as important — and it is often the first place small problems show up.</p>' +
      '<h2>Signs worth a closer look</h2>' +
      '<ul><li>Gums that bleed when you brush or floss</li><li>Tenderness or puffiness along the gum line</li><li>Persistent bad breath that does not go away</li></ul>' +
      '<p>None of these mean anything is seriously wrong, but they are worth mentioning at your next visit.</p>' +
      '<h2>Simple habits that help</h2>' +
      '<p>Brushing twice a day and cleaning between your teeth once a day covers most of it. If flossing feels awkward, a water flosser or small interdental brushes work just as well.</p>' +
      '<p>The best way to know where your gums stand is a quick check-up — <strong>book a visit</strong> whenever you are ready.</p>',
  },
  {
    slug: 'teeth-whitening-what-actually-works',
    title: 'Teeth whitening: what actually works',
    excerpt:
      'Strips, trays, in-office treatments — a plain-spoken look at your whitening options and what to expect from each.',
    category: 'Cosmetic',
    bodyHtml:
      '<p>Whitening is one of the most common things people ask us about, and the options can be confusing. Here is the short, honest version.</p>' +
      '<h2>The main options</h2>' +
      '<ul><li><strong>Over-the-counter strips:</strong> the most affordable, and fine for mild surface stains. Results are gradual.</li><li><strong>Custom take-home trays:</strong> made to fit your teeth, so the gel stays where it should. A good middle ground.</li><li><strong>In-office whitening:</strong> the fastest, most noticeable change in a single visit.</li></ul>' +
      '<h2>A quick reality check</h2>' +
      '<p>Whitening works on natural tooth enamel — it will not change the color of fillings or crowns, and it is not meant to fix everything. Some sensitivity afterward is normal and usually fades within a day or two.</p>' +
      '<p>Not sure which option fits your smile? <strong>Book a consultation</strong> and we will talk it through together.</p>',
  },
  {
    slug: 'bringing-your-kids-to-the-dentist',
    title: 'Bringing your kids to the dentist without the tears',
    excerpt:
      'A few small things make a big difference in how children feel about the dentist. Here is what works for the families we see.',
    category: 'Kids & Family',
    bodyHtml:
      '<p>A good early experience at the dentist sets kids up for a lifetime of easier visits. The good news is that it does not take much to make the first few appointments go smoothly.</p>' +
      '<h2>Before the visit</h2>' +
      '<p>Keep the language positive and simple. Read a picture book about visiting the dentist, and try scheduling for the morning when little ones are well-rested.</p>' +
      '<h2>What we do on our end</h2>' +
      '<p>We move at the child’s pace, explain everything in friendly terms, and let them touch the tools so nothing feels like a surprise. There is never any pressure.</p>' +
      '<p>Ready to bring the family in? <strong>Book a visit</strong> and let us know it is their first time — we will take extra care.</p>',
  },
  {
    slug: 'sensitive-teeth-what-helps',
    title: 'Sensitive teeth? Here’s what actually helps',
    excerpt:
      'That zing from cold or sweet foods is common and usually manageable. Here’s what causes it and the simple things that bring relief.',
    category: 'Oral Health',
    bodyHtml:
      '<p>If a sip of iced water or a bite of ice cream makes you wince, you are far from alone — tooth sensitivity is one of the most common things we hear about, and it is usually very manageable.</p>' +
      '<h2>What’s behind it</h2>' +
      '<p>Sensitivity happens when the protective layers of a tooth wear thin or the gum line recedes, exposing the tiny channels that lead to the nerve. Common culprits are hard brushing, grinding, acidic foods, or a cracked filling.</p>' +
      '<h2>What helps</h2>' +
      '<ul><li>Switch to a soft-bristled brush and ease up on pressure</li><li>Try a sensitivity toothpaste for a few weeks</li><li>Go easy on acidic drinks, and rinse with water afterward</li></ul>' +
      '<p>If it lingers or it is sharp and sudden, it is worth a look — that can point to something we can fix quickly. <strong>Book a visit</strong> and we will get to the bottom of it.</p>',
  },
  {
    slug: 'do-you-need-a-night-guard',
    title: 'Do you grind your teeth? Signs you might need a night guard',
    excerpt:
      'Morning jaw soreness or headaches can be signs of night-time grinding. Here’s how to tell, and how a simple guard protects your smile.',
    category: 'Treatments',
    bodyHtml:
      '<p>A lot of people grind or clench their teeth at night without realizing it — often during stress. Over time it can wear teeth down, but the good news is that it is easy to protect against.</p>' +
      '<h2>Signs to watch for</h2>' +
      '<ul><li>Waking up with a sore jaw or a dull headache</li><li>Teeth that look flatter or feel more sensitive</li><li>A partner who hears grinding at night</li></ul>' +
      '<h2>How a night guard helps</h2>' +
      '<p>A custom night guard is a thin, comfortable shield that takes the force instead of your teeth. It is one of the simplest ways to prevent expensive wear down the road.</p>' +
      '<p>Not sure if you grind? Mention it at your next cleaning, or <strong>book a visit</strong> and we will check for the tell-tale signs.</p>',
  },
]

/** Seed starter DRAFTS for a clinic (onboarding + demo). Idempotent on the
 * known slugs — if a starter post already exists we leave it alone. */
export async function seedStarterBlogPosts(organizationId: string): Promise<void> {
  for (const topic of STARTER_BLOG_TOPICS) {
    const [existing] = await db
      .select({ id: blogPost.id })
      .from(blogPost)
      .where(and(eq(blogPost.organizationId, organizationId), eq(blogPost.slug, topic.slug)))
      .limit(1)
    if (existing) continue
    await db.insert(blogPost).values({
      id: newId('post'),
      organizationId,
      title: topic.title,
      slug: topic.slug,
      excerpt: topic.excerpt,
      bodyHtml: sanitizeBlogHtml(topic.bodyHtml),
      category: topic.category,
      status: 'draft',
      source: 'seed',
    })
  }
}
