'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { changePassword } from '@/lib/auth-client'
import { relativeTime } from '@/lib/utils'
import { revokeOtherSessions, revokeSession } from './security-actions'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { SettingsSection, SettingsRow } from '../settings-kit'
import { SettingsTabs } from '../settings-tabs'

export interface SessionRow {
  id: string
  isCurrent: boolean
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

/** Minimum accepted by better-auth changePassword (unchanged contract). */
const MIN_PASSWORD_LENGTH = 8

export default function SecurityPanel({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'urgent' } | null>(null)

  // Password change UI
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  const strength = useMemo(() => scorePassword(newPw), [newPw])
  const meetsMin = newPw.length >= MIN_PASSWORD_LENGTH

  function resetPwForm() {
    setPwOpen(false)
    setCurrentPw('')
    setNewPw('')
    setPwError(null)
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    // Presentation-only guard; the auth call below still enforces its own rules.
    if (!meetsMin) {
      setPwError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setPwBusy(true)
    setPwError(null)
    const { error } = await changePassword({
      currentPassword: currentPw,
      newPassword: newPw,
      revokeOtherSessions: true,
    })
    setPwBusy(false)
    if (error) {
      setPwError(error.message ?? 'Unable to change password')
      return
    }
    resetPwForm()
    setToast({ message: 'Password updated. Other devices were signed out.', tone: 'ok' })
    router.refresh()
  }

  async function handleRevoke(id: string) {
    if (
      !(await confirm({
        title: 'Sign out this device?',
        message: "That session will be signed out immediately. They'll need to sign in again.",
        confirmLabel: 'Sign out',
        danger: true,
      }))
    )
      return
    startTransition(async () => {
      await revokeSession(id)
      setToast({ message: 'Signed out that device.', tone: 'ok' })
      router.refresh()
    })
  }

  async function handleRevokeOthers() {
    const others = sessions.filter((s) => !s.isCurrent)
    if (others.length === 0) return
    if (
      !(await confirm({
        title: `Sign out ${others.length} other device${others.length === 1 ? '' : 's'}?`,
        message: 'This device stays signed in. Every other session ends right away — do this if any look unfamiliar.',
        confirmLabel: 'Sign out everywhere else',
        danger: true,
      }))
    )
      return
    startTransition(async () => {
      await revokeOtherSessions()
      setToast({ message: 'Signed out all other devices.', tone: 'ok' })
      router.refresh()
    })
  }

  const otherCount = sessions.filter((s) => !s.isCurrent).length

  return (
    <div className="grow">
      <div className="p-6">
        <SettingsTabs
          tabs={[
            {
              id: 'sessions',
              label: 'Active sessions',
              content: (
                <SettingsSection
                  title="Active sessions"
                  description="Every device currently signed in to your account. If any look unfamiliar, sign them out."
                  action={
                    otherCount > 0 ? (
                      <ActionButton variant="danger" size="sm" onClick={handleRevokeOthers} disabled={pending}>
                        Sign out all other devices
                      </ActionButton>
                    ) : undefined
                  }
                >
                  <ul className="v2-well overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/40">
                    {sessions.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                        <DeviceIcon ua={s.userAgent} />
                        <div className="min-w-0 grow">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                              {prettyUserAgent(s.userAgent)}
                            </p>
                            {s.isCurrent && <StatusPill tone="ok" label="This device" title="The session you're using right now" />}
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-mono-num tabular-nums">{s.ipAddress ?? 'IP unknown'}</span>
                            <span aria-hidden> · </span>
                            <span title={new Date(s.updatedAt).toLocaleString()}>
                              Last active {relativeTime(s.updatedAt)}
                            </span>
                            <span aria-hidden> · </span>
                            <span title={new Date(s.createdAt).toLocaleString()}>
                              Signed in {relativeTime(s.createdAt)}
                            </span>
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
                </SettingsSection>
              ),
            },
            {
              id: 'password',
              label: 'Password',
              content: (
                <SettingsSection
                  title="Password"
                  description="Set a new password. For your safety, changing it signs you out of every other device."
                >
                  {!pwOpen ? (
                    <ActionButton variant="secondary" size="sm" onClick={() => setPwOpen(true)}>
                      Change password
                    </ActionButton>
                  ) : (
                    <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
                      <SettingsRow
                        label="Current password"
                        htmlFor="cur-pw"
                        control={
                          <input
                            id="cur-pw"
                            type="password"
                            autoComplete="current-password"
                            className="form-input w-full sm:w-72"
                            value={currentPw}
                            onChange={(e) => setCurrentPw(e.target.value)}
                            required
                            minLength={MIN_PASSWORD_LENGTH}
                          />
                        }
                      />
                      <SettingsRow
                        label="New password"
                        htmlFor="new-pw"
                        control={
                          <input
                            id="new-pw"
                            type="password"
                            autoComplete="new-password"
                            className="form-input w-full sm:w-72"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            required
                            minLength={MIN_PASSWORD_LENGTH}
                            aria-describedby="pw-strength pw-rules"
                          />
                        }
                      />

                      <PasswordStrength value={newPw} strength={strength} meetsMin={meetsMin} />

                      {pwError && (
                        <div
                          role="alert"
                          className="rounded-[var(--r-sm)] bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
                        >
                          {pwError}
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <ActionButton variant="secondary" size="sm" onClick={resetPwForm}>
                          Cancel
                        </ActionButton>
                        <ActionButton
                          variant="primary"
                          size="sm"
                          type="submit"
                          disabled={pwBusy || !meetsMin || currentPw.length < MIN_PASSWORD_LENGTH}
                        >
                          {pwBusy ? 'Updating…' : 'Update password'}
                        </ActionButton>
                      </div>
                    </form>
                  )}
                </SettingsSection>
              ),
            },
          ]}
        />
      </div>

      {toast && <FlashToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Password strength — computed from the typed value only (real).      */
/* ------------------------------------------------------------------ */

interface Strength {
  /** 0–4: too-short/weak → strong. */
  level: 0 | 1 | 2 | 3 | 4
  label: string
  tone: 'urgent' | 'warn' | 'ok'
  hasLength12: boolean
  hasLower: boolean
  hasUpper: boolean
  hasNumber: boolean
  hasSymbol: boolean
}

/**
 * A dependency-free, honest strength score derived purely from what's typed:
 * length is the dominant factor, character variety adds a step. This is a real
 * client-side heuristic — never a fabricated backend score — and it never
 * changes what gets submitted (the auth call enforces the actual minimum).
 */
function scorePassword(pw: string): Strength {
  const hasLength8 = pw.length >= MIN_PASSWORD_LENGTH
  const hasLength12 = pw.length >= 12
  const hasLength16 = pw.length >= 16
  const hasLower = /[a-z]/.test(pw)
  const hasUpper = /[A-Z]/.test(pw)
  const hasNumber = /\d/.test(pw)
  const hasSymbol = /[^A-Za-z0-9]/.test(pw)
  const variety = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length

  let level: Strength['level'] = 0
  if (!hasLength8) {
    level = pw.length === 0 ? 0 : 1
  } else {
    // 8+ chars is the floor; length + variety climb from there.
    let score = 1
    if (hasLength12) score += 1
    if (hasLength16) score += 1
    if (variety >= 3) score += 1
    level = Math.min(4, score) as Strength['level']
  }

  const label =
    level <= 1 ? (pw.length === 0 ? 'Enter a password' : 'Too short') : level === 2 ? 'Fair' : level === 3 ? 'Good' : 'Strong'
  const tone: Strength['tone'] = level <= 1 ? 'urgent' : level === 2 ? 'warn' : 'ok'

  return { level, label, tone, hasLength12, hasLower, hasUpper, hasNumber, hasSymbol }
}

const BAR_FILL = {
  urgent: 'bg-rose-500',
  warn: 'bg-amber-500',
  ok: 'bg-emerald-500',
} as const

const TEXT_TONE = {
  urgent: 'text-rose-700 dark:text-rose-300',
  warn: 'text-amber-700 dark:text-amber-300',
  ok: 'text-emerald-700 dark:text-emerald-300',
} as const

function PasswordStrength({ value, strength, meetsMin }: { value: string; strength: Strength; meetsMin: boolean }) {
  const segments = 4
  return (
    <div>
      {/* Meter */}
      <div className="flex items-center gap-2">
        <div className="flex grow gap-1" aria-hidden>
          {Array.from({ length: segments }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 grow rounded-full transition-colors ${
                i < strength.level ? BAR_FILL[strength.tone] : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>
        <span
          id="pw-strength"
          role="status"
          aria-live="polite"
          className={`w-16 shrink-0 text-right text-xs font-medium ${TEXT_TONE[strength.tone]}`}
        >
          {strength.label}
        </span>
      </div>

      {/* Requirements — the min is the only hard rule; the rest are nudges. */}
      <ul id="pw-rules" className="mt-2 space-y-1 text-xs">
        <Rule met={meetsMin} required label={`At least ${MIN_PASSWORD_LENGTH} characters (required)`} />
        <Rule met={strength.hasLength12} label="12+ characters for a stronger password" />
        <Rule met={strength.hasLower && strength.hasUpper} label="Mix upper- and lower-case letters" />
        <Rule met={strength.hasNumber || strength.hasSymbol} label="Add a number or symbol" />
      </ul>

      {/* Live count, monospaced per the numerals rule. */}
      <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
        <span className="font-mono-num tabular-nums">{value.length}</span> characters
      </p>
    </div>
  )
}

function Rule({ met, label, required = false }: { met: boolean; label: string; required?: boolean }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center ${
          met ? 'text-emerald-600 dark:text-emerald-400' : required ? 'text-rose-500 dark:text-rose-400' : 'text-gray-300 dark:text-gray-600'
        }`}
      >
        {met ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M6.4 11.2 3.3 8.1l1.1-1.1 2 2 4.2-4.2 1.1 1.1z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-2 w-2 fill-current">
            <circle cx="8" cy="8" r="8" />
          </svg>
        )}
      </span>
      <span className={met ? 'text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}>{label}</span>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* User-agent → readable device label (heuristics over the raw UA).    */
/* ------------------------------------------------------------------ */

function prettyUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device'
  const isMobile = /Mobile|iPhone|iPad|Android/.test(ua)
  // Order matters — Edge/Chrome/Firefox all carry "Safari" tokens in their UA.
  const browser =
    /Edg(?:e|A|iOS)?\//.test(ua) ? 'Edge' :
    /OPR\/|Opera/.test(ua) ? 'Opera' :
    /Chrome\/|CriOS/.test(ua) ? 'Chrome' :
    /Firefox\/|FxiOS/.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' :
    'Browser'
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Windows/.test(ua) ? 'Windows' :
    /Android/.test(ua) ? 'Android' :
    /(?:Linux|X11)/.test(ua) ? 'Linux' :
    ''
  const device = os ? `${browser} on ${os}` : browser
  return `${device}${isMobile && os !== 'iOS' && os !== 'Android' ? ' (mobile)' : ''}`.trim()
}

function DeviceIcon({ ua }: { ua: string | null }) {
  const isMobile = ua && /Mobile|iPhone|iPad|Android/.test(ua)
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-400">
      {isMobile ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
        </svg>
      )}
    </div>
  )
}
