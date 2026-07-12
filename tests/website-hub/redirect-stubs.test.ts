/**
 * The fold-in redirect stubs (Phase C) — every old dashboard path 308s to its
 * new Website-workspace home, with params forwarded where the old links
 * carried meaning (`?ai=1` on post deep links, the GSC OAuth round-trip
 * params on /seo). Route-level stubs, NEVER next.config redirects: config
 * redirects run before middleware's subdomain rewrite and would hijack the
 * PUBLIC clinic sites' /careers + /blog pages.
 *
 * (Asserted via try/catch on the sentinel the mocked permanentRedirect
 * throws — `expect(...).toThrow` re-invokes mocks in a way that confuses the
 * spy's recorded calls under the global clearAllMocks setup.)
 */
import { describe, it, expect, vi } from 'vitest'

const { permanentRedirectMock } = vi.hoisted(() => ({
  permanentRedirectMock: vi.fn((to: string) => {
    throw new Error(`308:${to}`)
  }),
}))
vi.mock('next/navigation', () => ({ permanentRedirect: permanentRedirectMock }))

import PostsRedirect from '@/app/(default)/posts/page'
import PostsCalendarRedirect from '@/app/(default)/posts/calendar/page'
import PostRedirect from '@/app/(default)/posts/[id]/page'
import PostPreviewRedirect from '@/app/(default)/posts/[id]/preview/page'
import SeoRedirect from '@/app/(default)/seo/page'
import SettingsSeoRedirect from '@/app/(default)/settings/seo/page'
import CareersRedirect from '@/app/(default)/careers/page'
import CareersNewRedirect from '@/app/(default)/careers/new/page'
import CareerRoleRedirect from '@/app/(default)/careers/[id]/page'
import JobsRedirect from '@/app/(default)/jobs/page'

const p = <T,>(v: T) => Promise.resolve(v)

/** Run a stub and return the 308 sentinel it threw. */
function target(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return (e as Error).message
  }
  return '(did not redirect)'
}
async function targetAsync(pr: Promise<unknown>): Promise<string> {
  try {
    await pr
  } catch (e) {
    return (e as Error).message
  }
  return '(did not redirect)'
}

describe('fold-in 308 stubs', () => {
  it('/posts → /website/blog', () => {
    expect(target(() => PostsRedirect())).toBe('308:/website/blog')
  })
  it('/posts/calendar → /website/blog/calendar', () => {
    expect(target(() => PostsCalendarRedirect())).toBe('308:/website/blog/calendar')
  })
  it('/posts/[id] → /website/blog/[id], forwarding ?ai=1', async () => {
    expect(
      await targetAsync(PostRedirect({ params: p({ id: 'post_1' }), searchParams: p({ ai: '1' }) })),
    ).toBe('308:/website/blog/post_1?ai=1')
    expect(
      await targetAsync(PostRedirect({ params: p({ id: 'post_1' }), searchParams: p({}) })),
    ).toBe('308:/website/blog/post_1')
  })
  it('/posts/[id]/preview → /website/blog/[id]/preview', async () => {
    expect(await targetAsync(PostPreviewRedirect({ params: p({ id: 'post_9' }) }))).toBe(
      '308:/website/blog/post_9/preview',
    )
  })
  it('/seo → /website/seo, forwarding the GSC OAuth params', async () => {
    expect(await targetAsync(SeoRedirect({ searchParams: p({ gscConnected: '1' }) }))).toBe(
      '308:/website/seo?gscConnected=1',
    )
    expect(await targetAsync(SeoRedirect({ searchParams: p({}) }))).toBe('308:/website/seo')
  })
  it('/settings/seo → /website/pages (search appearance lives with Pages now)', () => {
    expect(target(() => SettingsSeoRedirect())).toBe('308:/website/pages')
  })
  it('/careers, /careers/new, /careers/[id] → /website/careers…', async () => {
    expect(target(() => CareersRedirect())).toBe('308:/website/careers')
    expect(target(() => CareersNewRedirect())).toBe('308:/website/careers/new')
    expect(await targetAsync(CareerRoleRedirect({ params: p({ id: 'job_3' }) }))).toBe(
      '308:/website/careers/job_3',
    )
  })
  it('/jobs (legacy) goes straight to /website/careers — no double hop', () => {
    expect(target(() => JobsRedirect())).toBe('308:/website/careers')
  })
})
