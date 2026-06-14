import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({ data: { user: { name: 'Dustin R', email: 'd@x.com', role: 'owner' } } }),
  signOut: vi.fn(),
}))
// next/image → plain img so happy-dom renders it.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as any)} />
  },
}))

import DropdownProfile from '@/components/dropdown-profile'

/**
 * The profile button in the 64px sidebar rail must collapse to avatar-only —
 * the name + chevron caused the horizontal-scroll bug. We hide them at lg+
 * (not below lg, so the mobile drawer still shows the name).
 */
describe('DropdownProfile collapsed (rail) behavior', () => {
  it('hides the name at lg+ when collapsed (avatar stands alone)', () => {
    render(<DropdownProfile align="left" collapsed />)
    const name = screen.getByText('Dustin R')
    // Wrapper carries lg:hidden so the rail (lg+) shows only the avatar.
    expect(name.closest('div')?.className).toContain('lg:hidden')
    // Avatar always renders.
    expect(screen.getByAltText('Dustin R')).toBeInTheDocument()
  })

  it('shows the name when not collapsed (expanded sidebar / header)', () => {
    render(<DropdownProfile align="left" />)
    const name = screen.getByText('Dustin R')
    expect(name.closest('div')?.className).not.toContain('lg:hidden')
  })
})
