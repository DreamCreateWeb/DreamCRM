import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Op {
  kind: 'insert' | 'update'
  table: string
  values?: unknown
  set?: unknown
}

const state: {
  selectQueue: unknown[][]
  ops: Op[]
} = { selectQueue: [], ops: [] }

vi.mock('@/lib/db', async () => {
  const clinic = await import('@/lib/db/schema/clinic')
  const tableName = (t: unknown) => (t === clinic.blogPost ? 'blog_post' : 'unknown')
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: (vals: unknown) => ({
          returning: async () => {
            state.ops.push({ kind: 'insert', table: tableName(t), values: vals })
            const row = Array.isArray(vals) ? vals[0] : vals
            return [{ id: 'newrow', ...(row as object) }]
          },
          then: (resolve: (v: unknown) => void) => {
            state.ops.push({ kind: 'insert', table: tableName(t), values: vals })
            resolve(undefined)
          },
        }),
      }),
      update: (t: unknown) => ({
        set: (set: unknown) => ({
          where: () => {
            const tn = tableName(t)
            return {
              returning: async () => {
                state.ops.push({ kind: 'update', table: tn, set })
                return [{ id: 'updated', ...(set as object) }]
              },
              then: (resolve: (v: unknown) => void) => {
                state.ops.push({ kind: 'update', table: tn, set })
                resolve(undefined)
              },
            }
          },
        }),
      }),
    },
  }
})

import {
  createBlankBlogPost,
  updateBlogPost,
  publishBlogPost,
  unpublishBlogPost,
  archiveBlogPost,
  listPublishedPosts,
  getPublishedPostBySlug,
  getBlogStats,
  getPostAuthor,
  listRelatedPosts,
  resolvePostPeople,
  incrementViewCount,
  seedStarterBlogPosts,
  STARTER_BLOG_TOPICS,
  BlogPublishError,
} from '@/lib/services/blog'

beforeEach(() => {
  state.selectQueue.length = 0
  state.ops.length = 0
})

const insertOp = () => state.ops.find((o) => o.kind === 'insert' && o.table === 'blog_post')
const updateOp = () => state.ops.find((o) => o.kind === 'update' && o.table === 'blog_post')

describe('createBlankBlogPost', () => {
  it('inserts a manual draft with a slug derived from the default title', async () => {
    state.selectQueue.push([]) // uniqueSlug — no collision
    await createBlankBlogPost('org_1')
    const vals = insertOp()!.values as { slug: string; status: string; source: string; organizationId: string }
    expect(vals.slug).toBe('untitled-post')
    expect(vals.status).toBe('draft')
    expect(vals.source).toBe('manual')
    expect(vals.organizationId).toBe('org_1')
  })

  it('appends -2 to the slug when "untitled-post" is taken', async () => {
    state.selectQueue.push([{ id: 'existing' }]) // first slug taken
    state.selectQueue.push([]) // -2 free
    await createBlankBlogPost('org_1')
    expect((insertOp()!.values as { slug: string }).slug).toBe('untitled-post-2')
  })

  it('records the requested source (ai_draft)', async () => {
    state.selectQueue.push([])
    await createBlankBlogPost('org_1', { source: 'ai_draft' })
    expect((insertOp()!.values as { source: string }).source).toBe('ai_draft')
  })
})

describe('updateBlogPost', () => {
  const current = {
    id: 'post_1',
    organizationId: 'org_1',
    title: 'T',
    slug: 's',
    bodyHtml: '',
    status: 'draft',
    source: 'manual',
    authorStaffId: null,
    authorName: null,
    publishedAt: null,
  }

  it('sanitizes bodyHtml before persisting', async () => {
    state.selectQueue.push([current]) // getBlogPost
    await updateBlogPost('org_1', 'post_1', { bodyHtml: '<p>safe</p><script>bad()</script>' })
    const set = updateOp()!.set as { bodyHtml: string; updatedAt: Date }
    expect(set.bodyHtml).toContain('<p>safe</p>')
    expect(set.bodyHtml).not.toContain('script')
    expect(set.updatedAt).toBeInstanceOf(Date)
  })

  it('re-uniquifies an explicit slug change', async () => {
    state.selectQueue.push([current]) // getBlogPost
    state.selectQueue.push([]) // uniqueSlug free
    await updateBlogPost('org_1', 'post_1', { slug: 'new-url' })
    expect((updateOp()!.set as { slug: string }).slug).toBe('new-url')
  })

  it('snapshots the author name from the clinic staff list', async () => {
    state.selectQueue.push([current]) // getBlogPost
    state.selectQueue.push([{ staff: [{ id: 'p1', name: 'Dr. Reyes', title: 'Dentist' }] }]) // loadStaff
    await updateBlogPost('org_1', 'post_1', { authorStaffId: 'p1' })
    const set = updateOp()!.set as { authorStaffId: string; authorName: string }
    expect(set.authorStaffId).toBe('p1')
    expect(set.authorName).toBe('Dr. Reyes')
  })

  it('returns null when the post does not exist', async () => {
    state.selectQueue.push([]) // getBlogPost — not found
    expect(await updateBlogPost('org_1', 'missing', { title: 'X' })).toBeNull()
  })
})

