import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// The auth user carries NO role field (the role lives on the membership and
// reaches the menu as the shell's `roleLabel` prop). The old mock pinned a
// `role: 'owner'` the real session never has — which is how "Member" shipped
// for every owner.
const session = { user: { name: 'Dustin R', email: 'd@x.com', image: null as string | null } }
vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({ data: session }),
  signOut: vi.fn(),
}))

import DropdownProfile, { initialsOf } from '@/components/dropdown-profile'

/**
 * The profile button in the 64px sidebar rail must collapse to avatar-only —
 * the name + chevron caused the horizontal-scroll bug. We hide them at lg+
 * (not below lg, so the mobile drawer still shows the name).
 */
describe('DropdownProfile collapsed (rail) behavior', () => {
  it('hides the name at lg+ when collapsed (avatar stands alone)', () => {
    render(<DropdownProfile align="left" collapsed roleLabel="Owner" />)
    const name = screen.getByText('Dustin R')
    // Wrapper carries lg:hidden so the rail (lg+) shows only the avatar.
    expect(name.closest('div')?.className).toContain('lg:hidden')
    // The avatar always renders — labelled with the person's name.
    expect(screen.getByRole('img', { name: 'Dustin R' })).toBeInTheDocument()
  })

  it('shows the name when not collapsed (expanded sidebar / header)', () => {
    render(<DropdownProfile align="left" roleLabel="Owner" />)
    const name = screen.getByText('Dustin R')
    expect(name.closest('div')?.className).not.toContain('lg:hidden')
  })
})

describe('DropdownProfile tells the truth about who you are', () => {
  // The menu panel mounts only once the button is pressed (headlessui), so
  // each case opens it before reading the line under the name.
  it('prints the role the SHELL resolved from the membership — never a guessed "Member"', () => {
    render(<DropdownProfile align="left" roleLabel="Owner" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.queryByText('Member')).not.toBeInTheDocument()
  })

  it('with no role label it prints NO line at all (absence is honest; a default is not)', () => {
    render(<DropdownProfile align="left" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Sign Out')).toBeInTheDocument()
    expect(screen.queryByText(/member/i)).not.toBeInTheDocument()
  })

  it('falls back to an initials tile, never a stock photograph of a stranger', () => {
    const { container } = render(<DropdownProfile align="left" roleLabel="Owner" />)
    expect(screen.getByTestId('profile-initials')).toHaveTextContent('DR')
    expect(container.querySelector('img')).toBeNull()
  })

  it('uses the account photo when there is one', () => {
    session.user.image = 'https://cdn.example.com/me.jpg'
    try {
      const { container } = render(<DropdownProfile align="left" roleLabel="Owner" />)
      const img = container.querySelector('img')
      expect(img?.getAttribute('src')).toBe('https://cdn.example.com/me.jpg')
      expect(img?.getAttribute('alt')).toBe('Dustin R')
      expect(screen.queryByTestId('profile-initials')).toBeNull()
    } finally {
      session.user.image = null
    }
  })

  it('initialsOf takes the first letters of up to two words', () => {
    expect(initialsOf('Ted Pinney')).toBe('TP')
    expect(initialsOf('Mary')).toBe('M')
    expect(initialsOf('  dustin  r  ')).toBe('DR')
    expect(initialsOf('')).toBe('?')
  })
})
