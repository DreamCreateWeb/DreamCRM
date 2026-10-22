/**
 * Service icons — the one registry and the one renderer behind every service
 * card's picture (lib/service-icons.ts + components/clinic-site/service-icon.tsx).
 *
 * A `ClinicService.icon` is one string in three shapes: `icon:<id>` (a curated
 * glyph), an https URL (an upload) or an emoji. Every template renders it
 * through `<ServiceIcon>`; the Studio's drawer writes it; `parseServices`
 * keeps only what is drawable.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import {
  SERVICE_ICON_GLYPHS,
  SERVICE_ICON_EMOJI,
  glyphIconValue,
  isServiceIconValue,
  parseServiceIcon,
  searchServiceIconGlyphs,
} from '@/lib/service-icons'
import ServiceIcon from '@/components/clinic-site/service-icon'
import { EditIcon } from '@/components/clinic-site/editable'
import { parseServices } from '@/lib/clinic-content-parse'

describe('the glyph registry', () => {
  it('has unique ids, a label, search tags and at least one path each', () => {
    const ids = SERVICE_ICON_GLYPHS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(30)
    for (const g of SERVICE_ICON_GLYPHS) {
      expect(g.id).toMatch(/^[a-z-]+$/)
      expect(g.label.trim().length).toBeGreaterThan(0)
      expect(g.tags.length).toBeGreaterThan(0)
      expect(g.paths.length).toBeGreaterThan(0)
      for (const d of g.paths) expect(d).toMatch(/^M[\d.\s-]/)
    }
  })

  it('search matches labels, ids and tags, case-insensitively; blank returns all', () => {
    expect(searchServiceIconGlyphs('').length).toBe(SERVICE_ICON_GLYPHS.length)
    expect(searchServiceIconGlyphs('Whiten').map((g) => g.id)).toContain('sparkle')
    expect(searchServiceIconGlyphs('kids').map((g) => g.id)).toEqual(expect.arrayContaining(['child', 'family']))
    expect(searchServiceIconGlyphs('zzzz')).toEqual([])
  })

  it('the emoji list is short, unique and all drawable', () => {
    expect(new Set(SERVICE_ICON_EMOJI).size).toBe(SERVICE_ICON_EMOJI.length)
    for (const e of SERVICE_ICON_EMOJI) expect(parseServiceIcon(e)?.kind).toBe('emoji')
  })
})

describe('parseServiceIcon', () => {
  it('reads the three shapes', () => {
    expect(parseServiceIcon('icon:tooth')).toMatchObject({ kind: 'glyph', id: 'tooth' })
    expect(parseServiceIcon(glyphIconValue('sparkle'))).toMatchObject({ kind: 'glyph', id: 'sparkle' })
    expect(parseServiceIcon('https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/service-icons/u/1-x.png')).toMatchObject({
      kind: 'image',
    })
    expect(parseServiceIcon('🦷')).toEqual({ kind: 'emoji', text: '🦷' })
    expect(parseServiceIcon('👨‍👩‍👧')).toEqual({ kind: 'emoji', text: '👨‍👩‍👧' })
  })

  it('returns null for nothing drawable', () => {
    expect(parseServiceIcon(null)).toBeNull()
    expect(parseServiceIcon('')).toBeNull()
    expect(parseServiceIcon('   ')).toBeNull()
    expect(parseServiceIcon('icon:not-a-glyph')).toBeNull()
    expect(parseServiceIcon('http://insecure.example/x.png')).toBeNull()
    expect(parseServiceIcon('https://x.example/a b.png')).toBeNull()
    expect(parseServiceIcon('<img src=x>')).toBeNull()
    expect(parseServiceIcon('this is a sentence, not an emoji')).toBeNull()
  })

  it('isServiceIconValue is the writer gate', () => {
    expect(isServiceIconValue('icon:crown')).toBe(true)
    expect(isServiceIconValue('😁')).toBe(true)
    expect(isServiceIconValue('icon:nope')).toBe(false)
    expect(isServiceIconValue(42)).toBe(false)
    expect(isServiceIconValue(null)).toBe(false)
  })
})

describe('<ServiceIcon>', () => {
  it('draws a glyph as inline SVG in currentColor', () => {
    const { container } = render(<ServiceIcon icon="icon:tooth" size={30} />)
    const svg = container.querySelector('svg[data-service-icon="tooth"]')!
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('width')).toBe('30')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('draws an upload through SiteImage at the icon size', () => {
    const url = 'https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/service-icons/u/1-x.png'
    const { container } = render(<ServiceIcon icon={url} size={48} />)
    const img = container.querySelector('img[data-service-icon="image"]')!
    expect(img).toBeTruthy()
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('src')).toContain('/_next/image')
    expect(img.getAttribute('width')).toBe('48')
  })

  it('draws an emoji as text and the fallback when there is nothing', () => {
    const { container, rerender } = render(<ServiceIcon icon="🦷" />)
    expect(container.querySelector('[data-service-icon="emoji"]')?.textContent).toBe('🦷')
    rerender(<ServiceIcon icon={null} fallback={<b>01</b>} />)
    expect(container.querySelector('[data-service-icon]')).toBeNull()
    expect(container.querySelector('b')?.textContent).toBe('01')
  })
})

describe('<EditIcon>', () => {
  it('tags the region for the EditBridge with the service id', () => {
    const { container } = render(
      <EditIcon serviceId="svc_9">
        <ServiceIcon icon="icon:heart" />
      </EditIcon>,
    )
    const el = container.firstElementChild!
    expect(el.getAttribute('data-edit-field')).toBe('serviceIcon:svc_9')
    expect(el.getAttribute('data-edit-kind')).toBe('icon')
    expect(el.getAttribute('data-edit-label')).toBe('icon')
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('parseServices keeps only drawable icons', () => {
  it('passes glyphs, uploads and emoji; drops junk', () => {
    const out = parseServices(
      JSON.stringify([
        { id: 'a', name: 'A', icon: 'icon:tooth' },
        { id: 'b', name: 'B', icon: 'https://x.example/i.svg' },
        { id: 'c', name: 'C', icon: '✨' },
        { id: 'd', name: 'D', icon: '<script>' },
        { id: 'e', name: 'E', icon: 'icon:unknown' },
      ]),
    )!
    expect(out.map((s) => s.icon)).toEqual(['icon:tooth', 'https://x.example/i.svg', '✨', null, null])
  })
})
