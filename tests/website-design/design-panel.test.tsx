import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * The Design page's cards follow the design (2026-10-26). Only Modern
 * renders a second hero photo and an intro video; a Home Team practice
 * uploaded a "Second hero image", saw Saved, published, and nothing changed.
 * The two cards render only where the catalog's media map says the slot is
 * drawn, and say so in one quiet line otherwise — the data is never touched.
 */

vi.mock('@/app/(default)/website/editor/website-actions', () => ({
  saveBrandColor: vi.fn(async () => ({ ok: true })),
  saveImageField: vi.fn(async () => ({ ok: true })),
  saveDifferenceVideo: vi.fn(async () => ({ ok: true })),
}))

import DesignPanel from '@/app/(default)/website/design/design-panel'

const base = {
  brandColor: '#1D4ED8',
  heroImageUrl: null,
  heroImageUrl2: null,
  differenceVideoUrl: null,
  imagePositions: {},
}

describe('DesignPanel — the media cards follow the current design', () => {
  it('Modern offers the second hero photo and the intro video', () => {
    render(<DesignPanel {...base} currentTemplate="modern" />)
    expect(screen.getByRole('heading', { name: 'Second hero image' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Intro video' })).toBeTruthy()
    expect(document.querySelector('[data-unused-slot]')).toBeNull()
    cleanup()
  })

  it.each(['hometeam', 'hometown', 'cosmetic', 'pediatric', 'established'])(
    '%s hides both cards and says the design does not use the slot',
    (tid) => {
      render(<DesignPanel {...base} currentTemplate={tid} />)
      expect(screen.queryByRole('heading', { name: 'Second hero image' })).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Intro video' })).toBeNull()
      const notes = Array.from(document.querySelectorAll('[data-unused-slot]'))
      expect(notes.map((n) => n.getAttribute('data-unused-slot'))).toEqual(['a second hero photo', 'an intro video'])
      for (const n of notes) {
        expect(n.textContent).toMatch(/doesn’t use/)
        expect(n.querySelector('a[href="/website/templates"]')).toBeTruthy()
      }
      // The first hero image is universal and stays.
      expect(screen.getByRole('heading', { name: 'Hero image' })).toBeTruthy()
      cleanup()
    },
  )

  it('a photo saved under a previous design is reported as kept, not lost', () => {
    render(<DesignPanel {...base} currentTemplate="hometeam" heroImageUrl2="https://x/hero2.jpg" />)
    const note = document.querySelector('[data-unused-slot="a second hero photo"]')!
    expect(note.textContent).toMatch(/kept and shows again/)
    cleanup()
  })

  it('an unknown design id reads as the default design (Modern), like the registry', () => {
    render(<DesignPanel {...base} currentTemplate="nope" />)
    expect(screen.getByRole('heading', { name: 'Second hero image' })).toBeTruthy()
    cleanup()
  })
})
