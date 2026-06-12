'use client'

import { useState, useEffect } from 'react'
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from '@/lib/form-trust'

/**
 * Hidden spam-trust fields for every public form — a honeypot input + a
 * mount-timestamp time-trap. See lib/form-trust.ts for the doctrine.
 *
 * The honeypot is hidden the robust way (off-screen + aria-hidden + tabIndex
 * -1 + autoComplete off) rather than `display:none`, which some bots skip; a
 * sighted/keyboard user never reaches it. The timestamp is set on mount in an
 * effect so it reflects when the form actually became interactive (and so SSR
 * output is stable — no hydration mismatch from Date.now() at render).
 *
 * Drop `<FormTrustFields />` inside any <form>. For forms that build FormData
 * by hand (not a native submit), read these field names off the rendered inputs
 * or include them in the FormData manually; here they're plain named inputs so
 * a native `new FormData(formEl)` picks them up automatically.
 */
export default function FormTrustFields() {
  const [loadedAt, setLoadedAt] = useState('')
  useEffect(() => {
    setLoadedAt(String(Date.now()))
  }, [])

  return (
    <>
      {/* Honeypot — visually + programmatically hidden, but present in the DOM
          so naive bots autofill it. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
          padding: 0,
          margin: -1,
        }}
      >
        <label htmlFor={HONEYPOT_FIELD}>Leave this field empty</label>
        <input
          type="text"
          id={HONEYPOT_FIELD}
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      {/* Time-trap — set on mount. */}
      <input type="hidden" name={TIMETRAP_FIELD} value={loadedAt} readOnly />
    </>
  )
}
