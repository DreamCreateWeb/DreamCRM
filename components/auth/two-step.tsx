'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { authClient } from '@/lib/auth/client'
import { runAction } from '@/lib/run-action'
import { ActionButton } from '@/components/ui/action-button'
import { CopyChip } from '@/components/ui/copy-chip'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { TONE_PILL } from '@/lib/ui/encodings'

/**
 * Two-step sign-in, the three screens (ML-58): ENROL (QR + the manual key +
 * backup codes shown ONCE behind an "I saved them" gate + the first code),
 * DISABLE (re-asks the password, confirm awaited BEFORE the call), and
 * REGENERATE (new backup codes, shown once, password again).
 *
 * Better-auth's own twoFactor plugin does every cryptographic step; this file
 * only drives its client. Nothing here stores or logs a code — the secret and
 * the codes live in the plugin's table, and the values on screen are cleared
 * from state the moment the person is done.
 */

type Fail = { ok: false; error: string; stale?: true }
type Ok<T> = { ok: true; data: T }

const FALLBACK_ERROR = 'That did not work. Check it and try again.'

/** Adapt a better-auth client call to runAction's `{ ok }` shape. */
async function call<T>(
  fn: () => Promise<{ data: T | null; error: { message?: string } | null }>,
): Promise<Ok<T> | Fail> {
  const res = await runAction(async () => {
    const r = await fn()
    if (r.error) return { ok: false as const, error: r.error.message || FALLBACK_ERROR }
    return { ok: true as const, data: r.data as T }
  })
  return res as Ok<T> | Fail
}

function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? ''
  } catch {
    return ''
  }
}

function groupKey(key: string): string {
  return key.replace(/(.{4})/g, '$1 ').trim()
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className={`mt-3 text-sm ${TONE_PILL.urgent} px-3 py-2 rounded`}>
      {message}
    </div>
  )
}

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-gray-800 dark:text-gray-100">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3">
        <CopyChip value={codes.join('\n')} label="Copy all backup codes" />
      </div>
    </div>
  )
}

/**
 * Enrol. `onEnrolled` runs once the first code verified; the host navigates
 * with `window.location.assign` (the session's user row changed).
 */
export function TwoStepEnrol({ onEnrolled, required = false }: { onEnrolled: () => void; required?: boolean }) {
  const [stage, setStage] = useState<'password' | 'scan'>('password')
  const [password, setPassword] = useState('')
  const [uri, setUri] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [qr, setQr] = useState('')
  const [saved, setSaved] = useState(false)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    if (!uri) {
      setQr('')
      return
    }
    QRCode.toString(uri, { type: 'svg', margin: 1, width: 192 })
      .then((svg) => {
        if (live) setQr(svg)
      })
      .catch(() => {
        if (live) setQr('')
      })
    return () => {
      live = false
    }
  }, [uri])

  async function start(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await call(() => authClient.twoFactor.enable({ password }))
      if (!res.ok) {
        setError(res.error)
        return
      }
      setUri(res.data.totpURI)
      setCodes(res.data.backupCodes)
      setPassword('')
      setStage('scan')
    } finally {
      setPending(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await call(() => authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, '') }))
      if (!res.ok) {
        setError(res.error)
        return
      }
      setUri('')
      setCodes([])
      onEnrolled()
    } finally {
      setPending(false)
    }
  }

  if (stage === 'password') {
    return (
      <form onSubmit={start}>
        <p className="text-sm text-gray-600 dark:text-gray-300 max-w-prose">
          {required
            ? 'Your account needs two-step sign-in. '
            : 'Add a second step to signing in. '}
          You&apos;ll use an authenticator app on your phone (any app that scans a QR code works) to
          make a six-digit code each time you sign in.
        </p>
        <label className="block text-sm font-medium mt-4 mb-1" htmlFor="twostep-password">
          Confirm your password to begin
        </label>
        <input
          id="twostep-password"
          className="form-input w-full max-w-xs"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorLine message={error} />
        <div className="mt-4">
          <ActionButton type="submit" variant="primary" pending={pending}>
            Start set-up
          </ActionButton>
        </div>
      </form>
    )
  }

  const key = secretFromUri(uri)
  return (
    <div className="space-y-6">
      <section aria-labelledby="twostep-scan">
        <h3 id="twostep-scan" className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          1. Scan this with your authenticator app
        </h3>
        {qr ? (
          <div
            role="img"
            aria-label="QR code for your authenticator app"
            className="mt-3 w-48 h-48 p-2 rounded-lg bg-white [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        ) : null}
        {key && (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Can&apos;t scan? Enter this key by hand:
            <span className="ml-2 inline-block align-middle">
              <CopyChip value={key} label="Copy setup key" />
            </span>
            <span className="sr-only"> {groupKey(key)}</span>
          </p>
        )}
      </section>

      <section aria-labelledby="twostep-backup">
        <h3 id="twostep-backup" className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          2. Save your backup codes
        </h3>
        <p className="mt-1 mb-3 text-sm text-gray-600 dark:text-gray-300 max-w-prose">
          Each code works once, if your phone is lost. This is the only time we show them.
        </p>
        <BackupCodes codes={codes} />
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
          <input type="checkbox" className="form-checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I saved them
        </label>
      </section>

      <form onSubmit={verify} aria-labelledby="twostep-verify">
        <h3 id="twostep-verify" className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          3. Enter the six-digit code
        </h3>
        <input
          aria-label="Six-digit code from your authenticator app"
          className="form-input mt-2 w-40 tracking-widest"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={!saved}
          required
        />
        {!saved && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Tick &ldquo;I saved them&rdquo; to continue.</p>
        )}
        <ErrorLine message={error} />
        <div className="mt-4">
          <ActionButton type="submit" variant="primary" pending={pending} disabled={!saved || code.trim().length < 6}>
            Turn on two-step sign-in
          </ActionButton>
        </div>
      </form>
    </div>
  )
}

