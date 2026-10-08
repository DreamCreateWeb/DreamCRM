'use client'

import { useEffect, useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { TONE_TEXT } from '@/lib/ui/encodings'
import {
  EMPTY_PAYER_NOTE,
  PAYER_NETWORK_OPTIONS,
  PAYER_NOTEBOOK_COPY as COPY,
  PAYER_PAYS_ON_OPTIONS,
  payerNoteHasContent,
  type PayerNoteFields,
  type PayerNoteView,
} from '@/lib/payer-notebook'
import { savePayerNoteAction } from './actions'

/**
 * THE PAYER NOTEBOOK on the result card (2026-10-08): the practice's own
 * facts about this payer — fee schedule, network, pays-on, claims address,
 * the phone that answers. Read-only at rest (a line per fact, or one quiet
 * sentence when nothing is written), an inline form on Edit. Saving is a
 * server action keyed on the payer, so the next patient on this payer gets
 * the same lines on their sheet without anyone retyping them.
 */

const INPUT = 'form-input w-full text-sm'

function Line({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex flex-wrap gap-x-2 text-sm">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-800 dark:text-gray-100 min-w-0 break-words">{value}</dd>
    </div>
  )
}

export function PayerNotebookCard({
  payerId,
  payerName,
  note,
  onSaved,
}: {
  payerId: string | null
  payerName: string
  note: PayerNoteView | null
  onSaved: (note: PayerNoteView) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<PayerNoteFields>(note ?? EMPTY_PAYER_NOTE)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // A new payer under the card resets the draft; an open editor keeps its typing.
  useEffect(() => {
    if (!editing) setDraft(note ?? EMPTY_PAYER_NOTE)
  }, [note, editing])

  function set<K extends keyof PayerNoteFields>(key: K, value: PayerNoteFields[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function save() {
    setError(null)
    start(async () => {
      const r = await savePayerNoteAction({ payerId, payerName, fields: draft })
      if (!r.ok) {
        setError(r.error)
        return
      }
      onSaved(r.note)
      setEditing(false)
    })
  }

  const network = PAYER_NETWORK_OPTIONS.find((o) => o.id === note?.network)?.label ?? null
  const paysOn = PAYER_PAYS_ON_OPTIONS.find((o) => o.id === note?.paysOn)?.label ?? null

  return (
    <section className="v2-well px-4 py-3" data-testid="payer-notebook" aria-labelledby="payer-notebook-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="payer-notebook-title" className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
            {COPY.title} · <span className="normal-case tracking-normal text-gray-700 dark:text-gray-200">{payerName}</span>
          </h3>
          {!editing && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{COPY.lede}</p>}
        </div>
        {!editing && (
          <ActionButton variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {COPY.edit}
          </ActionButton>
        )}
      </div>

      {editing ? (
        <form
          className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="block text-sm">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{COPY.fields.feeSchedule}</span>
            <input className={INPUT} value={draft.feeSchedule ?? ''} onChange={(e) => set('feeSchedule', e.target.value || null)} placeholder={COPY.hints.feeSchedule} />
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{COPY.fields.phone}</span>
            <input className={INPUT} value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value || null)} inputMode="tel" />
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{COPY.fields.network}</span>
            <select className={INPUT} value={draft.network ?? ''} onChange={(e) => set('network', (e.target.value || null) as PayerNoteFields['network'])}>
              <option value="">Not sure yet</option>
              {PAYER_NETWORK_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{COPY.fields.paysOn}</span>
            <select className={INPUT} value={draft.paysOn ?? ''} onChange={(e) => set('paysOn', (e.target.value || null) as PayerNoteFields['paysOn'])}>
              <option value="">Not sure yet</option>
              {PAYER_PAYS_ON_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="block mt-1 text-xs text-gray-500 dark:text-gray-400">{COPY.hints.paysOn}</span>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{COPY.fields.claimsAddress}</span>
            <input className={INPUT} value={draft.claimsAddress ?? ''} onChange={(e) => set('claimsAddress', e.target.value || null)} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{COPY.fields.notes}</span>
            <textarea className={`${INPUT} min-h-[4rem]`} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
          </label>
          {error && <p className={`sm:col-span-2 text-xs ${TONE_TEXT.urgent}`}>{error}</p>}
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <ActionButton variant="primary" size="sm" type="submit" pending={pending}>
              {COPY.save}
            </ActionButton>
            <ActionButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false)
                setError(null)
                setDraft(note ?? EMPTY_PAYER_NOTE)
              }}
            >
              {COPY.cancel}
            </ActionButton>
          </div>
        </form>
      ) : payerNoteHasContent(note) ? (
        <dl className="mt-2 space-y-1">
          <Line label={COPY.fields.feeSchedule} value={note!.feeSchedule} />
          <Line label={COPY.fields.network} value={network} />
          <Line label={COPY.fields.paysOn} value={paysOn} />
          <Line label={COPY.fields.claimsAddress} value={note!.claimsAddress} />
          <Line label={COPY.fields.phone} value={note!.phone} />
          <Line label={COPY.fields.notes} value={note!.notes} />
        </dl>
      ) : (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{COPY.empty}</p>
      )}
    </section>
  )
}
