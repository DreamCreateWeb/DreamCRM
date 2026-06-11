'use client'

import { signOut } from '@/lib/auth/client'

export default function PartnerSignOut() {
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut()
        window.location.assign('/signin')
      }}
      className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300"
    >
      Sign out
    </button>
  )
}
