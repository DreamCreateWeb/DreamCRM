import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * THE DEMO TRACK PICKER'S CLOSE LINE.
 *
 * DREAMCRM-38: this panel's hardcoded labels said "Premium · $500/mo" — the
 * struck-through LIST price — so the presenter's own screen disagreed with
 * the $200 founding rate the prospect can read on the pricing page during the
 * call. Then the owner's 2026-10-05 ruling: there is ONE plan, so no story
 * "closes on" a tier at all. The cards say what each demo shows; one line
 * under them says what every demo closes on, read from stripe-config.
 */

vi.mock('@/app/(default)/platform/prospecting/admin-actions', () => ({
  startBrandedDemoAction: vi.fn(),
}))

import TrackPicker from '@/app/(default)/platform/prospecting/demo/[id]/track-picker'
import { DEMO_TRACK_LIST } from '@/lib/types/demo-script'
import { getQuotedPlan } from '@/lib/stripe-config'

describe('demo track picker close line', () => {
  it('quotes the one purchasable plan once, at its stripe-config price', () => {
    const plan = getQuotedPlan()
    render(<TrackPicker prospectId="p1" suggested={DEMO_TRACK_LIST[0].id} />)

    const expected = `${plan.name} · $${plan.price.toLocaleString('en-US')}/mo`
    expect(screen.getAllByText(new RegExp(expected.replace(/[$.*+?^{}()|[\]\\]/g, '\\$&')))).toHaveLength(1)
    expect(screen.queryByText(/\$500\/mo/)).toBeNull()
  })

  it('no card closes on a tier', () => {
    render(<TrackPicker prospectId="p1" suggested={DEMO_TRACK_LIST[0].id} />)
    expect(screen.queryByText(/closes on/)).toBeNull()
    expect(screen.queryByText(/Basic|\bPro\b/)).toBeNull()
    // Two stories can share a beat count and a running time, so "at least
    // one" is the honest assertion here; the card count is pinned instead.
    for (const track of DEMO_TRACK_LIST) {
      expect(
        screen.getAllByText(new RegExp(`^${track.beats.length} beats · ~${track.targetMinutes} min$`)).length,
      ).toBeGreaterThan(0)
    }
    // The story cards are the only pressable buttons; the Start button carries
    // no aria-pressed and so is not counted.
    expect(
      screen.getAllByRole('button', { pressed: false }).length + screen.getAllByRole('button', { pressed: true }).length,
    ).toBe(DEMO_TRACK_LIST.length)
  })
})
