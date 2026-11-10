'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { TextInput } from '@/components/ui/form-fields'
import { useToast } from '@/components/ui/toast'
import { runAction } from '@/lib/run-action'
import { NANP_FAILURE_LABELS, type NanpFailure } from '@/lib/phone-nanp'
import { formatProspectPhone } from '@/lib/types/prospecting'
import { updateProspectPhoneAction } from './admin-actions'

/**
 * The right number, from the drawer (P-01). A record a call or a check
 * parked on a dead or wrong number has exactly one way back: someone types
 * the number that works. The save replaces the phone (source: a call),
 * clears the old verdict and rescores; the next verify checks the new line.
 */
export default function PhoneEditor({ prospectId, phone }: { prospectId: string; phone: string | null }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  // Focus the field once it opens (a11y: no autoFocus attribute).
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  const save = () => {
    const typed = value.trim()
    if (!typed) return
    startTransition(async () => {
      setError(null)
      const r = await runAction(() => updateProspectPhoneAction(prospectId, typed))
      if (!r.ok) {
        setError(
          'error' in r
            ? r.error
            : (NANP_FAILURE_LABELS[r.reason as NanpFailure] ?? 'That does not look like a US number.'),
        )
        return
      }
      toast(`Number saved — ${formatProspectPhone(r.phone)} is the dial target again; Verify now checks the line`)
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <ActionButton
        size="sm"
        variant="ghost"
        title={phone ? 'Replace this number with the one that works' : 'Add the practice’s number'}
        onClick={() => {
          setValue(formatProspectPhone(phone) ?? '')
          setError(null)
          setOpen(true)
        }}
      >
        {phone ? '✎ Fix number' : '＋ Add number'}
      </ActionButton>
    )
  }

  const id = `prospect-phone-${prospectId}`
  return (
    <span className="inline-flex flex-col items-end gap-1" data-phone-editor>
      <span className="inline-flex items-center gap-1.5">
        <label htmlFor={id} className="sr-only">
          Phone number
        </label>
        <TextInput
          ref={input}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(404) 555-1212"
          className="w-40 tabular-nums"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            }
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        <ActionButton size="sm" variant="primary" pending={pending} disabled={pending || !value.trim()} onClick={save}>
          Save
        </ActionButton>
        <ActionButton size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </ActionButton>
      </span>
      {error && (
        <span role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </span>
  )
}
