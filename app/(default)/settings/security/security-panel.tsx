'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { changePassword } from '@/lib/auth-client'
import { relativeTime } from '@/lib/utils'
import { revokeOtherSessions, revokeSession } from './security-actions'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'

export interface SessionRow {
  id: string
  isCurrent: boolean
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export default function SecurityPanel({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Password change UI
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwFeedback, setPwFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPwBusy(true)
    setPwFeedback(null)
    const { error } = await changePassword({
      currentPassword: currentPw,
      newPassword: newPw,
      revokeOtherSessions: true,
    })
    setPwBusy(false)
    if (error) {
      setPwFeedback({ error: error.message ?? 'Unable to change password' })
      return
    }
    setPwFeedback({ ok: 'Password updated. Other devices have been signed out.' })
    setCurrentPw('')
    setNewPw('')
    setPwOpen(false)
    router.refresh()
  }

  function handleRevoke(id: string) {
    if (!confirm('Sign out this session?')) return
    startTransition(async () => {
      await revokeSession(id)
      router.refresh()
    })
  }

  function handleRevokeOthers() {
    const others = sessions.filter((s) => !s.isCurrent)
    if (others.length === 0) return
    if (!confirm(`Sign out ${others.length} other session${others.length === 1 ? '' : 's'}?`)) return
    startTransition(async () => {
      await revokeOtherSessions()
      router.refresh()
    })
  }

  const otherCount = sessions.filter((s) => !s.isCurrent).length

  return (
    <div className="grow">
      <div className="p-6 space-y-8">
        <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold">Security</h2>

        {/* ── Active sessions ── */}
        <section>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                Active sessions
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Devices currently signed in to your account.
              </p>
            </div>
            {otherCount > 0 && (
              <ActionButton
                variant="ghost"
                size="sm"
                onClick={handleRevokeOthers}
                disabled={pending}
                className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              >
                Sign out all other devices
              </ActionButton>
            )}
          </div>
          <ul className="border border-gray-200 dark:border-gray-700/60 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/40">
            {sessions.map((s) => (
              <li key={s.id} className="px-4 py-3 flex items-center gap-3 bg-white dark:bg-gray-800">
                <DeviceIcon ua={s.userAgent} />
                <div className="min-w-0 grow">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                      {prettyUserAgent(s.userAgent)}
                    </p>
                    {s.isCurrent && <StatusPill tone="ok" label="This device" />}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {s.ipAddress ?? 'IP unknown'} · last active {relativeTime(s.updatedAt)}
                  </p>
                </div>
                {!s.isCurrent && (
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(s.id)}
                    disabled={pending}
                    className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                  >
                    Sign out
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Password ── */}
        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Password</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Set a new password. You'll be signed out of every other device.
          </p>
          {!pwOpen ? (
            <ActionButton variant="secondary" size="sm" onClick={() => setPwOpen(true)}>
              Change password
            </ActionButton>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-3 max-w-md">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="cur-pw">
                  Current password
                </label>
                <input
                  id="cur-pw"
                  type="password"
                  className="form-input w-full"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="new-pw">
                  New password
                </label>
                <input
                  id="new-pw"
                  type="password"
                  className="form-input w-full"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              {pwFeedback?.error && (
                <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded">
                  {pwFeedback.error}
                </div>
              )}
              {pwFeedback?.ok && (
                <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded">
                  {pwFeedback.ok}
                </div>
              )}
              <div className="flex gap-2">
                <ActionButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPwOpen(false)
                    setCurrentPw('')
                    setNewPw('')
                    setPwFeedback(null)
                  }}
                >
                  Cancel
                </ActionButton>
                <ActionButton variant="primary" size="sm" type="submit" disabled={pwBusy}>
                  {pwBusy ? 'Updating…' : 'Update password'}
                </ActionButton>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}

function prettyUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device'
  // Cheap heuristics — better than dumping the raw UA string at the user
  const isMobile = /Mobile|iPhone|iPad|Android/.test(ua)
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' :
    'Browser'
  const os =
    /Mac OS X/.test(ua) ? 'macOS' :
    /Windows/.test(ua) ? 'Windows' :
    /Linux/.test(ua) ? 'Linux' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    ''
  return `${browser} on ${os}${isMobile ? ' (mobile)' : ''}`.trim()
}

function DeviceIcon({ ua }: { ua: string | null }) {
  const isMobile = ua && /Mobile|iPhone|iPad|Android/.test(ua)
  return (
    <div className="w-9 h-9 rounded-lg shrink-0 bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center text-gray-500 dark:text-gray-400">
      {isMobile ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
        </svg>
      )}
    </div>
  )
}
