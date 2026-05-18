import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../app/(default)/settings/team/actions', () => ({
  inviteTeamMember: vi.fn().mockResolvedValue({ ok: true }),
  cancelTeamInvitation: vi.fn().mockResolvedValue({ ok: true }),
  removeTeamMember: vi.fn().mockResolvedValue({ ok: true }),
}))

import TeamPanel, { type InvitationView, type TeamMemberView } from '@/app/(default)/settings/team/team-panel'

const ME: TeamMemberView = {
  userId: 'u_me',
  name: 'Dustin Russenberger',
  email: 'dustin@dreamcreateweb.com',
  role: 'owner',
  joinedAt: new Date('2026-01-01'),
  isCurrent: true,
}

const TEAMMATE: TeamMemberView = {
  userId: 'u_jane',
  name: 'Jane Designer',
  email: 'jane@dreamcreateweb.com',
  role: 'admin',
  joinedAt: new Date('2026-03-10'),
  isCurrent: false,
}

describe('TeamPanel', () => {
  it('renders the invite form, members list, and pending invitations', () => {
    const invitations: InvitationView[] = [
      {
        id: 'inv_1',
        email: 'newhire@dreamcreateweb.com',
        role: 'member',
        expiresAt: new Date('2026-06-01'),
        inviterName: 'Dustin',
      },
    ]
    render(<TeamPanel members={[ME, TEAMMATE]} invitations={invitations} />)

    // Invite form
    expect(screen.getByPlaceholderText(/teammate@/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send invite/i })).toBeInTheDocument()

    // Pending list
    expect(screen.getByText('Pending invitations')).toBeInTheDocument()
    expect(screen.getByText('newhire@dreamcreateweb.com')).toBeInTheDocument()

    // Members list
    expect(screen.getByText('Dustin Russenberger')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Jane Designer')).toBeInTheDocument()
  })

  it('shows an empty state when there are no pending invites', () => {
    render(<TeamPanel members={[ME]} invitations={[]} />)
    expect(screen.getByText(/No pending invitations/i)).toBeInTheDocument()
  })

  it('does not render a Remove button for the current user', () => {
    render(<TeamPanel members={[ME]} invitations={[]} />)
    expect(screen.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()
  })

  it('renders a Remove button for non-current, non-owner members', () => {
    render(<TeamPanel members={[ME, TEAMMATE]} invitations={[]} />)
    expect(screen.getByRole('button', { name: /^Remove$/ })).toBeInTheDocument()
  })

  it('disables the Send invite button until an email is typed', async () => {
    const user = userEvent.setup()
    render(<TeamPanel members={[ME]} invitations={[]} />)
    const button = screen.getByRole('button', { name: /Send invite/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await user.type(screen.getByPlaceholderText(/teammate@/i), 'newhire@dreamcreateweb.com')
    expect(button.disabled).toBe(false)
  })
})
