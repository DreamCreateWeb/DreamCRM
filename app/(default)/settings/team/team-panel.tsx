'use client'

import { useState, useTransition } from 'react'
import { formatShortDate } from '@/lib/utils'
import {
  cancelTeamInvitation,
  changeTeamMemberRole,
  inviteTeamMember,
  removeTeamMember,
  resendTeamInvitation,
} from './actions'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { SettingsSection } from '../settings-kit'
import { SettingsTabs } from '../settings-tabs'

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

type Role = 'admin' | 'member'
type Toast = { tone: 'ok' | 'warn' | 'urgent'; message: string }

/** Plain-English explainer for the two assignable roles — shown under every
 *  role picker so an admin knows exactly what a seat grants before they grant it. */
const ROLE_HELP = 'Member: day-to-day access. Admin: also invites/removes teammates + edits settings.'

/** ~ms until the invite expires, as whole days (floored) — for the countdown. */
function expiresInDays(expiresAt: Date | string): number {
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.floor(ms / 86_400_000)
}

/** Human "Expires in …" label + whether it's inside the urgent (<24h) window. */
function expiryLabel(expiresAt: Date | string): { text: string; soon: boolean; expired: boolean } {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', soon: true, expired: true }
  const days = expiresInDays(expiresAt)
  if (days >= 1) return { text: `Expires in ${days} day${days === 1 ? '' : 's'}`, soon: false, expired: false }
  const hours = Math.max(1, Math.ceil(ms / 3_600_000))
  return { text: `Expires in ${hours} hour${hours === 1 ? '' : 's'}`, soon: true, expired: false }
}

/** Shared role control: a labelled <select> with the one-line explainer beneath
 *  it. Used identically in the invite form and the per-member role editor so the
 *  same plain-English framing appears everywhere a role is chosen. */
function RolePicker({
  value,
  onChange,
  disabled,
  ariaLabel,
  compact = false,
}: {
  value: Role
  onChange: (r: Role) => void
  disabled?: boolean
  ariaLabel: string
  /** Tighter styling for the inline per-member editor. */
  compact?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Role)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby="role-help"
        className={compact ? 'form-select text-sm py-1' : 'form-select'}
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>
      {!compact && (
        <p id="role-help" className="text-xs leading-relaxed text-gray-500 dark:text-gray-400 max-w-prose">
          {ROLE_HELP}
        </p>
      )}
    </div>
  )
}

