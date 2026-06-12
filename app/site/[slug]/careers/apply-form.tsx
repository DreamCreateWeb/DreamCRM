'use client'

import { useState, useTransition } from 'react'
import { submitApplication } from './actions'
import FormTrustFields from '@/components/clinic-site/form-trust-fields'
import {
  ALLOWED_RESUME_TYPES,
  MAX_RESUME_BYTES,
  RESUME_ACCEPT,
} from '@/lib/types/careers'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const BORDER = '#E8E2D9'
const FIELD =
  'w-full text-[15px] px-3.5 py-3 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-offset-0'

export default function ApplyForm({ orgId, jobPostingId, brand }: { orgId: string; jobPostingId: string; brand: string }) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [resumeName, setResumeName] = useState<string | null>(null)

  if (done) {
    return (
      <div className="rounded-2xl border p-6 text-center" style={{ borderColor: BORDER, backgroundColor: `${brand}10` }}>
        <p className="text-lg font-semibold" style={{ color: INK }}>
          Thanks — we got your application!
        </p>
        <p className="text-[15px] mt-1" style={{ color: INK_MUTED }}>
          Someone from our team will be in touch if it&apos;s a fit.
        </p>
      </div>
    )
  }

  function handleResumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = e.currentTarget.files?.[0]
    if (!file) {
      setResumeName(null)
      return
    }
    // Client-side guard mirroring the server's authoritative check — fail fast
    // with a friendly message before uploading megabytes.
    if (file.size > MAX_RESUME_BYTES) {
      setError('Résumé must be under 5MB.')
      e.currentTarget.value = ''
      setResumeName(null)
      return
    }
    if (file.type && !(ALLOWED_RESUME_TYPES as readonly string[]).includes(file.type)) {
      setError('Résumé must be a PDF or Word document.')
      e.currentTarget.value = ''
      setResumeName(null)
      return
    }
    setResumeName(file.name)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        const fd = new FormData(e.currentTarget)
        start(async () => {
          try {
            await submitApplication(fd)
            setDone(true)
          } catch (err) {
            setError((err as Error).message)
          }
        })
      }}
      className="space-y-3.5"
    >
      <FormTrustFields />
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="jobPostingId" value={jobPostingId} />

      <div className="grid sm:grid-cols-2 gap-3.5">
        <input name="name" required autoComplete="name" placeholder="Full name *" className={FIELD} style={{ borderColor: BORDER }} />
        <input name="email" type="email" inputMode="email" autoComplete="email" required placeholder="Email *" className={FIELD} style={{ borderColor: BORDER }} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3.5">
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="Phone" className={FIELD} style={{ borderColor: BORDER }} />
        <input name="linkedinUrl" type="url" inputMode="url" placeholder="LinkedIn (optional)" className={FIELD} style={{ borderColor: BORDER }} />
      </div>
      <textarea
        name="coverNote"
        rows={4}
        placeholder="Tell us a bit about yourself and why you'd be a great fit…"
        className={`${FIELD} resize-y`}
        style={{ borderColor: BORDER }}
      />
      <div>
        <label className="block text-[13px] font-medium mb-1" style={{ color: INK_MUTED }}>
          Résumé (PDF or Word, optional)
        </label>
        <input
          name="resume"
          type="file"
          accept={RESUME_ACCEPT}
          onChange={handleResumeChange}
          className="text-[14px] text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:cursor-pointer"
          style={{ color: INK_MUTED }}
        />
        {resumeName && (
          <p className="text-[13px] mt-1.5 flex items-center gap-1.5" style={{ color: INK }}>
            <span aria-hidden="true">📎</span>
            <span className="truncate">{resumeName}</span>
          </p>
        )}
      </div>

      {error && <p className="text-[14px] text-rose-600">{error}</p>}

      <button
        disabled={pending}
        className="w-full sm:w-auto text-[15px] font-semibold px-6 py-3 rounded-xl text-white disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {pending ? 'Submitting…' : 'Submit application'}
      </button>
      <p className="text-[12px]" style={{ color: INK_MUTED }}>
        We only use this to reach you about the role — never spam.
      </p>
    </form>
  )
}
