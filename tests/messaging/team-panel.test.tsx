import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { changeTeamMemberRole } = vi.hoisted(() => ({
  changeTeamMemberRole: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('../../app/(default)/settings/team/actions', () => ({
  inviteTeamMember: vi.fn().mockResolvedValue({ ok: true }),
  cancelTeamInvitation: vi.fn().mockResolvedValue({ ok: true }),
  removeTeamMember: vi.fn().mockResolvedValue({ ok: true }),
  changeTeamMemberRole,
}))
// Rendered outside the ConfirmProvider; pass useConfirm() through.
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }))
// TeamPanel uses SettingsTabs, which reads ?tab=&sub= via useSearchParams.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

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

beforeEach(() => {
  changeTeamMemberRole.mockClear()
})

describe('TeamPanel', () => {
  it('renders the invite form, members list, and pending invitations (manager view)', () => {
    const invitations: InvitationView[] = [
      {
        id: 'inv_1',
        email: 'newhire@dreamcreateweb.com',
        role: 'member',
        expiresAt: new Date('2026-06-01'),
        inviterName: 'Dustin',
      },
    ]
    render(<TeamPanel canManage members={[ME, TEAMMATE]} invitations={invitations} />)

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
    render(<TeamPanel canManage members={[ME]} invitations={[]} />)
    expect(screen.getByText(/No pending invitations/i)).toBeInTheDocument()
  })

  it('does not render a Remove button for the current user', () => {
    render(<TeamPanel canManage members={[ME]} invitations={[]} />)
    expect(screen.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()
  })

  it('renders a Remove button for non-current, non-owner members (manager view)', () => {
    render(<TeamPanel canManage members={[ME, TEAMMATE]} invitations={[]} />)
    expect(screen.getByRole('button', { name: /^Remove$/ })).toBeInTheDocument()
  })

  it('disables the Send invite button until an email is typed', async () => {
    const user = userEvent.setup()
    render(<TeamPanel canManage members={[ME]} invitations={[]} />)
    const button = screen.getByRole('button', { name: /Send invite/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await user.type(screen.getByPlaceholderText(/teammate@/i), 'newhire@dreamcreateweb.com')
    expect(button.disabled).toBe(false)
  })

  // ── Role change (new) ─────────────────────────────────────────────────
  it('renders a role select for editable members and calls changeTeamMemberRole on change', async () => {
    const user = userEvent.setup()
    render(<TeamPanel canManage members={[ME, TEAMMATE]} invitations={[]} />)
    const select = screen.getByLabelText(/Role for Jane Designer/i) as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(select.value).toBe('admin')
    await user.selectOptions(select, 'member')
    expect(changeTeamMemberRole).toHaveBeenCalledWith({ userId: 'u_jane', role: 'member' })
  })

  it('never offers a role control for the owner', () => {
    render(<TeamPanel canManage members={[ME]} invitations={[]} />)
    // The owner's member row has no role editor (immutable + it's the current
    // user). The invite form's "Role for the new teammate" picker is separate.
    expect(screen.queryByLabelText(/Role for Dustin/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Role for the new teammate/i)).toBeInTheDocument()
  })

  it('a non-manager (plain member) sees no invite form, no remove, no role select', () => {
    render(<TeamPanel members={[ME, TEAMMATE]} invitations={[]} />)
    expect(screen.queryByPlaceholderText(/teammate@/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Role for/i)).not.toBeInTheDocument()
    // ...but they still see the roster.
    expect(screen.getByText('Jane Designer')).toBeInTheDocument()
  })
})
