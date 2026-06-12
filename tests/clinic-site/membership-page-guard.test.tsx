/**
 * Guards for the /membership page. Wave 4 deduped it into /dental-plans: the
 * page now 308s (permanentRedirect) to `{basePath}/dental-plans` so the two
 * URLs converge on one canonical page. The original guard intent — a visitor
 * never sees a broken/empty membership form on /membership — is now satisfied
 * by always sending them to the canonical page (which carries its own
 * membership-enabled + zero-plans 404 guards). MembershipJoin + the checkout
 * action stay in this folder; /dental-plans imports them.
 */
import { describe, it, expect, vi } from 'vitest'

const permanentRedirectError = new Error('NEXT_REDIRECT')
const permanentRedirectMock = vi.fn((_url: string): never => {
  throw permanentRedirectError
})
vi.mock('next/navigation', () => ({
  permanentRedirect: (url: string) => permanentRedirectMock(url),
}))

vi.mock('@/lib/services/clinic-site', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/clinic-site')>(
    '@/lib/services/clinic-site',
  )
  return {
    ...actual,
    resolveSiteBasePath: vi.fn(async () => '/site/acme-dental'),
  }
})

import ClinicMembershipPage from '@/app/site/[slug]/membership/page'
import { resolveSiteBasePath } from '@/lib/services/clinic-site'

describe('ClinicMembershipPage (deduped → /dental-plans)', () => {
  it('308s to {basePath}/dental-plans', async () => {
    permanentRedirectMock.mockClear()
    await expect(
      ClinicMembershipPage({ params: Promise.resolve({ slug: 'acme-dental' }) }),
    ).rejects.toThrow(permanentRedirectError)
    expect(permanentRedirectMock).toHaveBeenCalledWith('/site/acme-dental/dental-plans')
  })

  it('preserves the resolved base path (subdomain mode → root-relative)', async () => {
    permanentRedirectMock.mockClear()
    ;(resolveSiteBasePath as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('')
    await expect(
      ClinicMembershipPage({ params: Promise.resolve({ slug: 'acme-dental' }) }),
    ).rejects.toThrow(permanentRedirectError)
    expect(permanentRedirectMock).toHaveBeenCalledWith('/dental-plans')
  })
})
