'use client'

import { ActionButton } from '@/components/ui/action-button'
import { signOut } from '@/lib/auth/client'

export default function CallerSignOut() {
  return (
    <ActionButton
      size="sm"
      onClick={async () => {
        await signOut()
        window.location.assign('/signin')
      }}
    >
      Sign out
    </ActionButton>
  )
}
