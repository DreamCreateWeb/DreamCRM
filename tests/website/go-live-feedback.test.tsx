import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * THE GO-LIVE LEVER HAS TO TELL THE TRUTH IN BOTH DIRECTIONS.
 *
 * Two defects, both found in a real browser (e2e/go-live.spec.ts's header
 * records the measurements) and both about a UI that knew something and did
 * not say it:
 *
 * 1. "Going live…" for up to SIXTY SECONDS after the site was already live.
 *    `router.refresh()` was called inside the same async `startTransition`
 *    callback that awaited the action. The router opens a transition of its
 *    own, and nesting it inside one still waiting on it starved it — measured
 *    twice with no `GET /website` going out at all in that window, while the
 *    public site had been serving for real since ~300ms in. Sometimes it
 *    landed instantly, which is worse than a consistent stall: the one thing
 *    a clinic reliably does with a button that looks stuck is press it again,
 *    and this is the button that publishes their website.
 *
 * 2. "Take site offline" could not fail. `TakeOfflineLink` never read its
 *    action's result — a refusal or a database error closed the confirm and
 *    left the control looking exactly like a success. A deliberate-breakage
 *    run found the site still serving with the hub reporting nothing. Telling
 *    a practice their site is hidden when it is still public is the worst
 *    lie this surface can tell.
 *
 * These are rendering tests, not source scans, because both bugs were about
 * WHEN state reached the screen — a grep for `router.refresh` would have
 * passed on the broken version.
 */

const refresh = vi.fn()
const goLiveAction = vi.fn()
const takeSiteOfflineAction = vi.fn()

// Next's own useRouter returns a STABLE object across renders; the double has
// to as well, or an effect keyed on it re-fires every render for reasons that
// exist only in the test.
const routerStub = { refresh, push: vi.fn(), replace: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => routerStub }))
vi.mock('@/app/(default)/website/go-live-actions', () => ({
  goLiveAction: (...args: unknown[]) => goLiveAction(...args),
  takeSiteOfflineAction: (...args: unknown[]) => takeSiteOfflineAction(...args),
}))

// The component imports its actions by relative path; map that to the same
// module id the mock above registers.
vi.mock('./go-live-actions', () => ({
  goLiveAction: (...args: unknown[]) => goLiveAction(...args),
  takeSiteOfflineAction: (...args: unknown[]) => takeSiteOfflineAction(...args),
}))

const CARD_PROPS = {
  siteHost: 'brightsmile.dreamcreatestudio.com',
  attention: [],
  openRequired: [],
  waiting: [],
}

async function loadCard() {
  return await import('@/app/(default)/website/go-live-card')
}

beforeEach(() => {
  refresh.mockReset()
  goLiveAction.mockReset()
  takeSiteOfflineAction.mockReset()
})
afterEach(cleanup)

describe('Go live says the site is live as soon as it IS live', () => {
  it('replaces the card with a live confirmation without waiting on a refresh', async () => {
    // The refresh never resolves anything here — exactly the starved case.
    // The clinic must still be told, because the action already succeeded.
    goLiveAction.mockResolvedValue({ ok: true })
    const { default: GoLiveCard } = await loadCard()
    const user = userEvent.setup()

    render(<GoLiveCard {...CARD_PROPS} />)
    await user.click(screen.getByRole('button', { name: 'Go live' }))
    await user.click(screen.getByRole('button', { name: 'Yes — put my site online' }))

    const live = await screen.findByRole('status')
    expect(live).toHaveTextContent('Your site is online.')
    expect(live).toHaveTextContent('brightsmile.dreamcreatestudio.com')

    // And the stuck label is gone rather than sitting there.
    expect(screen.queryByText('Going live…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /put my site online/ })).not.toBeInTheDocument()
  })

  it('still schedules the refresh, so the hub catches up on its own', async () => {
    goLiveAction.mockResolvedValue({ ok: true })
    const { default: GoLiveCard } = await loadCard()
    const user = userEvent.setup()

    render(<GoLiveCard {...CARD_PROPS} />)
    await user.click(screen.getByRole('button', { name: 'Go live' }))
    await user.click(screen.getByRole('button', { name: 'Yes — put my site online' }))

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('a refused pull says why and does NOT claim the site is live', async () => {
    goLiveAction.mockResolvedValue({
      ok: false,
      error: 'Only owners and admins can change whether the site is live',
    })
    const { default: GoLiveCard } = await loadCard()
    const user = userEvent.setup()

    render(<GoLiveCard {...CARD_PROPS} />)
    await user.click(screen.getByRole('button', { name: 'Go live' }))
    await user.click(screen.getByRole('button', { name: 'Yes — put my site online' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only owners and admins can change whether the site is live',
    )
    expect(screen.queryByText('Your site is online.')).not.toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('Take site offline reports its failures', () => {
  it('a failed take-offline says so, and says the site is STILL LIVE', async () => {
    takeSiteOfflineAction.mockResolvedValue({
      ok: false,
      error: 'Could not take the site offline — try again',
    })
    const { TakeOfflineLink } = await loadCard()
    const user = userEvent.setup()

    render(<TakeOfflineLink />)
    await user.click(screen.getByRole('button', { name: /Take site offline/ }))
    await user.click(screen.getByRole('button', { name: 'Take it offline' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not take the site offline')
    // The half that matters: not just "an error happened", but what is
    // actually true about the clinic's public site right now.
    expect(alert).toHaveTextContent('your site is still live')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('offers a way back in after a failure', async () => {
    takeSiteOfflineAction.mockResolvedValue({ ok: false, error: 'Nope' })
    const { TakeOfflineLink } = await loadCard()
    const user = userEvent.setup()

    render(<TakeOfflineLink />)
    await user.click(screen.getByRole('button', { name: /Take site offline/ }))
    await user.click(screen.getByRole('button', { name: 'Take it offline' }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('button', { name: 'Take it offline' })).toBeInTheDocument()
  })

  it('a successful take-offline refreshes the hub', async () => {
    takeSiteOfflineAction.mockResolvedValue({ ok: true })
    const { TakeOfflineLink } = await loadCard()
    const user = userEvent.setup()

    render(<TakeOfflineLink />)
    await user.click(screen.getByRole('button', { name: /Take site offline/ }))
    await user.click(screen.getByRole('button', { name: 'Take it offline' }))

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
