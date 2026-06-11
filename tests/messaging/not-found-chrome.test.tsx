import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// next/navigation Link is used transitively via the Logo component.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import NotFound from '@/app/not-found'

describe('404 page — chrome-less, no stale Mosaic sidebar', () => {
  it('does not import the Mosaic Sidebar/Header components', () => {
    // The whole point of the rewrite: the 404 must not pull in the stale
    // admin chrome. Assert at the source level so a regression is caught
    // even if those components later render nothing in a test env.
    const src = readFileSync(join(process.cwd(), 'app/not-found.tsx'), 'utf8')
    expect(src).not.toMatch(/components\/ui\/sidebar/)
    expect(src).not.toMatch(/components\/ui\/header/)
  })

  it('renders a centered 404 with a link home', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: /Page not found/i })).toBeInTheDocument()
    const home = screen.getByRole('link', { name: /Back to home/i })
    expect(home).toHaveAttribute('href', '/')
    // No sidebar nav rendered.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
