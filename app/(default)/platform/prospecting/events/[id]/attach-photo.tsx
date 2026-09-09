'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { downscaleImageFile } from '@/lib/image-downscale'
import { attachHeadshotAction, resendHeadshotAction } from '../admin-actions'

/** Per-row: attach the camera's edited file (delivers on first attach,
 *  replaces on a later one) or resend a delivered headshot. */
export default function AttachPhoto({
  eventId,
  captureId,
  delivered,
}: {
  eventId: string
  captureId: string
  delivered: boolean
}) {
  const router = useRouter()
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onPick(file: File | undefined) {
    if (!file) return
    setMsg(null)
    startTransition(async () => {
      let toSend: File | Blob = file
      try {
        toSend = await downscaleImageFile(file)
      } catch {
        /* keep the original */
      }
      const fd = new FormData()
      fd.set('photo', toSend, file.name)
      const res = await attachHeadshotAction(eventId, captureId, fd)
      setMsg(res.ok ? (res.delivered ? 'Attached + emailed' : 'Photo replaced') : res.error)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="cursor-pointer rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200">
        {pending ? 'Working…' : delivered ? 'Replace' : 'Attach photo'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={pending}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </label>
      {delivered ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const sent = await resendHeadshotAction(eventId, captureId)
              setMsg(sent ? 'Resent' : 'Couldn’t resend')
            })
          }
          className="rounded-md px-2 py-1 font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          Resend
        </button>
      ) : null}
      {msg ? <span className="text-gray-500">{msg}</span> : null}
    </div>
  )
}
