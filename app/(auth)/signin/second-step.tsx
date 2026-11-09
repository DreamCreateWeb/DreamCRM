'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth/client'
import { runAction } from '@/lib/run-action'
import { ActionButton } from '@/components/ui/action-button'
import { TONE_PILL } from '@/lib/ui/encodings'

/**
 * The second step of a two-step sign-in: six digits from the authenticator
 * app, or a one-time backup code. Reached only after the password step told us
 * a factor is on (better-auth's `twoFactorRedirect`); the portal's magic-link
 * path never lands here. A full page load follows success — the new session
 * cookie must be on the next request.
 */
export default function SecondStep({ redirectTo, onBack }: { redirectTo: string; onBack: () => void }) {
  const [useBackup, setUseBackup] = useState(false)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const clean = code.replace(/\s/g, '')
      const res = await runAction(async () => {
        const r = useBackup
          ? await authClient.twoFactor.verifyBackupCode({ code: clean })
          : await authClient.twoFactor.verifyTotp({ code: clean })
        return r.error
          ? { ok: false as const, error: r.error.message || 'That code did not work. Try again.' }
          : { ok: true as const }
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      window.location.assign(redirectTo)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="block text-sm font-medium mb-1" htmlFor="second-step-code">
        {useBackup ? 'Backup code' : 'Six-digit code'}
      </label>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        {useBackup
          ? 'Enter one of the backup codes you saved. Each works once.'
          : 'Open your authenticator app and enter the code for DreamCRM.'}
      </p>
      <input
        id="second-step-code"
        className="form-input w-full tracking-widest"
        inputMode={useBackup ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
      />
      {error && (
        <div role="alert" className={`mt-4 text-sm ${TONE_PILL.urgent} px-3 py-2 rounded`}>
          {error}
        </div>
      )}
      <ActionButton type="submit" variant="primary" pending={pending} className="w-full mt-6">
        Continue
      </ActionButton>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          className="underline hover:no-underline text-gray-600 dark:text-gray-300"
          onClick={() => {
            setUseBackup(!useBackup)
            setCode('')
            setError(null)
          }}
        >
          {useBackup ? 'Use my authenticator app' : 'Use a backup code'}
        </button>
        <button type="button" className="underline hover:no-underline text-gray-600 dark:text-gray-300" onClick={onBack}>
          Back to sign in
        </button>
      </div>
    </form>
  )
}
