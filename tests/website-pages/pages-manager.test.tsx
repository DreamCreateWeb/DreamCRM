/**
 * The Pages manager rows (deep-carve Phase 4). Proves: live vs needs-content
 * pills; Open-in-editor deep links (?page=) + view-live hrefs; manager
 * link-out chips; expanding a row reveals its copy overrides as inputs that
 * save through the Studio's saveInlineField (empty clears — the honest
 * return-to-template state).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'

const { saveInlineMock } = vi.hoisted(() => ({
  saveInlineMock: vi.fn(async (_f: string, _v: string) => ({ ok: true as const })),
}))
vi.mock('@/app/(default)/website/editor/website-actions', () => ({
  saveInlineField: saveInlineMock,
}))

import PagesManager, { type PageCopyGroup } from '@/app/(default)/website/pages/pages-manager'
import type { SitePageIndexEntry } from '@/lib/clinic-site-helpers'

const pages: SitePageIndexEntry[] = [
  { key: '_home', label: 'Home', path: '', live: true, needs: null, manager: null },
  {
    key: '/team',
    label: 'Meet the team',
    path: '/team',
    live: false,
    needs: 'Add team members to publish this page',
    manager: { href: '/website/content#staff', label: 'Team section' },
  },
  {
    key: '/blog',
    label: 'Blog',
    path: '/blog',
    live: true,
    needs: null,
    manager: { href: '/website/blog', label: 'Blog manager' },
  },
]

const copyByPath: Record<string, PageCopyGroup> = {
  '': {
    concrete: [
      { key: 'home.contactTitle', label: 'Homepage contact headline', fallback: "We'd love to see you.", current: 'Come say hi' },
      { key: 'home.differenceHeadline', label: 'Homepage difference headline', fallback: 'The difference', current: null },
    ],
    savedWildcard: [],
    wildcardFamilies: 2,
  },
}

beforeEach(() => saveInlineMock.mockClear())

describe('PagesManager', () => {
  it('renders live + needs-content rows with honest pills and reasons', () => {
    render(<PagesManager pages={pages} copyByPath={copyByPath} siteUrl="https://acme.test" />)
    expect(screen.getAllByText('Live').length).toBe(2)
    expect(screen.getByText('Not published yet')).toBeTruthy()
    expect(screen.getByText('Add team members to publish this page')).toBeTruthy()
    expect(screen.getByText('2 live')).toBeTruthy()
    cleanup()
  })

  it('live rows deep-link the editor (?page=) + view live; managers get chips', () => {
    const { container } = render(<PagesManager pages={pages} copyByPath={copyByPath} siteUrl="https://acme.test" />)
    expect(container.querySelector('a[href="/website/editor?page="]')).toBeTruthy()
    expect(container.querySelector('a[href="https://acme.test/blog"]')).toBeTruthy()
    expect(container.querySelector('a[href="/website/blog"]')).toBeTruthy()
    expect(container.querySelector('a[href="/website/content#staff"]')).toBeTruthy()
    // Not-live rows get no view-live link.
    expect(container.querySelector('a[href="https://acme.test/team"]')).toBeNull()
    cleanup()
  })

  it('expanding a row reveals copy fields; save posts copy:<key> through the Studio saver', async () => {
    render(<PagesManager pages={pages} copyByPath={copyByPath} siteUrl="https://acme.test" />)
    fireEvent.click(screen.getByText('Home'))
    const input = screen.getByDisplayValue('Come say hi')
    fireEvent.change(input, { target: { value: 'Come say hi — no pressure' } })
    fireEvent.click(screen.getAllByText('Save')[0])
    await waitFor(() =>
      expect(saveInlineMock).toHaveBeenCalledWith('copy:home.contactTitle', 'Come say hi — no pressure'),
    )
    cleanup()
  })

  it('the customized count reads real overrides only', () => {
    render(<PagesManager pages={pages} copyByPath={copyByPath} siteUrl="https://acme.test" />)
    expect(screen.getByText('1 text edit')).toBeTruthy()
    cleanup()
  })

  it('wildcard families get the honest edited-on-the-page note', () => {
    render(<PagesManager pages={pages} copyByPath={copyByPath} siteUrl="https://acme.test" />)
    fireEvent.click(screen.getByText('Home'))
    expect(screen.getByText(/edited right on the page/)).toBeTruthy()
    cleanup()
  })
})
