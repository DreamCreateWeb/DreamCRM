import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Drawer from '@/components/ui/drawer'

/**
 * The drawer + ⌘K modal re-point their Headless UI transition classes to the
 * v2 motion tokens (enter base, exit fast) and wear the surface/shadow/radius
 * tokens. Headless UI applies enter/leave classes during the transition, so we
 * parse the source for the token strings (deterministic) AND render the open
 * drawer to confirm its panel carries the etched-overlay skin.
 */
const ROOT = resolve(__dirname, '../..')
const drawerSrc = readFileSync(resolve(ROOT, 'components/ui/drawer.tsx'), 'utf8')
const searchSrc = readFileSync(resolve(ROOT, 'components/search-modal.tsx'), 'utf8')

describe('Drawer transition tokens', () => {
  it('enters on --dur-base and exits faster on --dur-fast', () => {
    expect(drawerSrc).toContain('duration-[var(--dur-base)]')
    expect(drawerSrc).toContain('duration-[var(--dur-fast)]')
    expect(drawerSrc).toContain('ease-[var(--ease-ios)]')
  })

  it('skins the panel with surface-2 + shadow-modal + 12px radius', () => {
    expect(drawerSrc).toContain('bg-[color:var(--color-surface-2)]')
    expect(drawerSrc).toContain('shadow-[var(--shadow-modal)]')
    expect(drawerSrc).toContain('rounded-l-[var(--r-lg)]')
  })

  it('renders an open drawer with its title and close affordance', () => {
    render(
      <Drawer open onClose={() => {}} title="Patient detail">
        <div>body</div>
      </Drawer>,
    )
    expect(screen.getByText('Patient detail')).toBeInTheDocument()
    expect(screen.getByTitle('Close (Esc)')).toBeInTheDocument()
  })
})

describe('Command palette (⌘K) transition tokens', () => {
  it('re-points the modal transitions to the v2 duration tokens', () => {
    expect(searchSrc).toContain('duration-[var(--dur-base)]')
    expect(searchSrc).toContain('duration-[var(--dur-fast)]')
  })

  it('wears the overlay skin (surface-2 + shadow-modal + r-lg)', () => {
    expect(searchSrc).toContain('bg-[color:var(--color-surface-2)]')
    expect(searchSrc).toContain('shadow-[var(--shadow-modal)]')
    expect(searchSrc).toContain('rounded-[var(--r-lg)]')
  })
})
