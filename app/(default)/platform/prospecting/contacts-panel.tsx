'use client'

import { useState, useTransition } from 'react'
import {
  CONTACT_ROLE_LABELS,
  EMAIL_VERIFY_LABELS,
  type ContactRole,
  type EmailVerifyStatus,
} from '@/lib/prospect-email'
import type { ProspectContactRow } from '@/lib/services/prospect-contacts'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import type { Tone } from '@/lib/ui/encodings'
import {
  addProspectContactAction,
  setPrimaryContactAction,
  deleteProspectContactAction,
  reverifyContactsAction,
} from './admin-actions'

const VERIFY_TONE: Record<EmailVerifyStatus, Tone> = {
  valid: 'ok',
  risky: 'warn',
  invalid: 'urgent',
  unknown: 'neutral',
}

/**
 * The reachability panel — every discovered/entered address, its role and
 * deliverability, which one we reach out on (★), and the controls to pin,
 * remove, re-verify, or add the address you found on the call. Replaces the
 * drawer's single "Email" line.
 */
export default function ContactsPanel({
  prospectId,
  contacts,
}: {
  prospectId: string
  contacts: ProspectContactRow[]
}) {
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = () =>
    startTransition(async () => {
      setError(null)
      const res = await addProspectContactAction({ prospectId, email: email.trim(), name: name.trim() || undefined })
      if (res.ok) {
        setEmail('')
        setName('')
        setAdding(false)
      } else {
        setError(res.error)
      }
    })

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Contacts {contacts.length > 0 && <span className="text-gray-400">· {contacts.length}</span>}
        </div>
        <div className="flex items-center gap-2">
          {contacts.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => reverifyContactsAction(prospectId).then(() => {}))}
              className="text-xs text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 disabled:opacity-50"
              title="Re-run MX deliverability checks"
            >
              ↻ Re-verify
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
          >
            {adding ? 'Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {contacts.length === 0 && !adding && (
        <p className="text-sm text-gray-400">
          No email found on their site — this is a phone-first prospect. Add one here if you track it down.
        </p>
      )}

      <ul className="space-y-1.5">
        {contacts.map((c) => (
          <li
            key={c.id}
            className="flex items-start justify-between gap-2 rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {c.isPrimary && <span title="The address we reach out on">★</span>}
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.email}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <StatusPill tone={VERIFY_TONE[c.verifyStatus]} label={EMAIL_VERIFY_LABELS[c.verifyStatus]} />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {CONTACT_ROLE_LABELS[c.role as ContactRole] ?? c.role}
                  {c.name ? ` · ${c.name}` : ''}
                  {c.source === 'manual' ? ' · added by you' : ''}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {!c.isPrimary && c.verifyStatus !== 'invalid' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(() => setPrimaryContactAction(prospectId, c.id))}
                  className="text-xs text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 disabled:opacity-50"
                  title="Reach out on this address"
                >
                  Pin ★
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => deleteProspectContactAction(prospectId, c.id))}
                className="text-xs text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50"
                aria-label="Remove contact"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-2 space-y-2 rounded-[var(--r-xs)] border border-dashed border-[color:var(--color-hairline)] p-3">
          <input
            className="form-input w-full text-sm"
            type="email"
            placeholder="drjane@theirpractice.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="form-input w-full text-sm"
            type="text"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <ActionButton size="sm" variant="primary" disabled={pending || !email.trim()} onClick={add}>
            {pending ? 'Verifying…' : 'Add & pin'}
          </ActionButton>
        </div>
      )}
    </div>
  )
}
