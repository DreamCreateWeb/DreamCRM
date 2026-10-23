/**
 * The hero photo's empty door (2026-10-23, from the first client's hero wall).
 *
 * `EditImage` carries `data-edit-empty` when the slot has no picture, the
 * EditBridge reads it as "Add" rather than "Replace", and the two templates
 * that used to render NOTHING clickable without a photo now render the door
 * around their stand-in: the Home Team's wall keeps the plate inside the
 * region, and Hometown shows an editor-only dashed tile (never a visitor).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { EditImage } from '@/components/clinic-site/editable'
import HometeamHome from '@/components/clinic-site/templates/hometeam/home'
import HometownHome from '@/components/clinic-site/templates/hometown/home'
import EstablishedHome from '@/components/clinic-site/templates/established/home'
import { hometeamTemplate } from '@/lib/site-templates/hometeam'
import { hometownTemplate } from '@/lib/site-templates/hometown'
import { establishedTemplate } from '@/lib/site-templates/established'
import { FIXTURES } from '../fixtures/clinic-site-fixtures'
import type { HomePageProps } from '@/lib/site-templates/page-props'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

const ROOT = resolve(__dirname, '../..')

function props(data: ClinicSiteData, bookLabel: string): HomePageProps {
  return {
    data,
    basePath: '/site/fixture-dental',
    signInUrl: 'https://www.example.com/site/fixture-dental/portal',
    gates: { hasBlog: false, hasTeam: false, hasCareers: false, hasDentalPlans: false, hasColoringPages: false, selfBooking: false },
    bookHref: '/site/fixture-dental#contact',
    bookLabel,
    recentPosts: [],
    reviewCount: 0,
    featuredGoogleReviews: [],
    googleRating: null,
  }
}

const DOOR = '[data-edit-field="heroImageUrl"][data-edit-kind="image"]'

describe('<EditImage empty>', () => {
  it('flags the region only when asked', () => {
    const { container, rerender } = render(
      <EditImage field="heroImageUrl" label="Practice photo" empty>
        <i />
      </EditImage>,
    )
    expect(container.firstElementChild!.getAttribute('data-edit-empty')).toBe('true')
    rerender(
      <EditImage field="heroImageUrl" label="Practice photo">
        <i />
      </EditImage>,
    )
    expect(container.firstElementChild!.getAttribute('data-edit-empty')).toBeNull()
    cleanup()
  })

  it('the EditBridge reads it as "Add" on hover and on the touch tag', () => {
    const src = readFileSync(resolve(ROOT, 'components/clinic-site/edit-bridge.tsx'), 'utf8')
    expect(src).toMatch(/data-edit-empty'\) === 'true' \? 'Add' : 'Replace'/)
    expect(src).toMatch(/\$\{empty \? 'Add ' : ''\}\$\{label\}/)
  })
})

describe('the empty hero door per template', () => {
  it('Home Team: the wall is the door, with the plate still inside it', () => {
    const { container } = render(<HometeamHome {...props(FIXTURES.empty(), hometeamTemplate.bookLabel)} />)
    const door = container.querySelector(DOOR)!
    expect(door.getAttribute('data-edit-empty')).toBe('true')
    expect(door.querySelector('svg path[d*="L160 296"]'), 'the plate left the wall').toBeTruthy()
    expect(door.classList.contains('dc-edit-only')).toBe(false) // the plate is public
    cleanup()
  })

  it('Established: the crest alone is the door', () => {
    const { container } = render(<EstablishedHome {...props(FIXTURES.empty(), establishedTemplate.bookLabel)} />)
    const door = container.querySelector(DOOR)!
    expect(door.getAttribute('data-edit-empty')).toBe('true')
    expect(door.querySelector('svg')).toBeTruthy()
    cleanup()
  })

  it('Hometown: an editor-only dashed tile, invisible to visitors', () => {
    const { container } = render(<HometownHome {...props(FIXTURES.empty(), hometownTemplate.bookLabel)} />)
    const door = container.querySelector(DOOR)!
    expect(door.getAttribute('data-edit-empty')).toBe('true')
    expect(door.classList.contains('dc-edit-only')).toBe(true)
    expect(door.textContent).toContain('Add a practice photo')
    cleanup()
    const rich = render(<HometownHome {...props(FIXTURES.rich(), hometownTemplate.bookLabel)} />)
    const filled = rich.container.querySelector(DOOR)!
    expect(filled.classList.contains('dc-edit-only')).toBe(false)
    expect(filled.querySelector('img')).toBeTruthy()
    cleanup()
  })
})
