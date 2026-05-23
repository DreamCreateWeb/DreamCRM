import { describe, it, expect } from 'vitest'
import { emptySlotsCopy } from '@/app/site/[slug]/book/book-form'
import type { BookingSlot } from '@/lib/services/booking'

describe('emptySlotsCopy', () => {
  it('says "closed this day" when day_closed', () => {
    expect(emptySlotsCopy([], 'day_closed')).toContain("closed this day")
  })

  it('does NOT say "closed this day" when past_closing — patient was open earlier today', () => {
    const copy = emptySlotsCopy([], 'past_closing')
    expect(copy).not.toContain("closed this day")
    expect(copy.toLowerCase()).toContain('today')
  })

  it('offers a tomorrow hint on past_closing so the patient knows to come back', () => {
    expect(emptySlotsCopy([], 'past_closing').toLowerCase()).toMatch(/tomorrow|later this week/)
  })

  it('suggests calling on invalid_hours rather than failing silently', () => {
    expect(emptySlotsCopy([], 'invalid_hours').toLowerCase()).toMatch(/call/)
  })

  it('falls back to "every slot is taken" when slots exist but none available', () => {
    const taken: BookingSlot = { startIso: '2099-01-01T09:00Z', label: '9:00 AM', available: false }
    expect(emptySlotsCopy([taken, taken], null)).toContain("Every slot is taken")
  })

  it('falls back to "closed this day" when slots is empty AND no reason supplied', () => {
    expect(emptySlotsCopy([], null)).toContain("closed this day")
  })
})
