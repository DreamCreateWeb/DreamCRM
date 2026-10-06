import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

/**
 * THE DOOR (docs/ACTIVATION.md law 1 + 2, S3). FeatureGate: other tenants
 * pass through; a clinic with the switch off meets the intro — one button
 * for an owner/admin, a sentence for a member — and the button calls the
 * action then refreshes; with the switch on the page renders plus the
 * "Turn off" line on the module's root path only, confirmed BEFORE the
 * transition.
 */

const nav = { pathname: '/my-day' }
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => nav.pathname,
}))
const ctxState = { ctx: null as null | Record<string, unknown> }
vi.mock('@/lib/auth/context', () => ({ getTenantContext: async () => ctxState.ctx }))
const switches = { state: {} as Record<string, boolean> }
vi.mock('@/lib/services/feature-switches', async () => {
  const { ALL_OFF } = await import('@/lib/feature-switches')
  return { getFeatureSwitchState: async () => ({ ...ALL_OFF, ...switches.state }) }
})
const enableFeatureAction = vi.fn(async () => ({ ok: true as const }))
const disableFeatureAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/(default)/feature-switch-actions', () => ({
  enableFeatureAction: (...a: unknown[]) => enableFeatureAction(...(a as [])),
  disableFeatureAction: (...a: unknown[]) => disableFeatureAction(...(a as [])),
}))
const confirm = vi.fn(async () => true)
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirmSafe: () => confirm }))

import FeatureGate from '@/components/feature-switch/feature-gate'
import { FEATURE_BY_KEY } from '@/lib/feature-switches'

const clinic = (role: string) => ({ tenantType: 'clinic', role, organizationId: 'org_a', organizationName: 'Dream Dental' })

beforeEach(() => {
  nav.pathname = '/my-day'
  ctxState.ctx = clinic('owner')
  switches.state = {}
  refresh.mockClear()
  enableFeatureAction.mockClear()
  disableFeatureAction.mockClear()
  confirm.mockClear()
})

async function renderGate(feature: 'my_day' | 'growth' = 'my_day') {
  const el = await FeatureGate({ feature, children: <p data-testid="page">the page</p> })
  return render(el)
}

describe('FeatureGate', () => {
  it('passes other tenants straight through', async () => {
    ctxState.ctx = { tenantType: 'platform', role: 'owner', organizationId: 'org_p', organizationName: 'Dream Create' }
    await renderGate('growth')
    expect(screen.getByTestId('page')).toBeInTheDocument()
    expect(screen.queryByTestId('feature-intro')).toBeNull()
  })

  it('off: the intro with the registry copy, the section eyebrow, and ONE button for an owner', async () => {
    await renderGate()
    expect(screen.queryByTestId('page')).toBeNull()
    const intro = screen.getByTestId('feature-intro')
    expect(intro).toHaveAttribute('data-feature', 'my_day')
    for (const line of FEATURE_BY_KEY.my_day.does) expect(screen.getByText(line)).toBeInTheDocument()
    expect(screen.getByText('Daily · Dream Dental')).toBeInTheDocument()
    expect(screen.getByText('Not turned on')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: 'Turn on My Day' })
    fireEvent.click(btn)
    await waitFor(() => expect(enableFeatureAction).toHaveBeenCalledWith('my_day'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('off: a member reads who can turn it on, with no button', async () => {
    ctxState.ctx = clinic('member')
    await renderGate()
    expect(screen.queryByRole('button', { name: /Turn on/ })).toBeNull()
    expect(screen.getByText('An owner or admin can turn this on.')).toBeInTheDocument()
  })

  it('off: a refused action renders its reason inline', async () => {
    enableFeatureAction.mockResolvedValueOnce({ ok: false, error: 'Only an owner or admin can change what is turned on.' } as never)
    await renderGate()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on My Day' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only an owner or admin')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('on: the page renders with the "Turn off" line on the root path, confirmed before the action', async () => {
    switches.state = { my_day: true }
    await renderGate()
    expect(screen.getByTestId('page')).toBeInTheDocument()
    expect(screen.queryByTestId('feature-intro')).toBeNull()
    const off = screen.getByRole('button', { name: 'Turn off My Day' })
    fireEvent.click(off)
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    await waitFor(() => expect(disableFeatureAction).toHaveBeenCalledWith('my_day'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('on: a declined confirm changes nothing; a sub-page carries no "Turn off" line; a member sees none', async () => {
    switches.state = { my_day: true }
    confirm.mockResolvedValueOnce(false)
    await renderGate()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off My Day' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(disableFeatureAction).not.toHaveBeenCalled()

    cleanup()
    nav.pathname = '/my-day/anything'
    await renderGate()
    expect(screen.getByTestId('page')).toBeInTheDocument()
    expect(screen.queryByTestId('feature-footer')).toBeNull()

    cleanup()
    nav.pathname = '/my-day'
    ctxState.ctx = clinic('member')
    await renderGate()
    expect(screen.queryByTestId('feature-footer')).toBeNull()
  })
})

describe('FeatureGate — the intro slot (S5)', () => {
  it('off + a door of its own → renders that door instead of the generic card; on → the page', async () => {
    const el = await FeatureGate({ feature: 'growth', intro: <p data-testid="own-door">the growth door</p>, children: <p data-testid="page">page</p> })
    render(el)
    expect(screen.getByTestId('own-door')).toBeInTheDocument()
    expect(screen.queryByTestId('feature-intro')).toBeNull()
    expect(screen.queryByTestId('page')).toBeNull()
    cleanup()
    switches.state = { growth: true }
    render(await FeatureGate({ feature: 'growth', intro: <p data-testid="own-door">x</p>, children: <p data-testid="page">page</p> }))
    expect(screen.getByTestId('page')).toBeInTheDocument()
    expect(screen.queryByTestId('own-door')).toBeNull()
  })
})
