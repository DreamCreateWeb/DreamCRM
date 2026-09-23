import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * THE DEMO TRACK PICKER'S "closes on" LABEL (DREAMCRM-38).
 *
 * The same stale-copy defect as the deal room, one page over: this panel's
 * hardcoded labels said "Premium · $500/mo" — the struck-through LIST price —
 * so the presenter's own screen disagreed with the $200 founding rate the
 * prospect can read on the pricing page during the call. The labels are
 * derived from `lib/stripe-config.ts` now.
 *
 * DREAMCRM-124 then made every track close on the ONE purchasable plan, so
 * all five cards now carry the same label — which is why the first assertion
 * below counts cards instead of finding one.
 */

vi.mock('@/app/(default)/platform/prospecting/admin-actions', () => ({
  startBrandedDemoAction: vi.fn(),
}))

import TrackPicker from '@/app/(default)/platform/prospecting/demo/[id]/track-picker'
import { DEMO_TRACK_LIST } from '@/lib/types/demo-script'
import { getPlanById, getQuotedPlan } from '@/lib/stripe-config'

describe('demo track picker plan labels', () => {
  it('never quotes the list price for the plan a prospect can buy', () => {
    const quoted = getQuotedPlan()
    const quotedTrack = DEMO_TRACK_LIST.find((t) => t.recommendedPlan === quoted.id)
    expect(quotedTrack, 'fixture assumption: a track closes on the purchasable plan').toBeTruthy()

    render(<TrackPicker prospectId="p1" suggested={quotedTrack!.id} />)

    // getAllByText, not getByText: since DREAMCRM-124 every track closes on
    // the one purchasable plan, so this label is on all five cards. The old
    // single-match form would fail on the fix rather than on the defect.
    expect(
      screen.getAllByText(/closes on Premium · \$200\/mo/).length,
      'no card quotes the purchasable plan at its stripe-config price',
    ).toBe(DEMO_TRACK_LIST.length)
    expect(screen.queryByText(/\$500\/mo/)).toBeNull()
    // The retired tiers are not on any card either — they were, on four of
    // the five, until DREAMCRM-124.
    expect(screen.queryByText(/\$150\/mo/)).toBeNull()
    expect(screen.queryByText(/\$250\/mo/)).toBeNull()
  })

  it('reads every label from stripe-config, so a reprice lands here too', () => {
    render(<TrackPicker prospectId="p1" suggested={DEMO_TRACK_LIST[0].id} />)

    for (const track of DEMO_TRACK_LIST) {
      const plan = getPlanById(track.recommendedPlan)!
      const expected = `closes on ${plan.name} · $${plan.price.toLocaleString('en-US')}/mo`
      expect(
        screen.getAllByText(new RegExp(expected.replace(/[$.*+?^{}()|[\]\\]/g, '\\$&'))).length,
        `${track.id} should quote ${plan.name} at its stripe-config price`,
      ).toBeGreaterThan(0)
    }
  })
})
