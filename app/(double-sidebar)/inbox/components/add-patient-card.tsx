'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { InboxTerminology } from '@/lib/inbox-terminology'
import { addPatientFromEmailAction } from '../mailbox-actions'

interface Props {
  messageId: string
  fromEmail: string
  fromName: string | null
  terminology: InboxTerminology
}

/**
 * Right-column card shown when the email sender doesn't match an existing
 * contact (patient for clinic tenants, client for the platform tenant).
 * Lets the user create a record in one click — useful for front-desk admins
 * who get inquiry emails from prospective patients, or for the platform
 * tenant adding new clinic owners they're talking to.
 *
 * Splits the sender's display name into first/last on a best-effort basis;
 * leaves the rest of the record empty for them to fill in later.
 */
export default function AddPatientCard({ messageId, fromEmail, fromName, terminology }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [first, last] = splitName(fromName ?? fromEmail.split('@')[0])
  const [firstName, setFirstName] = useState(first)
  const [lastName, setLastName] = useState(last)
  const [phone, setPhone] = useState('')

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        await addPatientFromEmailAction({
          messageId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: fromEmail,
          phone: phone.trim() || null,
        })
        router.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <aside className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700/60 bg-white/40 dark:bg-stone-900/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400 dark:text-stone-500">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-[12px] font-medium text-stone-700 dark:text-stone-200">Not in CRM yet</div>
      </div>
      <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-3 leading-relaxed">
        Add <span className="text-stone-700 dark:text-stone-300">{fromEmail}</span> as a {terminology.contact} so future emails from them link to a record.
      </p>

      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <Field label="First" value={firstName} onChange={setFirstName} />
          <Field label="Last" value={lastName} onChange={setLastName} />
        </div>
        <Field label="Phone (optional)" value={phone} onChange={setPhone} />
      </div>

      {error && (
        <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">{error}</div>
      )}

      <button
        onClick={handleSubmit}
        disabled={pending || !firstName.trim() || !lastName.trim()}
        className={cn(
          'w-full mt-3 text-[12px] font-medium rounded-md px-2.5 py-1.5 transition-colors',
          'bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {pending ? 'Adding…' : `Add as ${terminology.contact}`}
      </button>
    </aside>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-0.5">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 text-[12px] rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/40 text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-stone-100/10"
      />
    </label>
  )
}

// "Lisa Mabray" → ["Lisa", "Mabray"]
// "Lisa M Smith" → ["Lisa M", "Smith"]
// "Lisa" → ["Lisa", ""]
function splitName(raw: string): [string, string] {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ['', '']
  if (parts.length === 1) return [parts[0], '']
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]]
}
