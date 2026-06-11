'use client'

import { exitDemoMode } from '@/app/(default)/ecommerce/customers/admin-actions'

/**
 * Compact "Exit demo" chip for the header — shown only while the platform
 * admin is viewing a clinic/patient via the demo cookie. Replaces the old
 * full-width orange demo strip (DESIGN-SYSTEM.md Part 4): demo is now signalled
 * by an amber top hairline on the canvas + the org-switcher "Demo" pill + this
 * chip. It's a real form posting to the server action, so it works without JS.
 */
export default function DemoExitChip() {
  return (
    <form action={exitDemoMode} className="shrink-0">
      <button
        type="submit"
        title="Stop viewing this demo workspace"
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-amber-500/15 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
        Exit demo
      </button>
    </form>
  )
}
