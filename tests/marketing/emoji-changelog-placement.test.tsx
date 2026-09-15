import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

/**
 * The "rocket marks only the newest week" rule (`BRAND.md` Part 5).
 *
 * THIS FILE EXISTS BECAUSE THE OBVIOUS TEST IS VACUOUS. Asserting "exactly one
 * rocket on the real changelog page" passes whether the code says `i === 0` or
 * `i >= 0`, because `CHANGELOG_ENTRIES` currently holds ONE week — the guard
 * was watched passing against `i >= 0` before this file was written. A rule
 * about which of several entries gets marked can only be tested against
 * several entries, so the module is stubbed with three.
 *
 * It lives in its own file because `vi.mock` is hoisted per module graph and
 * the rest of the emoji guards want the real changelog.
 */
vi.mock('@/lib/marketing/changelog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketing/changelog')>()
  const week = (weekOf: string, title: string) => ({
    weekOf,
    title,
    summary: `Summary for ${title}.`,
    items: [{ kind: 'new' as const, title: `${title} item`, body: 'Body copy.' }],
  })
  return {
    ...actual,
    CHANGELOG_ENTRIES: [
      week('2026-09-14', 'Newest week'),
      week('2026-09-07', 'Middle week'),
      week('2026-08-31', 'Oldest week'),
    ],
  }
})

import ChangelogPage from '@/app/(marketing)/changelog/page'
import { CHANGELOG_ENTRIES } from '@/lib/marketing/changelog'

describe('changelog placement', () => {
  it('marks the newest week and only the newest week', () => {
    expect(CHANGELOG_ENTRIES.length).toBeGreaterThan(1) // the stub is in effect

    const { container } = render(<ChangelogPage />)
    const rockets = container.querySelectorAll('img[src="/images/emoji/rocket.webp"]')
    expect(rockets, 'the rocket marks the current week, not every week').toHaveLength(1)

    const newest = container.querySelector(`[id="${CHANGELOG_ENTRIES[0].weekOf}"]`)
    expect(newest, 'newest changelog article did not render').toBeTruthy()
    expect(newest!.contains(rockets[0]), 'the rocket is not inside the newest entry').toBe(true)
  })

  it('labels the rocket, because which week is live is not said anywhere else', () => {
    const { container } = render(<ChangelogPage />)
    const rocket = container.querySelector('img[src="/images/emoji/rocket.webp"]')!
    expect(rocket.getAttribute('alt')).toBeTruthy()
    expect(rocket.getAttribute('aria-hidden')).toBeNull()
  })
})
