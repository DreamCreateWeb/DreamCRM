'use client'

import { TwoStepEnrol } from '@/components/auth/two-step'
import { signOut } from '@/lib/auth/client'

export default function EnrolClient() {
  async function leave() {
    // An auth screen's await sits inside a try (the public-forms guard): a
    // failed sign-out still leaves the page — /signin re-reads the session.
    try {
      await signOut()
    } catch {
      /* fall through to the redirect */
    }
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
