'use client'

import { useEffect, useState } from 'react'
import { DEMO_NOTES_PREFIX, writeBeatNote } from './presenter-session'

/** Per-beat presenter notes — sessionStorage only ('dc.demo-notes.{beatId}'),
 *  zero DB. Collapsed by default; the demo is the show, not the notepad. */
export default function BeatNotes({ beatId }: { beatId: string }) {
  const key = `${DEMO_NOTES_PREFIX}${beatId}`
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    try {
      setNote(sessionStorage.getItem(key) ?? '')
    } catch {
      setNote('')
    }
  }, [key])

  const save = (value: string) => {
    setNote(value)
    writeBeatNote(beatId, value)
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[11px] text-gray-500 hover:text-gray-300"
      >
        {open ? '▾ Notes' : note ? '▸ Notes •' : '▸ Notes'}
      </button>
      {open && (
        <textarea
          rows={2}
          value={note}
          onChange={(e) => save(e.target.value)}
          placeholder="What they said, what to circle back on…"
          className="mt-1 w-full rounded-md bg-white/5 px-2 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-white/25"
        />
      )}
    </div>
  )
}
