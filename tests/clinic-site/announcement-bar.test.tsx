import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { activeAnnouncement } from '@/lib/types/clinic-content'
import AnnouncementBar from '@/components/clinic-site/announcement-bar'

/**
 * The site-wide announcement bar: the pure resolver (expiry + sanitize) and
 * the render surface (bar vs internal link vs external link vs nothing).
 */

describe('activeAnnouncement', () => {
  const today = '2026-07-24'

  it('returns null for empty / whitespace / missing message', () => {
    expect(activeAnnouncement(null, today)).toBeNull()
    expect(activeAnnouncement({}, today)).toBeNull()
    expect(activeAnnouncement({ message: '   ' }, today)).toBeNull()
  })

  it('shows a bar with no end date', () => {
    const a = activeAnnouncement({ message: 'Welcoming new patients' }, today)
    expect(a).toEqual({ message: 'Welcoming new patients', endsAt: null, href: null })
  })

  it('shows through the end day (inclusive) and hides after', () => {
    expect(activeAnnouncement({ message: 'x', endsAt: '2026-07-24' }, today)).not.toBeNull()
    expect(activeAnnouncement({ message: 'x', endsAt: '2026-07-25' }, today)).not.toBeNull()
    expect(activeAnnouncement({ message: 'x', endsAt: '2026-07-23' }, today)).toBeNull()
  })

  it('ignores a malformed end date instead of expiring on it', () => {
    const a = activeAnnouncement({ message: 'x', endsAt: 'someday' }, today)
    expect(a).not.toBeNull()
    expect(a!.endsAt).toBeNull()
  })

  it('keeps a site-relative or http(s) href, drops anything unsafe (defense in depth)', () => {
    expect(activeAnnouncement({ message: 'x', href: '/book' }, today)!.href).toBe('/book')
    expect(activeAnnouncement({ message: 'x', href: 'https://ex.com' }, today)!.href).toBe('https://ex.com')
    expect(activeAnnouncement({ message: 'x', href: '' }, today)!.href).toBeNull()
    // A javascript:/data:/protocol-relative href that ever reached the column
    // is dropped at RENDER, not just at save.
    expect(activeAnnouncement({ message: 'x', href: 'javascript:alert(1)' }, today)!.href).toBeNull()
    expect(activeAnnouncement({ message: 'x', href: '//evil.example' }, today)!.href).toBeNull()
    expect(activeAnnouncement({ message: 'x', href: 'data:text/html,x' }, today)!.href).toBeNull()
  })

  it('clamps a very long message', () => {
    const a = activeAnnouncement({ message: 'a'.repeat(500) }, today)
    expect(a!.message.length).toBe(200)
  })
})

describe('<AnnouncementBar>', () => {
  it('renders nothing when there is no announcement', () => {
    const { container } = render(<AnnouncementBar announcement={null} />)
    expect(container.firstChild).toBeNull()
    cleanup()
  })

  it('renders the message with no link as a region', () => {
    render(<AnnouncementBar announcement={{ message: 'Closed Dec 24–26', endsAt: null, href: null }} />)
    expect(screen.getByText('Closed Dec 24–26')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    cleanup()
  })

  it('renders a site-relative href as a link', () => {
    render(<AnnouncementBar announcement={{ message: 'Book now', endsAt: null, href: '/book' }} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/book')
    cleanup()
  })

  it('renders an external href as a new-tab anchor', () => {
    render(<AnnouncementBar announcement={{ message: 'See update', endsAt: null, href: 'https://ex.com' }} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://ex.com')
    expect(link.getAttribute('target')).toBe('_blank')
    cleanup()
  })
})
