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
 */

vi.mock('@/app/(default)/platform/prospecting/admin-actions', () => ({
  startBrandedDemoAction: vi.fn(),
}))

import TrackPicker from '@/app/(default)/platform/prospecting/demo/[id]/track-picker'
import { DEMO_TRACK_LIST } from '@/lib/types/demo-script'
import { getPlanById } from '@/lib/stripe-config'

describe('demo track picker plan labels', () => {
  it('never quotes the list price for the plan a prospect can buy', () => {
    const premiumTrack = DEMO_TRACK_LIST.find((t) => t.recommendedPlan === 'premium')
    expect(premiumTrack, 'fixture assumption: a track closes on Premium').toBeTruthy()

    render(<TrackPicker prospectId="p1" suggested={premiumTrack!.id} />)

    expect(screen.getByText(/closes on Premium · \$200\/mo/)).toBeTruthy()
    expect(screen.queryByText(/\$500\/mo/)).toBeNull()
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
