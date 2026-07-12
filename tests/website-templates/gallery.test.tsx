/**
 * The Templates gallery: live iframe cards on the side-effect-free frame
 * route, practice-type/style filtering + sorting (pure helper), Current pill
 * on the real current design, Apply staging through saveTemplate behind a
 * confirm.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'

const { saveTemplateMock } = vi.hoisted(() => ({
  saveTemplateMock: vi.fn(async (_id: string) => ({ ok: true as const })),
}))
vi.mock('@/app/(default)/website/editor/website-actions', () => ({
  saveTemplate: saveTemplateMock,
}))
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => async () => true,
}))
vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  useRouter: () => ({ refresh: vi.fn() }),
}))

import TemplatesGallery, {
  filterAndSortTemplates,
} from '@/app/(default)/website/templates/templates-gallery'
import { SITE_TEMPLATE_CATALOG } from '@/lib/site-templates/catalog'

beforeEach(() => saveTemplateMock.mockClear())

describe('filterAndSortTemplates (pure)', () => {
  it('category narrows to templates claiming that practice type', () => {
    const cosmetic = filterAndSortTemplates(SITE_TEMPLATE_CATALOG, {
      category: 'cosmetic',
      tags: [],
      sort: 'recommended',
    })
    expect(cosmetic.map((t) => t.id)).toEqual(['cosmetic'])
  })

  it('tags require EVERY selected tag', () => {
    const warm = filterAndSortTemplates(SITE_TEMPLATE_CATALOG, {
      category: 'all',
      tags: ['warm'],
      sort: 'recommended',
    })
    expect(warm.map((t) => t.id)).toEqual(['modern'])
    const impossible = filterAndSortTemplates(SITE_TEMPLATE_CATALOG, {
      category: 'all',
      tags: ['warm', 'dark'],
      sort: 'recommended',
    })
    expect(impossible).toHaveLength(0)
  })

  it('sorts by name when asked, keeps catalog order as Recommended', () => {
    const byName = filterAndSortTemplates(SITE_TEMPLATE_CATALOG, {
      category: 'all',
      tags: [],
      sort: 'name',
    })
    const labels = byName.map((t) => t.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
    const rec = filterAndSortTemplates(SITE_TEMPLATE_CATALOG, {
      category: 'all',
      tags: [],
      sort: 'recommended',
    })
    expect(rec.map((t) => t.id)).toEqual(SITE_TEMPLATE_CATALOG.map((t) => t.id))
  })
})

describe('TemplatesGallery', () => {
  const props = { entries: SITE_TEMPLATE_CATALOG, currentId: 'modern', slug: 'acme' }

  it('renders one card per design with the Current pill on the real one', () => {
    render(<TemplatesGallery {...props} />)
    for (const t of SITE_TEMPLATE_CATALOG) {
      expect(screen.getByText(t.label)).toBeTruthy()
    }
    expect(screen.getAllByText('Current design')).toHaveLength(1)
    cleanup()
  })

  it('cards iframe the side-effect-free per-template frame route', () => {
    const { container } = render(<TemplatesGallery {...props} />)
    for (const t of SITE_TEMPLATE_CATALOG) {
      expect(container.querySelector(`iframe[src="/site/acme/tf/${t.id}"]`), t.id).toBeTruthy()
    }
    // Never the cookie-setting preview route — cards must not clobber each other.
    expect(container.querySelector('iframe[src*="template-preview"]')).toBeNull()
    cleanup()
  })

  it('preview frames are inert (no pointer events, no tab stop, lazy)', () => {
    const { container } = render(<TemplatesGallery {...props} />)
    const frame = container.querySelector('iframe') as HTMLIFrameElement
    expect(frame.className).toContain('pointer-events-none')
    expect(frame.getAttribute('tabindex')).toBe('-1')
    expect(frame.getAttribute('loading')).toBe('lazy')
    cleanup()
  })

  it('a category chip filters the grid', () => {
    render(<TemplatesGallery {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pediatric' }))
    expect(screen.getByText('Pediatric Play')).toBeTruthy()
    expect(screen.queryByText('Cosmetic Luxury')).toBeNull()
    cleanup()
  })

  it('non-current cards deep-link the editor preview; Apply stages via saveTemplate', async () => {
    const { container } = render(<TemplatesGallery {...props} />)
    expect(container.querySelector('a[href="/website/editor?previewTemplate=cosmetic"]')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Apply')[0])
    await waitFor(() => expect(saveTemplateMock).toHaveBeenCalledTimes(1))
    cleanup()
  })
})
