'use client'

import { useState, useTransition } from 'react'
import { formatShortDate } from '@/lib/utils'
import { cancelTeamInvitation, changeTeamMemberRole, inviteTeamMember, removeTeamMember } from './actions'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'

export interface TeamMemberView {
  userId: string
  name: string | null
  email: string
  role: string
  joinedAt: Date | string
  isCurrent: boolean
}

export interface InvitationView {
  id: string
  email: string
  role: string | null
  expiresAt: Date | string
  inviterName: string | null
}

interface Props {
  members: TeamMemberView[]
  invitations: InvitationView[]
  /** Owner/admin viewers can invite, remove, and change roles. */
  canManage?: boolean
}

export default function TeamPanel({ members, invitations, canManage = false }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  function onInvite(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      try {
        await inviteTeamMember({ email, role })
        setFeedback({ ok: `Invitation sent to ${email}` })
        setEmail('')
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  function handleCancel(id: string, email: string) {
    if (!confirm(`Cancel invitation for ${email}?`)) return
    setFeedback(null)
    startTransition(async () => {
      try {
        await cancelTeamInvitation(id)
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from the team? They'll lose access immediately.`)) return
    setFeedback(null)
    startTransition(async () => {
      try {
        await removeTeamMember(userId)
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  function handleRoleChange(userId: string, name: string, nextRole: 'admin' | 'member') {
    setFeedback(null)
    startTransition(async () => {
      try {
        await changeTeamMemberRole({ userId, role: nextRole })
        setFeedback({ ok: `${name} is now ${nextRole === 'admin' ? 'an admin' : 'a member'}.` })
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  return (
    <div className="grow">
      <div className="p-6 space-y-8">
        <header>
          <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-1">Team</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Invite teammates to your workspace. They&apos;ll get an email with a link to set up their account and pick a password.
          </p>
        </header>

        {/* Invite form — owner/admin only */}
        {canManage && (
        <section>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Invite a teammate</h3>
          <form onSubmit={onInvite} className="flex flex-col sm:flex-row gap-2 max-w-2xl">
            <input
              type="email"
              required
              placeholder="teammate@example.com"
              className="form-input flex-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
              className="form-select"
              aria-label="Role"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <ActionButton variant="primary" size="sm" type="submit" disabled={pending || !email}>
              {pending ? 'Sending…' : 'Send invite'}
            </ActionButton>
          </form>
          {feedback?.error && (
            <div className="mt-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded max-w-2xl">
              {feedback.error}
            </div>
          )}
          {feedback?.ok && (
            <div className="mt-3 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded max-w-2xl">
              {feedback.ok}
            </div>
          )}
        </section>
        )}

        {/* Pending invitations */}
        <section>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
            Pending invitations <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">({invitations.length})</span>
          </h3>
          {invitations.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No pending invitations.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 border border-gray-100 dark:border-gray-700/60 rounded-lg overflow-hidden">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium text-gray-800 dark:text-gray-100">{inv.email}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {inv.role ?? 'member'} · invited by {inv.inviterName ?? '—'} · expires{' '}
                      {formatShortDate(inv.expiresAt as unknown as string)}
                    </div>
                  </div>
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancel(inv.id, inv.email)}
                    disabled={pending}
                    className="text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400"
                  >
                    Cancel invite
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Current members */}
        <section>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
            Team members <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">({members.length})</span>
          </h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 border border-gray-100 dark:border-gray-700/60 rounded-lg overflow-hidden">
            {members.map((m) => {
              // The owner's role is immutable here; you can't change your own.
              const editable = canManage && m.role !== 'owner' && !m.isCurrent
              return (
                <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium text-gray-800 dark:text-gray-100 flex items-center gap-2">
                      {m.name ?? m.email}
                      {m.isCurrent && <StatusPill tone="special" label="You" />}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {m.email} · {m.role} · joined {formatShortDate(m.joinedAt as unknown as string)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editable ? (
                      <select
                        value={m.role === 'admin' ? 'admin' : 'member'}
                        onChange={(e) => handleRoleChange(m.userId, m.name ?? m.email, e.target.value as 'admin' | 'member')}
                        disabled={pending}
                        aria-label={`Role for ${m.name ?? m.email}`}
                        className="form-select text-sm py-1"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <StatusPill tone="neutral" label={m.role} className="capitalize" />
                    )}
                    {editable && (
                      <ActionButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(m.userId, m.name ?? m.email)}
                        disabled={pending}
                        className="text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400"
                      >
                        Remove
                      </ActionButton>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
