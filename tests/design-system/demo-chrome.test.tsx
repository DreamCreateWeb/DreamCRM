import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Design v2 demo/billing chrome (DESIGN-SYSTEM.md Part 4): the full-width
 * orange/amber demo STRIP is gone. Demo is now signalled by a 3px amber top
 * hairline on the canvas + the org-switcher "Demo" pill + a compact header
 * "Exit demo" chip. This test pins the chip's contract and source-guards the
 * (default) shell against re-introducing the old full-bleed banner.
 */

vi.mock('@/app/(default)/ecommerce/customers/admin-actions', () => ({
  exitDemoMode: vi.fn(),
}))

import DemoExitChip from '@/components/ui/demo-exit-chip'

describe('DemoExitChip', () => {
  it('renders a compact amber chip that submits the exit-demo action', () => {
    const { container } = render(<DemoExitChip />)
    const btn = screen.getByRole('button', { name: /Exit demo/i })
    expect(btn).toBeInTheDocument()
    // Amber, not the old orange strip; compact (rounded-full pill).
    expect(btn.className).toContain('amber')
    expect(btn.className).toContain('rounded-full')
    expect(btn.className).not.toContain('orange')
    // It's a real form (works without JS).
    expect(container.querySelector('form')).toBeTruthy()
    expect(btn).toHaveAttribute('type', 'submit')
  })
})

describe('DashboardShell — demo chrome contract (source guard)', () => {
  const shellSrc = readFileSync(
    join(process.cwd(), 'components/ui/dashboard-shell.tsx'),
    'utf8',
  )

  it('the (default) shell no longer mounts the old full-width DemoBanner strip', () => {
    expect(shellSrc).not.toMatch(/DemoBanner/)
    expect(shellSrc).not.toMatch(/bg-orange/)
  })

  it('the (default) shell renders the slim 3px amber demo hairline instead', () => {
    expect(shellSrc).toMatch(/demo-hairline/)
    expect(shellSrc).toMatch(/bg-amber-500/)
  })

  it('the shell wires the v2 quick-create + keyboard map (moduleIds + cockpitPaths)', () => {
    expect(shellSrc).toMatch(/KeyboardShortcuts/)
    expect(shellSrc).toMatch(/cockpitPaths/)
    expect(shellSrc).toMatch(/moduleIds/)
  })
})
