import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'

/**
 * A COMPARISON PAGE OFFERS THE TRIAL AT THE TOP.
 *
 * Its only door into a trial was the closing block, after the strengths, the
 * fourteen-row matrix, the bottom line and the FAQ. The header's button covers
 * that on a desktop; below `lg` the header is a logo and a menu icon, so on a
 * phone there was no door until the bottom of the page. These are the pages
 * paid search lands on, where every arrival has been paid for.
 *
 * The cases hold the door's POSITION (ahead of the comparison itself, not
 * merely somewhere on the page) and that the line beside it resolves its two
 * numbers, on every page in the registry — an ad group can be added for any of
 * them.
 */

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import ComparePage from '@/app/(marketing)/compare/[vendor]/page'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { TRIAL_DAYS } from '@/lib/trial'

/** True when `a` comes before `b` in document order. */
const precedes = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('the comparison page’s first door', () => {
  for (const c of COMPARISONS) {
    it(`${c.slug}: a trial button sits above the comparison, with the real trial length and price beside it`, async () => {
      const { container, unmount } = render(await ComparePage({ params: Promise.resolve({ vendor: c.slug }) }))
      const doors = screen.getAllByRole('link', { name: 'Start your free trial' })
      // The top door and the closing one. One alone is the old page.
      expect(doors.length).toBeGreaterThanOrEqual(2)
      for (const door of doors) expect(door).toHaveAttribute('href', '/signup')

      // POSITION is the claim: the first door comes before the first section
      // heading and before the feature matrix.
      const firstH2 = container.querySelector('h2')
      const matrix = container.querySelector('table')
      expect(firstH2, 'the page lost its section headings').toBeTruthy()
      expect(matrix, 'the page lost its matrix').toBeTruthy()
      expect(precedes(doors[0]!, firstH2!), 'the first trial button is below the first section').toBe(true)
      expect(precedes(doors[0]!, matrix!), 'the first trial button is below the matrix').toBe(true)

      // And it is inside the hero, after the page's own title.
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(precedes(h1, doors[0]!)).toBe(true)

      // The reassurance line resolves both numbers.
      const line = within(doors[0]!.parentElement as HTMLElement).getByText(/days free, no card/)
      expect(line.textContent).toContain(`${TRIAL_DAYS} days free, no card.`)
      expect(line.textContent).toContain(`${usd(getQuotedPlan().price)}/mo after, month-to-month.`)
      unmount()
    })
  }
})
