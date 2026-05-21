'use client'

import { useState, useTransition } from 'react'
import { formatShortDate } from '@/lib/utils'
import { cancelTeamInvitation, inviteTeamMember, removeTeamMember } from './actions'

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
}

export default function TeamPanel({ members, invitations }: Props) {
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

  return (
    <div className="grow">
      <div className="p-6 space-y-8">
        <header>
          <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-1">Team</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Invite teammates to your workspace. They&apos;ll get an email with a link to set up their account and pick a password.
          </p>
        </header>

        {/* Invite form */}
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
            <button
              type="submit"
              disabled={pending || !email}
              className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60"
            >
              {pending ? 'Sending…' : 'Send invite'}
            </button>
          </form>
          {feedback?.error && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded max-w-2xl">
              {feedback.error}
            </div>
          )}
          {feedback?.ok && (
            <div className="mt-3 text-sm text-green-700 bg-green-50 dark:bg-green-500/10 px-3 py-2 rounded max-w-2xl">
              {feedback.ok}
            </div>
          )}
        </section>

        {/* Pending invitations */}
        <section>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
            Pending invitations <span className="text-gray-400 dark:text-gray-500 font-medium">({invitations.length})</span>
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
                  <button
                    type="button"
                    onClick={() => handleCancel(inv.id, inv.email)}
                    disabled={pending}
                    className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-60"
                  >
                    Cancel invite
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Current members */}
        <section>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
            Team members <span className="text-gray-400 dark:text-gray-500 font-medium">({members.length})</span>
          </h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 border border-gray-100 dark:border-gray-700/60 rounded-lg overflow-hidden">
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-gray-800 dark:text-gray-100">
                    {m.name ?? m.email}
                    {m.isCurrent && (
                      <span className="ml-2 text-[10px] uppercase font-semibold bg-violet-500/15 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {m.email} · {m.role} · joined {formatShortDate(m.joinedAt as unknown as string)}
                  </div>
                </div>
                {m.role !== 'owner' && !m.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRemove(m.userId, m.name ?? m.email)}
                    disabled={pending}
                    className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
