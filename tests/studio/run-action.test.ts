/**
 * The Studio's one wrapper around every awaited server action
 * (app/(default)/website/editor/run-action.ts): a thrown action becomes a
 * result, and the redeploy case is marked so the host can offer a refresh.
 */
import { describe, it, expect } from 'vitest'
import { isStaleFailure, runAction } from '@/app/(default)/website/editor/run-action'
import { ACTION_FAILED_MESSAGE, STALE_STUDIO_MESSAGE } from '@/lib/deployment-skew'

describe('runAction', () => {
  it('passes a resolved result through untouched', async () => {
    const ok = await runAction(async () => ({ ok: true as const, more: 1 }))
    expect(ok).toEqual({ ok: true, more: 1 })
    const refused = await runAction(async () => ({ ok: false as const, error: 'Too long' }))
    expect(refused).toEqual({ ok: false, error: 'Too long' })
    expect(isStaleFailure(refused)).toBe(false)
  })

  it('turns the redeploy throw into a stale failure with the refresh copy', async () => {
    const res = await runAction(async () => {
      throw new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.')
    })
    expect(res).toEqual({ ok: false, error: STALE_STUDIO_MESSAGE, stale: true })
    expect(isStaleFailure(res)).toBe(true)
  })

  it('turns any other throw into a plain failure, never stale', async () => {
    const res = await runAction(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(res).toEqual({ ok: false, error: ACTION_FAILED_MESSAGE })
    expect(isStaleFailure(res)).toBe(false)
  })
})
