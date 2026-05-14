'use client'

import { useState, useTransition } from 'react'
import { inviteMember, removeMember, updateMemberRole, cancelInvitation } from './actions'

interface MemberRow {
  id: string
  userId: string
  role: string
  createdAt: Date
  name: string
  email: string
}

interface InviteRow {
  id: string
  email: string
  role: string | null
  status: string
  expiresAt: Date
}

interface Props {
  members: MemberRow[]
  invitations: InviteRow[]
  currentUserId: string
  currentRole: string
}

const ROLE_LABELS: Record<string, { label: string; classes: string }> = {
  owner: { label: 'Owner', classes: 'text-violet-700 bg-violet-500/20' },
  admin: { label: 'Admin', classes: 'text-sky-700 bg-sky-500/20' },
  member: { label: 'Member', classes: 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700' },
  patient: { label: 'Patient', classes: 'text-emerald-700 bg-emerald-500/20' },
}

function roleBadge(role: string) {
  const meta = ROLE_LABELS[role] ?? ROLE_LABELS.member
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.classes}`}>{meta.label}</span>
}

export default function TeamPanel({ members, invitations, currentUserId, currentRole }: Props) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSent, setInviteSent] = useState(false)
  const [pending, startTransition] = useTransition()

  const isAdmin = currentRole === 'owner' || currentRole === 'admin'

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setInviteError(null)
    setInviteSent(false)
    const fd = new FormData(e.currentTarget)
    try {
      await inviteMember(fd)
      setInviteSent(true)
      setInviteEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not send invite')
    }
  }

  return (
    <div className="grow">
      <div className="p-6 space-y-6">

        <div>
          <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-1">Team</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage who can access your clinic in Dream Create.
          </p>
        </div>

        {/* Invite form */}
        {isAdmin && (
          <section>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Invite a member</h3>
            <form onSubmit={handleInvite} className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[14rem]">
                <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="form-input w-full"
                  placeholder="name@clinic.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="w-40">
                <label className="block text-sm font-medium mb-1" htmlFor="role">Role</label>
                <select id="role" name="role" className="form-select w-full" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">
                Send invite
              </button>
            </form>
            {inviteError && <div className="mt-2 text-sm text-red-600 dark:text-red-400">{inviteError}</div>}
            {inviteSent && <div className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Invitation sent ✓</div>}
          </section>
        )}

        {/* Members table */}
        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
            Members <span className="text-gray-400 dark:text-gray-500 font-medium text-sm">{members.length}</span>
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700/60">
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">Member</div></th>
                  <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">Role</div></th>
                  <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">Joined</div></th>
                  {isAdmin && <th className="p-2 whitespace-nowrap text-right"><div className="font-semibold">Actions</div></th>}
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {members.map((m) => {
                  const isSelf = m.userId === currentUserId
                  const canEdit = isAdmin && !isSelf && m.role !== 'owner'
                  return (
                    <tr key={m.id}>
                      <td className="p-2 whitespace-nowrap">
                        <div className="font-medium text-gray-800 dark:text-gray-100">{m.name}{isSelf ? ' (you)' : ''}</div>
                        <div className="text-xs text-gray-400">{m.email}</div>
                      </td>
                      <td className="p-2 whitespace-nowrap">{roleBadge(m.role)}</td>
                      <td className="p-2 whitespace-nowrap text-gray-400 dark:text-gray-500">{new Date(m.createdAt).toLocaleDateString()}</td>
                      {isAdmin && (
                        <td className="p-2 whitespace-nowrap text-right">
                          {canEdit ? (
                            <div className="inline-flex items-center gap-3">
                              <select
                                className="form-select text-xs py-1"
                                value={m.role}
                                disabled={pending}
                                onChange={(e) => startTransition(() => updateMemberRole(m.id, e.target.value))}
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button
                                onClick={() => startTransition(() => removeMember(m.id))}
                                disabled={pending}
                                className="text-red-500 hover:text-red-600 text-xs font-medium disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
              Pending invitations <span className="text-gray-400 dark:text-gray-500 font-medium text-sm">{invitations.length}</span>
            </h3>
            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700/60">
              <table className="table-auto w-full dark:text-gray-300">
                <thead className="text-xs uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="p-2"><div className="font-semibold text-left">Email</div></th>
                    <th className="p-2"><div className="font-semibold text-left">Role</div></th>
                    <th className="p-2"><div className="font-semibold text-left">Expires</div></th>
                    {isAdmin && <th className="p-2 text-right"><div className="font-semibold">Actions</div></th>}
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                  {invitations.map((inv) => (
                    <tr key={inv.id}>
                      <td className="p-2 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">{inv.email}</td>
                      <td className="p-2 whitespace-nowrap">{roleBadge(inv.role ?? 'member')}</td>
                      <td className="p-2 whitespace-nowrap text-gray-400 dark:text-gray-500">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                      {isAdmin && (
                        <td className="p-2 whitespace-nowrap text-right">
                          <button
                            onClick={() => startTransition(() => cancelInvitation(inv.id))}
                            disabled={pending}
                            className="text-red-500 hover:text-red-600 text-xs font-medium disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
