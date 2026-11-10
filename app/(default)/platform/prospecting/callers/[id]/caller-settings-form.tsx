'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { TextInput, Textarea } from '@/components/ui/form-fields'
import { useToast } from '@/components/ui/toast'
import { isStaleFailure, runAction } from '@/lib/run-action'
import { US_STATES } from '@/lib/types/us-geo'
import { updateCallerSettingsAction } from '../../admin-actions'

export default function CallerSettingsForm({
  callerId,
  dailyTarget,
  states,
  notes,
}: {
  callerId: string
  dailyTarget: number
  states: string[]
  notes: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [target, setTarget] = useState(String(dailyTarget))
  const [stateText, setStateText] = useState(states.join(', '))
  const [noteText, setNoteText] = useState(notes)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const codes = stateText
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    const bad = codes.find((c) => !(US_STATES as readonly string[]).includes(c))
    if (bad) {
      setError(`"${bad}" is not a state code`)
      return
    }
    startTransition(async () => {
      const r = await runAction(() =>
        updateCallerSettingsAction({ callerId, dailyTarget: Number(target) || dailyTarget, states: codes, notes: noteText }),
      )
      if (!r.ok) {
        setError(r.error)
        if (isStaleFailure(r)) setStale(true)
        return
      }
      toast('Saved')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="cs-target">
          Daily target
        </label>
        <TextInput id="cs-target" type="number" min={1} max={500} className="w-full" value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="cs-states">
          States
        </label>
        <TextInput id="cs-states" className="w-full" value={stateText} onChange={(e) => setStateText(e.target.value)} placeholder="any" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="cs-notes">
          Notes (yours only)
        </label>
        <Textarea id="cs-notes" rows={3} className="w-full" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {stale ? (
        <ActionButton variant="secondary" onClick={() => window.location.reload()}>
          Refresh
        </ActionButton>
      ) : (
        <ActionButton type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </ActionButton>
      )}
    </form>
  )
}
