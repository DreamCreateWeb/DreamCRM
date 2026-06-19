import { useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type ActionResult = { ok: boolean; error?: string } | void

/**
 * Makes a server-backed boolean feel instant. The UI flips the moment you click
 * (optimistic), the server action runs in a transition, then a router.refresh()
 * reconciles to the real value. On failure React's useOptimistic automatically
 * reverts to the server value when the transition ends — so a rejected write
 * snaps back instead of lying — and `onError` surfaces the message.
 *
 *   const fav = useOptimisticToggle(row.isFeatured,
 *     (next) => next ? featureAction(id) : unfeatureAction(id),
 *     { onError: (m) => toast(m, { tone: 'urgent' }) })
 *   <Toggle checked={fav.value} disabled={fav.pending} onChange={fav.set} />
 */
export function useOptimisticToggle(
  serverValue: boolean,
  action: (next: boolean) => Promise<ActionResult>,
  opts?: { onError?: (message: string) => void },
): { value: boolean; pending: boolean; toggle: () => void; set: (next: boolean) => void } {
  const router = useRouter()
  const [optimistic, setOptimistic] = useOptimistic(serverValue)
  const [pending, startTransition] = useTransition()

  function apply(next: boolean) {
    startTransition(async () => {
      setOptimistic(next)
      try {
        const result = await action(next)
        if (result && result.ok === false) {
          // Leave the transition without refreshing → optimistic reverts to server.
          opts?.onError?.(result.error ?? 'Something went wrong. Please try again.')
          return
        }
        router.refresh()
      } catch (e) {
        // Action threw (void actions signal failure this way) — revert + report.
        opts?.onError?.(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      }
    })
  }

  return {
    value: optimistic,
    pending,
    toggle: () => apply(!optimistic),
    set: apply,
  }
}