describe('publishBlogPost (the clinician-review gate)', () => {
  const base = {
    id: 'post_1',
    title: 'A real title',
    bodyHtml: '<p>Real content here.</p>',
    authorStaffId: 'p1',
    publishedAt: null,
  }

  it('refuses an untitled post', async () => {
    state.selectQueue.push([{ ...base, title: 'Untitled post' }])
    await expect(publishBlogPost('org_1', 'post_1')).rejects.toBeInstanceOf(BlogPublishError)
  })

  it('refuses an empty body', async () => {
    state.selectQueue.push([{ ...base, bodyHtml: '<p></p>' }])
    await expect(publishBlogPost('org_1', 'post_1')).rejects.toThrow(/content/i)
  })

  it('refuses a post with no author byline', async () => {
    state.selectQueue.push([{ ...base, authorStaffId: null }])
    await expect(publishBlogPost('org_1', 'post_1')).rejects.toThrow(/author/i)
  })

  it('publishes and stamps publishedAt when the gate passes', async () => {
    state.selectQueue.push([base])
    await publishBlogPost('org_1', 'post_1')
    const set = updateOp()!.set as { status: string; publishedAt: Date }
    expect(set.status).toBe('published')
    expect(set.publishedAt).toBeInstanceOf(Date)
  })

  it('keeps the original publishedAt on re-publish', async () => {
    const original = new Date('2025-01-01T00:00:00Z')
    state.selectQueue.push([{ ...base, publishedAt: original }])
    await publishBlogPost('org_1', 'post_1')
    expect((updateOp()!.set as { publishedAt: Date }).publishedAt).toEqual(original)
  })
})

describe('unpublish + archive', () => {
  it('unpublish flips status back to draft', async () => {
    await unpublishBlogPost('org_1', 'post_1')
    expect((updateOp()!.set as { status: string }).status).toBe('draft')
  })

  it('archive soft-deletes via archivedAt', async () => {
    await archiveBlogPost('org_1', 'post_1')
    const set = updateOp()!.set as { archivedAt: Date }
    expect(set.archivedAt).toBeInstanceOf(Date)
  })
})

describe('listPublishedPosts', () => {
  const rows = [
    { id: '1', category: 'Oral Health', status: 'published' },
    { id: '2', category: 'Cosmetic', status: 'published' },
    { id: '3', category: 'Oral Health', status: 'published' },
  ]

  it('returns all published posts when no filter is given', async () => {
    state.selectQueue.push(rows)
    expect((await listPublishedPosts('org_1')).length).toBe(3)
  })

  it('filters by category in memory', async () => {
    state.selectQueue.push(rows)
    const out = await listPublishedPosts('org_1', { category: 'Oral Health' })
    expect(out.map((r) => r.id)).toEqual(['1', '3'])
  })

  it('respects the limit', async () => {
    state.selectQueue.push(rows)
    expect((await listPublishedPosts('org_1', { limit: 2 })).length).toBe(2)
  })
})

describe('getPublishedPostBySlug', () => {
  it('returns the matching post', async () => {
    state.selectQueue.push([{ id: 'p1', slug: 'hello' }])
    expect((await getPublishedPostBySlug('org_1', 'hello'))?.id).toBe('p1')
  })

  it('returns null when there is no published match', async () => {
    state.selectQueue.push([])
    expect(await getPublishedPostBySlug('org_1', 'nope')).toBeNull()
  })
})

describe('getBlogStats', () => {
  it('counts published / drafts / pending AI drafts and finds the latest publish', async () => {
    const d1 = new Date('2025-03-01T00:00:00Z')
    const d2 = new Date('2025-05-01T00:00:00Z')
    state.selectQueue.push([
      { status: 'published', source: 'manual', publishedAt: d1 },
      { status: 'published', source: 'seed', publishedAt: d2 },
      { status: 'draft', source: 'ai_draft', publishedAt: null },
      { status: 'draft', source: 'manual', publishedAt: null },
    ])
    const stats = await getBlogStats('org_1')
    expect(stats.published).toBe(2)
    expect(stats.drafts).toBe(2)
    expect(stats.aiDraftsPending).toBe(1)
    expect(stats.lastPublishedAt).toEqual(d2)
  })
})

