'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { runAction } from '@/lib/run-action'
import { archiveCallerAction, resendCallerInviteAction, setCallerStatusAction } from '../admin-actions'

/**
 * Resend / Pause / Resume / Archive on a caller row. The confirm dialog is
 * awaited BEFORE the transition (the dialog law); every await rides
 * runAction; the pressed button is the one that spins.
 */
export default function CallerRowActions({
  callerId,
  name,
  status,
  linked,
}: {
  callerId: string
  name: string
  status: string
  linked: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<'resend' | 'pause' | 'resume' | 'archive' | null>(null)
  const [stale, setStale] = useState(false)

  if (status === 'archived') return null
  if (stale) {
    return (
      <ActionButton size="sm" variant="secondary" onClick={() => window.location.reload()}>
        Refresh
      </ActionButton>
    )
  }

  const run = (kind: NonNullable<typeof active>, fn: () => Promise<{ ok: boolean; error?: string; stale?: true }>, done: string) => {
    setActive(kind)
    startTransition(async () => {
      try {
        const r = await runAction(fn)
        if (!r.ok) {
          if ('stale' in r && r.stale) setStale(true)
          toast(r.error ?? 'Could not do that', { tone: 'urgent' })
          return
        }
        toast(done)
        router.refresh()
      } finally {
        setActive(null)
      }
    })
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {!linked && (
        <ActionButton
          size="sm"
          variant="secondary"
          pending={pending && active === 'resend'}
          disabled={pending}
          onClick={() => run('resend', () => resendCallerInviteAction(callerId), `Invite re-sent to ${name}`)}
        >
          Resend invite
        </ActionButton>
      )}
      {status === 'active' && (
        <ActionButton
          size="sm"
          variant="secondary"
          pending={pending && active === 'pause'}
          disabled={pending}
          onClick={() => run('pause', () => setCallerStatusAction(callerId, 'paused'), `${name} is paused`)}
        >
          Pause
        </ActionButton>
      )}
      {status === 'paused' && (
        <ActionButton
          size="sm"
          variant="primary"
          pending={pending && active === 'resume'}
          disabled={pending}
          onClick={() => run('resume', () => setCallerStatusAction(callerId, 'active'), `${name} is calling again`)}
        >
          Resume
        </ActionButton>
      )}
      <ActionButton
        size="sm"
        variant="ghost"
        pending={pending && active === 'archive'}
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: `Archive ${name}?`,
            message: 'Their account closes and every practice they hold goes back to the pool. Their log stays.',
            confirmLabel: 'Archive',
            danger: true,
          })
          if (!ok) return
          run('archive', () => archiveCallerAction(callerId), `${name} archived`)
        }}
      >
        Archive
      </ActionButton>
    </div>
  )
}
