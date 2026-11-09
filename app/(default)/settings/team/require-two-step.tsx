'use client'

import { useState } from 'react'
import { runAction } from '@/lib/run-action'
import { ActionButton } from '@/components/ui/action-button'
import { SettingsSection } from '../settings-kit'
import { setRequireTwoFactor } from './actions'

/** Owner-only: make two-step sign-in a requirement for everyone on the team. */
export default function RequireTwoStep({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setError(null)
    setPending(true)
    try {
      const next = !on
      const res = await runAction(() => setRequireTwoFactor(next))
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOn(next)
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsSection
      title="Two-step sign-in for the team"
      description="Ask everyone who signs in to your practice for a code from an authenticator app, on top of their password."
      className="mt-4"
    >
      <p className="text-sm text-gray-800 dark:text-gray-100">
        {on
          ? 'Required. A teammate without it is sent to set it up the next time they open the app.'
          : 'Not required. Anyone can still turn it on for themselves under Settings → Security.'}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="mt-4">
        <ActionButton variant={on ? 'secondary' : 'primary'} pending={pending} onClick={toggle}>
          {on ? 'Stop requiring it' : 'Require two-step sign-in'}
        </ActionButton>
      </div>
    </SettingsSection>
  )
}