export default function TeamPanel({ members, invitations, canManage = false }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<Toast | null>(null)
  const confirm = useConfirm()

  function onInvite(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const res = await inviteTeamMember({ email, role })
        setEmail('')
        setToast(
          res.emailed
            ? { tone: 'ok', message: `Invitation sent to ${email}.` }
            : {
                tone: 'warn',
                message: `Invite created, but we couldn't email ${email} — use Resend or share the link.`,
              },
        )
      } catch (err) {
        setToast({ tone: 'urgent', message: (err as Error).message })
      }
    })
  }

  async function handleCancel(id: string, addr: string) {
    if (!(await confirm({ title: `Cancel invitation for ${addr}?`, confirmLabel: 'Cancel invitation', danger: true }))) return
    startTransition(async () => {
      try {
        await cancelTeamInvitation(id)
        setToast({ tone: 'ok', message: `Invitation to ${addr} cancelled.` })
      } catch (err) {
        setToast({ tone: 'urgent', message: (err as Error).message })
      }
    })
  }

  async function handleResend(id: string, addr: string) {
    startTransition(async () => {
      try {
        const res = await resendTeamInvitation(id)
        setToast(
          res.emailed
            ? { tone: 'ok', message: `Invitation re-sent to ${addr}.` }
            : { tone: 'warn', message: `We couldn't email ${addr} — share the link instead.` },
        )
      } catch (err) {
        setToast({ tone: 'urgent', message: (err as Error).message })
      }
    })
  }

  async function handleRemove(userId: string, name: string) {
    if (
      !(await confirm({
        title: `Remove ${name} from the team?`,
        message: "They'll lose access immediately.",
        confirmLabel: 'Remove',
        danger: true,
      }))
    )
      return
    startTransition(async () => {
      try {
        await removeTeamMember(userId)
        setToast({ tone: 'ok', message: `${name} removed from the team.` })
      } catch (err) {
        setToast({ tone: 'urgent', message: (err as Error).message })
      }
    })
  }

  function handleRoleChange(userId: string, name: string, nextRole: Role) {
    startTransition(async () => {
      try {
        await changeTeamMemberRole({ userId, role: nextRole })
        setToast({ tone: 'ok', message: `${name} is now ${nextRole === 'admin' ? 'an admin' : 'a member'}.` })
      } catch (err) {
        setToast({ tone: 'urgent', message: (err as Error).message })
      }
    })
  }

  return (
    <div className="p-6 space-y-6">
      <SettingsTabs
        tabs={[
          ...(canManage
            ? [
                {
                  id: 'invite',
                  label: 'Invite',
                  content: (
                    <SettingsSection
                      title="Invite a teammate"
                      description="They'll get an email with a link to set up their account and pick a password."
                    >
                      <form onSubmit={onInvite} className="flex flex-col gap-3 max-w-2xl">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                          <input
                            type="email"
                            required
                            placeholder="teammate@example.com"
                            className="form-input flex-1"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                          <RolePicker value={role} onChange={setRole} disabled={pending} ariaLabel="Role for the new teammate" />
                          <ActionButton variant="primary" size="sm" type="submit" disabled={pending || !email}>
                            {pending ? 'Sending…' : 'Send invite'}
                          </ActionButton>
                        </div>
                      </form>
                    </SettingsSection>
                  ),
                },
              ]
            : []),
          {
            id: 'pending',
            label: 'Pending',
            content: (
              <SettingsSection
                title={
                  <>
                    Pending invitations{' '}
                    <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">({invitations.length})</span>
                  </>
                }
              >
                {invitations.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No pending invitations.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 rounded-[var(--r-sm)] overflow-hidden border border-gray-100 dark:border-gray-700/60">
                    {invitations.map((inv) => {
                      const exp = expiryLabel(inv.expiresAt)
                      return (
                        <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-800 dark:text-gray-100 flex items-center gap-2">
                              <span className="truncate">{inv.email}</span>
                              <StatusPill tone="neutral" label={inv.role ?? 'member'} className="capitalize" />
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-1.5">
                              <span>invited by {inv.inviterName ?? '—'}</span>
                              <span aria-hidden>·</span>
                              <span
                                className={`font-mono-num tabular-nums ${
                                  exp.soon ? 'text-amber-700 dark:text-amber-400 font-medium' : ''
                                }`}
                              >
                                {exp.text}
                              </span>
                            </div>
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-1">
                              <ActionButton
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResend(inv.id, inv.email)}
                                disabled={pending}
                                className="text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
                              >
                                Resend
                              </ActionButton>
                              <ActionButton
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCancel(inv.id, inv.email)}
                                disabled={pending}
                                className="text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400"
                              >
                                Cancel invite
                              </ActionButton>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </SettingsSection>
            ),
          },
          {
            id: 'members',
            label: 'Members',
            content: (
              <SettingsSection
                title={
                  <>
                    Team members{' '}
                    <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">({members.length})</span>
                  </>
                }
                description={canManage ? ROLE_HELP : undefined}
              >
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 rounded-[var(--r-sm)] overflow-hidden border border-gray-100 dark:border-gray-700/60">
                  {members.map((m) => {
                    // The owner's role is immutable here; you can't change your own.
                    const editable = canManage && m.role !== 'owner' && !m.isCurrent
                    return (
                      <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <div className="min-w-0">
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
                            <RolePicker
                              value={m.role === 'admin' ? 'admin' : 'member'}
                              onChange={(next) => handleRoleChange(m.userId, m.name ?? m.email, next)}
                              disabled={pending}
                              ariaLabel={`Role for ${m.name ?? m.email}`}
                              compact
                            />
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
              </SettingsSection>
            ),
          },
        ]}
      />

      {toast && <FlashToast tone={toast.tone} message={toast.message} onDone={() => setToast(null)} />}
    </div>
  )
}
