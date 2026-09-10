import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  CHANGELOG_ENTRIES,
  CHANGELOG_KIND_LABELS,
  formatWeekOf,
  latestChangelogEntry,
} from '@/lib/marketing/changelog'
import { MARKETING_NAV, MARKETING_PUBLIC_PATHS, FOOTER_COLUMNS } from '@/lib/marketing/site'
import { KNOWN_TOP_LEVEL_SEGMENTS } from '@/lib/known-routes'
import ChangelogPage from '@/app/(marketing)/changelog/page'

/**
 * The public changelog (/changelog). The owner's cadence rule is the thing
 * most likely to erode under AI-speed development — hundreds of merges a
 * week, each tempting to announce — so it is pinned here as a test, not
 * only as a comment: entries are WEEKLY digests, one per week, newest
 * first, each substantial enough to be worth a reader's time.
 */

describe('the changelog registry', () => {
  it('is weekly: one entry per week, each dated on a Monday, newest first', () => {
    const weeks = CHANGELOG_ENTRIES.map((e) => e.weekOf)
    expect(new Set(weeks).size, 'two entries for one week — batch them').toBe(weeks.length)
    for (const w of weeks) {
      expect(w).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // getUTCDay() === 1 is Monday. The date string parses as UTC midnight.
      expect(new Date(`${w}T00:00:00Z`).getUTCDay(), `${w} is not a Monday`).toBe(1)
    }
    const sorted = [...weeks].sort().reverse()
    expect(weeks, 'newest week must be first — the page leads with it').toEqual(sorted)
  })

  it('every entry is a real digest, not a per-PR note', () => {
    for (const entry of CHANGELOG_ENTRIES) {
      expect(entry.title.length).toBeGreaterThan(15)
      expect(entry.summary.length).toBeGreaterThan(80)
      // A week's worth of work is more than one line. A single-item entry is
      // the shape a per-update changelog takes.
      expect(entry.items.length, `${entry.weekOf} reads as a per-update entry`).toBeGreaterThan(1)
      for (const item of entry.items) {
        expect(Object.keys(CHANGELOG_KIND_LABELS)).toContain(item.kind)
        expect(item.title.length).toBeGreaterThan(10)
        expect(item.body.length).toBeGreaterThan(80)
      }
    }
  })

  it('speaks to customers: no internal identifiers, no “beta”', () => {
    const prose = CHANGELOG_ENTRIES.flatMap((e) => [
      e.title,
      e.summary,
      ...e.items.flatMap((i) => [i.title, i.body]),
    ]).join('\n')
    // Issue keys, PR numbers, file paths and code identifiers are how a
    // developer describes work; none of them mean anything to a practice.
    expect(prose).not.toMatch(/DREAMCRM-\d+|DREAM-\d+/)
    expect(prose).not.toMatch(/\bPR #?\d+|#\d{3,}/)
    expect(prose).not.toMatch(/\.tsx?\b|\bapp\/|\blib\//)
    // The marketing site never sells the product as unfinished.
    expect(prose).not.toMatch(/\bbeta\b/i)
  })

  it('formats a week without drifting a day on a server west of UTC', () => {
    expect(formatWeekOf('2026-09-07')).toBe('Week of September 7, 2026')
    expect(formatWeekOf('2026-01-05')).toBe('Week of January 5, 2026')
    expect(formatWeekOf('2026-12-28')).toBe('Week of December 28, 2026')
  })

  it('latestChangelogEntry is the newest week', () => {
    expect(latestChangelogEntry()).toBe(CHANGELOG_ENTRIES[0])
  })
})

describe('the changelog page', () => {
  it('renders every week with a permalinked date and every item', () => {
    const { container } = render(<ChangelogPage />)
    for (const entry of CHANGELOG_ENTRIES) {
      // Attribute selector, not `#id` — the anchors start with a digit.
      const section = container.querySelector(`[id="${entry.weekOf}"]`)
      expect(section, `no anchor for ${entry.weekOf}`).not.toBeNull()
      const scope = within(section as HTMLElement)
      expect(scope.getByRole('heading', { level: 2 })).toHaveTextContent(entry.title)
      // The date is the permalink — a week can be linked to directly.
      expect(scope.getByRole('link', { name: formatWeekOf(entry.weekOf) })).toHaveAttribute(
        'href',
        `/changelog#${entry.weekOf}`,
      )
      for (const item of entry.items) {
        expect(scope.getByText(item.title)).toBeInTheDocument()
      }
    }
  })

  it('labels each item in words, so the pill colour is never the only encoding', () => {
    render(<ChangelogPage />)
    for (const entry of CHANGELOG_ENTRIES) {
      for (const item of entry.items) {
        expect(screen.getAllByText(CHANGELOG_KIND_LABELS[item.kind]).length).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('names the release cycle when an entry carries one', () => {
    render(<ChangelogPage />)
    for (const entry of CHANGELOG_ENTRIES) {
      if (entry.release) {
        expect(screen.getAllByText(`${entry.release} release`).length).toBeGreaterThanOrEqual(1)
      }
    }
  })
})

describe('the changelog is wired into the site', () => {
  it('/changelog is a public marketing path — a page behind the auth wall has shipped twice before', () => {
    expect(MARKETING_PUBLIC_PATHS).toContain('/changelog')
  })

  it('the router knows the segment, so signed-out visitors are not bounced to sign-in', () => {
    expect(KNOWN_TOP_LEVEL_SEGMENTS.has('changelog')).toBe(true)
  })

  it('is reachable from the header nav and the footer', () => {
    const navHrefs = MARKETING_NAV.flatMap((item) => (item.children ?? []).map((c) => c.href))
    expect(navHrefs).toContain('/changelog')
    const footerHrefs = FOOTER_COLUMNS.flatMap((col) => col.links.map((l) => l.href))
    expect(footerHrefs).toContain('/changelog')
  })
})
