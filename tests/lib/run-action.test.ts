/**
 * lib/run-action.ts — THE ONE WRAPPER a client component awaits a server
 * action through (promoted from the Studio 2026-10-26). A thrown action
 * becomes a result; the redeploy case is marked `stale` and carries the
 * dashboard-wide refresh line unless the host binds its own.
 */
import { describe, it, expect } from 'vitest'
import { isStaleFailure, runAction } from '@/lib/run-action'
import { runAction as studioRunAction } from '@/app/(default)/website/editor/run-action'
import { ACTION_FAILED_MESSAGE, STALE_APP_MESSAGE, STALE_STUDIO_MESSAGE } from '@/lib/deployment-skew'

const SKEW = 'Failed to find Server Action "abc". This request might be from an older or newer deployment.'

describe('runAction (the shared home)', () => {
  it('passes a resolved result through untouched, refusals included', async () => {
    const ok = await runAction(async () => ({ ok: true as const, more: 1 }))
    expect(ok).toEqual({ ok: true, more: 1 })
    const refused = await runAction(async () => ({ ok: false as const, error: 'Too long' }))
    expect(refused).toEqual({ ok: false, error: 'Too long' })
    expect(isStaleFailure(refused)).toBe(false)
  })

  it('turns the redeploy throw into a stale failure with the DASHBOARD line by default', async () => {
    const res = await runAction(async () => {
      throw new Error(SKEW)
    })
    expect(res).toEqual({ ok: false, error: STALE_APP_MESSAGE, stale: true })
    expect(isStaleFailure(res)).toBe(true)
  })

  it('lets a host bind its own stale line (the Studio mentions the open field)', async () => {
    const res = await runAction(
      async () => {
        throw new Error(SKEW)
      },
      { staleMessage: 'Custom stale line' },
    )
    expect(res).toEqual({ ok: false, error: 'Custom stale line', stale: true })
  })

  it('turns any other throw into a plain failure, never stale', async () => {
    const res = await runAction(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(res).toEqual({ ok: false, error: ACTION_FAILED_MESSAGE })
    expect(isStaleFailure(res)).toBe(false)
  })

  it('reads the digest too — the server-thrown shape of the same refusal', async () => {
    const res = await runAction(async () => {
      throw Object.assign(new Error('An error occurred in the Server Components render.'), { digest: SKEW })
    })
    expect(isStaleFailure(res)).toBe(true)
  })
})

describe('the Studio door onto it', () => {
  it('is the shared wrapper with the Studio copy bound — not a second implementation', async () => {
    const res = await studioRunAction(async () => {
      throw new Error(SKEW)
    })
    expect(res).toEqual({ ok: false, error: STALE_STUDIO_MESSAGE, stale: true })
    const plain = await studioRunAction(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(plain).toEqual({ ok: false, error: ACTION_FAILED_MESSAGE })
  })
})