describe('getPostAuthor', () => {
  it('resolves the full staff record (name/title/bio) by id', async () => {
    state.selectQueue.push([
      { staff: [{ id: 'p1', name: 'Dr. Reyes', title: 'Dentist', bio: '15 years' }] },
    ])
    const author = await getPostAuthor('org_1', { authorStaffId: 'p1', authorName: 'stale' })
    expect(author?.name).toBe('Dr. Reyes')
    expect(author?.title).toBe('Dentist')
  })

  it('falls back to the snapshot name when the staff entry is gone', async () => {
    state.selectQueue.push([{ staff: [] }])
    const author = await getPostAuthor('org_1', { authorStaffId: 'p1', authorName: 'Dr. Removed' })
    expect(author?.name).toBe('Dr. Removed')
  })

  it('returns the snapshot without a DB read when there is no staff id', async () => {
    const author = await getPostAuthor('org_1', { authorStaffId: null, authorName: 'Guest' })
    expect(author?.name).toBe('Guest')
    expect(state.ops.length).toBe(0)
  })
})

describe('seedStarterBlogPosts', () => {
  it('seeds every starter topic as a draft when none exist', async () => {
    // All existence checks return empty → every topic is inserted.
    await seedStarterBlogPosts('org_1')
    const inserts = state.ops.filter((o) => o.kind === 'insert' && o.table === 'blog_post')
    expect(inserts.length).toBe(STARTER_BLOG_TOPICS.length)
    const first = inserts[0].values as { status: string; source: string; slug: string }
    expect(first.status).toBe('draft')
    expect(first.source).toBe('seed')
    expect(first.slug).toBe(STARTER_BLOG_TOPICS[0].slug)
  })

  it('is idempotent — skips topics whose slug already exists', async () => {
    for (let i = 0; i < STARTER_BLOG_TOPICS.length; i++) {
      state.selectQueue.push([{ id: `existing-${i}` }])
    }
    await seedStarterBlogPosts('org_1')
    expect(state.ops.filter((o) => o.kind === 'insert').length).toBe(0)
  })
})

describe('listRelatedPosts', () => {
  const rows = [
    { id: '1', category: 'Oral Health' },
    { id: '2', category: 'Cosmetic' },
    { id: '3', category: 'Oral Health' },
    { id: 'cur', category: 'Oral Health' },
  ]

  it('excludes the current post, same category first then recent fill-ins', async () => {
    state.selectQueue.push(rows)
    const out = await listRelatedPosts('org_1', 'cur', 'Oral Health', 3)
    expect(out.map((r) => r.id)).toEqual(['1', '3', '2'])
  })

  it('respects the limit', async () => {
    state.selectQueue.push(rows)
    const out = await listRelatedPosts('org_1', 'cur', 'Oral Health', 1)
    expect(out.map((r) => r.id)).toEqual(['1'])
  })
})

describe('resolvePostPeople', () => {
  const staffRow = [
    { staff: [{ id: 'p1', name: 'Dr. Reyes', title: 'Dentist' }, { id: 'p3', name: 'Maria', title: 'RDH' }] },
  ]

  it('resolves author + medical reviewer from the staff list', async () => {
    state.selectQueue.push(staffRow)
    const { author, reviewer } = await resolvePostPeople('org_1', {
      authorStaffId: 'p3',
      authorName: 'Maria',
      medicallyReviewedByStaffId: 'p1',
    })
    expect(author?.name).toBe('Maria')
    expect(reviewer?.name).toBe('Dr. Reyes')
  })

  it('falls back to the author snapshot, no reviewer when unset', async () => {
    state.selectQueue.push([{ staff: [] }])
    const { author, reviewer } = await resolvePostPeople('org_1', {
      authorStaffId: 'gone',
      authorName: 'Dr. Removed',
      medicallyReviewedByStaffId: null,
    })
    expect(author?.name).toBe('Dr. Removed')
    expect(reviewer).toBeNull()
  })
})

describe('incrementViewCount', () => {
  it('issues a scoped update on blog_post', async () => {
    await incrementViewCount('post_1')
    expect(updateOp()).toBeDefined()
  })
})

describe('updateBlogPost — medical reviewer', () => {
  const current = {
    id: 'post_1',
    organizationId: 'org_1',
    title: 'T',
    slug: 's',
    bodyHtml: '',
    status: 'draft',
    source: 'manual',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedAt: null,
  }

  it('sets the reviewer + stamps medicallyReviewedAt', async () => {
    state.selectQueue.push([current]) // getBlogPost
    await updateBlogPost('org_1', 'post_1', { medicallyReviewedByStaffId: 'p1' })
    const set = updateOp()!.set as { medicallyReviewedByStaffId: string; medicallyReviewedAt: Date }
    expect(set.medicallyReviewedByStaffId).toBe('p1')
    expect(set.medicallyReviewedAt).toBeInstanceOf(Date)
  })

  it('clears the reviewer + timestamp when removed', async () => {
    state.selectQueue.push([{ ...current, medicallyReviewedAt: new Date() }])
    await updateBlogPost('org_1', 'post_1', { medicallyReviewedByStaffId: '' })
    const set = updateOp()!.set as { medicallyReviewedByStaffId: string | null; medicallyReviewedAt: Date | null }
    expect(set.medicallyReviewedByStaffId).toBeNull()
    expect(set.medicallyReviewedAt).toBeNull()
  })
})