/** Settings card: status, disable (password again), new backup codes. */
export function TwoStepManage({ enabled, required }: { enabled: boolean; required: boolean }) {
  const confirm = useConfirm()
  const [mode, setMode] = useState<'idle' | 'disable' | 'regen'>('idle')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newCodes, setNewCodes] = useState<string[] | null>(null)
  const [saved, setSaved] = useState(false)

  if (!enabled) {
    return <TwoStepEnrol required={required} onEnrolled={() => window.location.assign('/settings/security')} />
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // The dialog law: awaited BEFORE the transition.
    const ok = await confirm({
      title: 'Turn off two-step sign-in?',
      message: 'Signing in will need only your password again.',
      confirmLabel: 'Turn off',
      danger: true,
    })
    if (!ok) return
    setPending(true)
    try {
      const res = await call(() => authClient.twoFactor.disable({ password }))
      if (!res.ok) {
        setError(res.error)
        return
      }
      setPassword('')
      window.location.assign('/settings/security')
    } finally {
      setPending(false)
    }
  }

  async function regenerate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await call(() => authClient.twoFactor.generateBackupCodes({ password }))
      if (!res.ok) {
        setError(res.error)
        return
      }
      setPassword('')
      setSaved(false)
      setNewCodes(res.data.backupCodes)
    } finally {
      setPending(false)
    }
  }

  if (newCodes) {
    return (
      <div>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300 max-w-prose">
          Your old codes no longer work. Each new code works once — this is the only time we show them.
        </p>
        <BackupCodes codes={newCodes} />
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
          <input type="checkbox" className="form-checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I saved them
        </label>
        <div className="mt-4">
          <ActionButton
            variant="primary"
            disabled={!saved}
            onClick={() => {
              setNewCodes(null)
              setMode('idle')
            }}
          >
            Done
          </ActionButton>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-800 dark:text-gray-100">
        Two-step sign-in is <strong>on</strong>. Signing in asks for a code from your authenticator app.
      </p>
      {mode === 'idle' && (
        <div className="mt-4 flex flex-wrap gap-3">
          <ActionButton variant="secondary" onClick={() => setMode('regen')}>
            Get new backup codes
          </ActionButton>
          {!required && (
            <ActionButton variant="danger" onClick={() => setMode('disable')}>
              Turn off
            </ActionButton>
          )}
        </div>
      )}
      {required && mode === 'idle' && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Your account requires two-step sign-in, so it can&apos;t be turned off.
        </p>
      )}
      {mode !== 'idle' && (
        <form onSubmit={mode === 'disable' ? disable : regenerate} className="mt-4">
          <label className="block text-sm font-medium mb-1" htmlFor="twostep-manage-password">
            Confirm your password
          </label>
          <input
            id="twostep-manage-password"
            className="form-input w-full max-w-xs"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <ErrorLine message={error} />
          <div className="mt-4 flex gap-3">
            <ActionButton type="submit" variant={mode === 'disable' ? 'danger' : 'primary'} pending={pending}>
              {mode === 'disable' ? 'Turn off two-step sign-in' : 'Make new codes'}
            </ActionButton>
            <ActionButton
              variant="ghost"
              onClick={() => {
                setMode('idle')
                setPassword('')
                setError(null)
              }}
            >
              Cancel
            </ActionButton>
          </div>
        </form>
      )}
    </div>
  )
}
