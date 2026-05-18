'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import TaskDrawer, { type TaskDrawerData } from '../_components/task-drawer'

/**
 * Thin client wrapper: opens the drawer when `?t=<id>` is in the URL,
 * closes by clearing the param. Lets the parent (server component) decide
 * which task to render.
 */
export default function TaskListClient({ task }: { task: TaskDrawerData | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  function close() {
    const params = new URLSearchParams(sp.toString())
    params.delete('t')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return <TaskDrawer task={task} onClose={close} />
}
