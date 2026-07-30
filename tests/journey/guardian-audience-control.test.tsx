import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * THE AUDIENCE LOCK's control (Phase 4 slice 3) — the one switch in this
 * phase that decides whether the machine starts addressing customers, and
 * until round 15 the only surface with NO executed coverage at all. Two
 * rounds of copy fixes landed here on inspection alone.
 *
 * What is pinned: it never states as FACT something it only inferred from a
 * read that failed, and when it cannot tell what the lock is set to it
 * offers the SAFE direction — closing — rather than the unsafe one.
 */

const applied = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('@/app/(default)/dashboard/admin-actions', () => ({
  setGuardianAudienceAction: vi.fn(async ({ audience }: { audience: string }) => {
    applied.calls.push(audience)
    return { ok: true, message: 'saved' }
  }),
}))

import GuardianAudienceControl from '@/app/(default)/dashboard/guardian-audience-control'

beforeEach(() => {
  applied.calls = []
})

describe('GuardianAudienceControl', () => {
  it('locked: says only you hear it, and offers to open', () => {
    render(<GuardianAudienceControl audience="platform" />)
    expect(screen.getByText(/Practices are told nothing/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Let practices hear it too/ })).toBeTruthy()
  })

  it('open: says practices hear it, and offers the way back', () => {
    render(<GuardianAudienceControl audience="clinic" />)
    expect(screen.getByText(/Practices hear what they can fix/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Keep it to me instead/ })).toBeTruthy()
  })

  it('unreadable: claims nothing about what the MACHINE is doing (round-15 audit)', () => {
    // "Nothing goes to practices while I can't tell" was a claim about
    // system behaviour made from ONE page-local read — the daily cron and
    // each clinic's own note read go to the config themselves and are
    // entirely unaffected, so with the lock stored open the sweep keeps
    // writing notes while this line asserted the opposite.
    render(<GuardianAudienceControl audience="platform" unreadable />)
    expect(screen.getByText(/can’t tell you what it’s set to/)).toBeTruthy()
    expect(screen.queryByText(/Nothing goes to practices/)).toBeNull()
  })

  it('unreadable: the FAIL-SAFE stays available, and only the fail-safe', async () => {
    // Round 13 disabled the button here — and because `audience` floors to
    // 'platform' on that path, the label was "Let practices hear it too", so
    // the one action that could stop the machine talking to customers was
    // neither shown nor clickable exactly when the state was unknown.
    render(<GuardianAudienceControl audience="platform" unreadable />)
    expect(screen.queryByRole('button', { name: /Let practices hear it too/ })).toBeNull()
    const safe = screen.getByRole('button', { name: /Keep it to me instead/ })
    expect(safe.hasAttribute('disabled')).toBe(false)
    fireEvent.click(safe)
    await waitFor(() => expect(applied.calls).toEqual(['platform']))
  })

  it('opening is a two-step decision, never one click', () => {
    render(<GuardianAudienceControl audience="platform" wouldHear={3} />)
    fireEvent.click(screen.getByRole('button', { name: /Let practices hear it too/ }))
    // The confirm names how many practices have something waiting — and
    // does NOT claim they would hear it today (round-10 audit).
    expect(screen.getByText(/3 practices have something/)).toBeTruthy()
    expect(screen.queryByText(/today/)).toBeNull()
    expect(applied.calls).toEqual([])
  })
})
