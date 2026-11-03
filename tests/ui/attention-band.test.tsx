import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AttentionBand, attentionBandHeading, type AttentionRow } from '@/components/ui/attention-band'

const warn = (id: string, over: Partial<AttentionRow> = {}): AttentionRow => ({
  id,
  tone: 'warn',
  glyph: '!',
  title: `Title ${id}`,
  body: `Body ${id}`,
  href: `/${id}`,
  label: 'Open',
  ...over,
})
const quiet: AttentionRow = { id: 'm', tone: 'neutral', glyph: '🌙', title: 'Overnight: 4 reminders', body: null, href: '/dream-team', label: 'Open' }

describe('AttentionBand', () => {
  it('renders nothing when there are no rows', () => {
    const { container } = render(<AttentionBand rows={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('one row: the heading is the row title, shown once, with its door', () => {
    render(<AttentionBand rows={[warn('a')]} />)
    expect(screen.getAllByText('Title a')).toHaveLength(1)
    expect(screen.getByText('Body a')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/a')
  })

  it('three rows: one section, one amber ring, a counting heading', () => {
    const { container } = render(<AttentionBand rows={[warn('a'), warn('b'), warn('c')]} />)
    expect(container.querySelectorAll('section')).toHaveLength(1)
    expect(container.querySelectorAll('[class*="ring-amber"]')).toHaveLength(1)
    expect(screen.getByText('3 things need your attention')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('a report-only band is quiet ink, never amber', () => {
    const { container } = render(<AttentionBand rows={[quiet]} />)
    expect(container.querySelector('[class*="amber"]')).toBeNull()
    expect(container.querySelector('[data-attention-band="quiet"]')).not.toBeNull()
  })

  it('headings: a quiet row beside one broken thing does not inflate the count', () => {
    expect(attentionBandHeading([warn('a'), quiet])).toBe('1 thing needs your attention')
    expect(attentionBandHeading([quiet, { ...quiet, id: 'n' }])).toBe('While you were out')
  })
})
