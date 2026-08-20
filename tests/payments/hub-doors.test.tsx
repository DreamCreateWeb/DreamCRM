import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import PaymentsHubDoors from '@/app/(default)/payments/hub-doors'

/** The Payments workspace doors (split out of Shop, 2026-07-14) — the same
 *  live-stat door assertions that used to live in the shop-client suite. */

function renderDoors(over: Partial<Parameters<typeof PaymentsHubDoors>[0]> = {}) {
  return render(
    <PaymentsHubDoors
      collections={over.collections ?? { patientCount: 0, totalOutstandingCents: 0 }}
      toReconcile={over.toReconcile ?? 0}
      connectReady={over.connectReady ?? true}
      membershipStats={over.membershipStats ?? { activeMembers: 0, mrrCents: 0 }}
    />,
  )
}

function door(href: string): HTMLElement {
  const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === href)
  if (links.length !== 1) throw new Error(`Expected exactly one door for ${href}`)
  return links[0] as HTMLElement
}

describe('Payments hub doors', () => {
  it('renders the three money doors at their new homes', () => {
    renderDoors()
    for (const href of ['/payments/collections', '/payments/online', '/payments/memberships']) {
      expect(door(href)).toBeInTheDocument()
    }
  })

  // Batch 28: the KPI band directly above the doors carries the numbers, so
  // the doors deliberately do NOT restate them — pinning the absence keeps
  // the duplication from creeping back.
  it('Collections door does not restate the KPI band (no stat line)', () => {
    renderDoors({ collections: { patientCount: 3, totalOutstandingCents: 42500 } })
    const d = within(door('/payments/collections'))
    expect(d.getByText('Collections')).toBeInTheDocument()
    expect(d.queryByText(/open balance/)).not.toBeInTheDocument()
  })

  it('Online payments door keeps its connect STATE (a door fact, not a KPI)', () => {
    renderDoors({ toReconcile: 2 })
    const d = within(door('/payments/online'))
    expect(d.getByText('Connected')).toBeInTheDocument()
    expect(d.queryByText(/to reconcile/)).not.toBeInTheDocument()
  })

  it('Online payments door reads "Not connected" without Stripe', () => {
    renderDoors({ connectReady: false })
    const d = within(door('/payments/online'))
    expect(d.getByText('Not connected')).toBeInTheDocument()
    expect(d.getByText(/Connect Stripe/)).toBeInTheDocument()
  })

  it('Memberships door does not restate members/MRR', () => {
    renderDoors({ membershipStats: { activeMembers: 12, mrrCents: 39900 } })
    const d = within(door('/payments/memberships'))
    expect(d.getByText('Memberships')).toBeInTheDocument()
    expect(d.queryByText(/active/)).not.toBeInTheDocument()
  })
})
