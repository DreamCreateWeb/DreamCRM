'use client'

import { useState, useTransition } from 'react'
import type { CallListRow } from '@/lib/services/prospecting'
import { INTENT_SIGNAL_LABELS } from '@/lib/types/prospecting'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { logCallOutcomeAction, convertProspectAction } from '../admin-actions'

const OUTCOMES: Array<{ value: string; label: string }> = [
  { value: 'no_answer', label: 'No answer' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'callback', label: 'Callback later' },
  { value: 'demo_booked', label: '🎉 Demo booked' },
  { value: 'not_interested', label: 'Not interested' },
]

function ConvertForm({
  row,
  onDone,
}: {
  row: CallListRow
  onDone: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(row.name)
  const [ownerName, setOwnerName] = useState(row.authorizedOfficialName ?? '')
  const [ownerEmail, setOwnerEmail] = useState(row.email ?? '')
  const [planId, setPlanId] = useState<'basic' | 'pro' | 'premium'>('pro')
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')
  const [pricingKind, setPricingKind] = useState<'standard' | 'percent_off' | 'comped'>('standard')
  const [percentOff, setPercentOff] = useState(20)
  const [error, setError] = useState<string | null>(null)

  const submit = () =>
    startTransition(async () => {
      setError(null)
      const r = await convertProspectAction({
        prospectId: row.id,
        name,
        ownerEmail,
        ownerName,
        planId,
        interval,
        pricing:
          pricingKind === 'percent_off'
            ? { kind: 'percent_off', percentOff }
            : { kind: pricingKind },
      })
      if (r.ok) onDone(`Clinic created (${r.slug}) — owner invite sent to ${ownerEmail}.`)
      else setError(r.error ?? 'Conversion failed.')
    })

  return (
    <div className="mt-3 rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400">
          Clinic name
          <input className="form-input mt-1 w-full text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-xs text-gray-500 dark:text-gray-400">
          Owner name
          <input className="form-input mt-1 w-full text-sm" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </label>
        <label className="block text-xs text-gray-500 dark:text-gray-400">
          Owner email (gets the invite)
          <input className="form-input mt-1 w-full text-sm" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            Plan
            <select className="form-select mt-1 w-full text-sm" value={planId} onChange={(e) => setPlanId(e.target.value as typeof planId)}>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
            </select>
          </label>
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            Billing
            <select className="form-select mt-1 w-full text-sm" value={interval} onChange={(e) => setInterval(e.target.value as typeof interval)}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400">
          Pricing
          <select
            className="form-select mt-1 w-full text-sm"
            value={pricingKind}
            onChange={(e) => setPricingKind(e.target.value as typeof pricingKind)}
          >
            <option value="standard">Standard price</option>
            <option value="percent_off">Negotiated % off</option>
            <option value="comped">Comped</option>
          </select>
        </label>
        {pricingKind === 'percent_off' && (
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            % off (forever)
            <input
              type="number"
              min={1}
              max={100}
              className="form-input mt-1 w-24 text-sm"
              value={percentOff}
              onChange={(e) => setPercentOff(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            />
          </label>
        )}
        <div className="ml-auto">
          <ActionButton
            size="sm"
            variant="primary"
            disabled={pending || !name || !ownerEmail || !ownerName}
            onClick={submit}
          >
            {pending ? 'Creating…' : 'Create clinic + send invite'}
          </ActionButton>
        </div>
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}

export default function CallCard({ row }: { row: CallListRow }) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [converting, setConverting] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const log = (outcome: string) =>
    startTransition(async () => {
      await logCallOutcomeAction({ prospectId: row.id, outcome, note: note || undefined })
      setNote('')
      setFlash(outcome === 'not_interested' ? 'Logged — they drop off the list.' : 'Logged.')
      setTimeout(() => setFlash(null), 2500)
    })

  return (
    <div className="v2-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{row.name}</h2>
            {row.intentSignal && (
              <StatusPill
                tone="special"
                label={
                  INTENT_SIGNAL_LABELS[row.intentSignal as keyof typeof INTENT_SIGNAL_LABELS] ??
                  row.intentSignal
                }
              />
            )}
            {row.lastCallOutcome && (
              <StatusPill tone="neutral" label={`Last call: ${row.lastCallOutcome.replace(/_/g, ' ')}`} />
            )}
          </div>
          <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {[row.authorizedOfficialName, [row.city, row.state].filter(Boolean).join(', ')]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="text-right">
          {row.phone && (
            <a
              href={`tel:${row.phone}`}
              className="text-lg font-semibold tabular-nums text-teal-600 dark:text-teal-400 hover:underline"
            >
              ({row.phone.slice(0, 3)}) {row.phone.slice(3, 6)}-{row.phone.slice(6)}
            </a>
          )}
          {row.email && (
            <div className="text-xs text-gray-500 dark:text-gray-400">{row.email}</div>
          )}
        </div>
      </div>

      {row.intentSummary && (
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">What they said:</span> {row.intentSummary}
        </p>
      )}
      {row.talkingPoints.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">
          {row.talkingPoints.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden="true">→</span>
              {t}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {OUTCOMES.map((o) => (
          <ActionButton
            key={o.value}
            size="sm"
            variant={o.value === 'demo_booked' ? 'primary' : 'secondary'}
            disabled={pending}
            onClick={() => log(o.value)}
          >
            {o.label}
          </ActionButton>
        ))}
        <ActionButton
          size="sm"
          variant={converting ? 'ghost' : 'secondary'}
          onClick={() => setConverting(!converting)}
        >
          {converting ? 'Close' : '🏥 Convert to clinic'}
        </ActionButton>
        <input
          type="text"
          placeholder="Call note (optional)"
          className="form-input text-sm py-1.5 flex-1 min-w-40"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {flash && <p className="mt-2 text-xs text-teal-600 dark:text-teal-400">{flash}</p>}
      {converting && <ConvertForm row={row} onDone={(msg) => setFlash(msg)} />}
    </div>
  )
}
