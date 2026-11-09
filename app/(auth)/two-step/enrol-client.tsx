'use client'

import { TwoStepEnrol } from '@/components/auth/two-step'
import { signOut } from '@/lib/auth/client'
import { runAction } from '@/lib/run-action'

export default function EnrolClient() {
  async function leave() {
    await runAction(async () => {
      await signOut()
      return { ok: true as const }
    })
    window.location.assign('/signin')
  }
  return (
    <>
      <TwoStepEnrol required onEnrolled={() => window.location.assign('/')} />
      <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
        Not now?{' '}
        <button type="button" className="underline hover:no-underline" onClick={leave}>
          Sign out
        </button>
      </p>
    </>
  )
}
