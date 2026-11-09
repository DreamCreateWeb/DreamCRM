import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * GROWTH PAGES KNOW WHEN THE DREAM TEAM ALREADY DID THE WORK (ML-36, G3-15).
 * ONE read (`teamDidIt`) over the open proposals + the ledger, narrowed to
 * the lanes a page fronts; a quiet band above the manual controls; absent
 * when there is nothing to say.
 */

vi.mock('server-only', () => ({}))
const ledger = vi.hoisted(() => ({
  entries: [] as Array<{ patientId: string | null; summary: string; detail: unknown }>,
  open: 0,
  asked: [] as unknown[],
}))
vi.mock('@/lib/services/action-ledger', () => ({
  isWorkEntry: (d: unknown) => !(d && typeof d === 'object' && (d as Record<string, unknown>).notWork === true),
  listRecentActions: vi.fn(async (_org: string, opts: unknown) => {
    ledger.asked.push(opts)
    return ledger.entries
  }),
}))
vi.mock('@/lib/services/proposals', () => ({
  countOpenProposals: vi.fn(async (_org: string, opts: unknown) => {
    ledger.asked.push(opts)
    return ledger.open
  }),
}))

import { teamDidIt } from '@/lib/services/team-did-it'
import { TeamDidItBand } from '@/components/ui/team-did-it-band'
import { GROWTH_HUB_LANES, OUTREACH_LANES, REVIEWS_LANES, SOCIAL_LANES } from '@/lib/team-did-it-lanes'
import { CAPABILITIES } from '@/lib/autonomy'

beforeEach(() => {
  ledger.entries = []
  ledger.open = 0
  ledger.asked = []
})

describe('teamDidIt', () => {
  it('counts distinct PEOPLE, not ledger rows, and ignores non-work entries', async () => {
    ledger.entries = [
      { patientId: 'a', summary: 'Asked Maya for a review', detail: {} },
      { patientId: 'a', summary: 'Asked Maya again', detail: {} },
      { patientId: 'b', summary: 'Asked Sam for a review', detail: {} },
      { patientId: null, summary: 'Published a post', detail: {} },
      { patientId: 'c', summary: 'I couldn’t', detail: { notWork: true } },
    ]
    ledger.open = 2
    const r = await teamDidIt('org_1', REVIEWS_LANES.capabilities, { timeZone: 'America/Chicago' })
    expect(r).toEqual({ open: 2, doneThisWeek: 3, lastLine: 'Asked Maya for a review' })
  })

  it('asks both reads about the page’s lanes only', async () => {
    await teamDidIt('org_1', SOCIAL_LANES.capabilities)
    for (const o of ledger.asked) expect((o as { capabilities: string[] }).capabilities).toEqual(SOCIAL_LANES.capabilities)
  })

  it('an unreadable ledger yields the quiet answer, never a thrown page', async () => {
    const mod = await import('@/lib/services/action-ledger')
    vi.mocked(mod.listRecentActions).mockRejectedValueOnce(new Error('db down'))
    const r = await teamDidIt('org_1', REVIEWS_LANES.capabilities)
    expect(r.doneThisWeek).toBe(0)
    expect(r.lastLine).toBeNull()
  })
})

describe('the lanes', () => {
  it('name only registered capabilities', () => {
    const registered = new Set(CAPABILITIES.map((c) => c.key))
    for (const lanes of [REVIEWS_LANES, SOCIAL_LANES, OUTREACH_LANES, GROWTH_HUB_LANES]) {
      for (const c of lanes.capabilities) expect(registered.has(c), `'${c}' is not registered`).toBe(true)
    }
    expect(OUTREACH_LANES.capabilities).toContain('newsletter')
  })
})

describe('<TeamDidItBand>', () => {
  const what = { one: 'review task', many: 'review tasks' }

  it('is absent when the team did and drafted nothing', () => {
    const { container } = render(<TeamDidItBand data={{ open: 0, doneThisWeek: 0, lastLine: null }} what={what} />)
    expect(container).toBeEmptyDOMElement()
    const { container: c2 } = render(<TeamDidItBand data={null} what={what} />)
    expect(c2).toBeEmptyDOMElement()
  })

  it('says nothing is left for you when the team handled it', () => {
    render(<TeamDidItBand data={{ open: 0, doneThisWeek: 3, lastLine: 'Asked Maya for a review' }} what={what} />)
    expect(screen.getByText(/handled 3 review tasks this week — nothing for you to do here/)).toBeInTheDocument()
    expect(screen.getByText(/Latest: Asked Maya for a review/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Dream Team/ })).toHaveAttribute('href', '/dream-team')
    expect(screen.getByTestId('team-did-it')).toHaveAttribute('data-state', 'done')
  })

  it('leads with what is waiting on a yes, singular and plural', () => {
    const { rerender } = render(<TeamDidItBand data={{ open: 1, doneThisWeek: 0, lastLine: null }} what={what} />)
    expect(screen.getByText(/1 review task ready for you — it’s waiting on your yes/)).toBeInTheDocument()
    rerender(<TeamDidItBand data={{ open: 2, doneThisWeek: 4, lastLine: null }} what={what} />)
    expect(screen.getByText(/2 review tasks ready for you — they’re waiting on your yes/)).toBeInTheDocument()
    expect(screen.getByText(/handled 4 review tasks on its own this week/)).toBeInTheDocument()
    expect(screen.getByTestId('team-did-it')).toHaveAttribute('data-state', 'waiting')
    expect(screen.getByRole('link', { name: /See what’s waiting/ })).toHaveAttribute('href', '/dream-team')
  })
})
