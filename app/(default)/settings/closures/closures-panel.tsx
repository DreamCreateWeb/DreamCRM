'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { runAction } from '@/lib/run-action'
import { COMMON_CLOSURE_SLUGS, formatClosureRange, type ClosureRange, type HolidayPreset } from '@/lib/closures'
import type { GbpSpecialClosure } from '@/lib/gbp-listing'
import { SettingsSection } from '../settings-kit'
import { addClosureAction, addPresetClosuresAction, removeClosureAction } from './actions'
import type { ClosuresPageData } from './data'
import { TextInput } from '@/components/ui/form-fields'

/**
 * Settings → Holiday closures (ML-51). One list, one place: the dated ranges
 * are clinic-local DAYS. The US federal holidays are one-tap presets for the
 * next 12 months — computed on the server, stored only when tapped. Google's
 * special hours (when the synced listing carries any) sit beside the list,
 * read-only, never merged into it.
 */
export default function ClosuresPanel({ initial }: { initial: ClosuresPageData }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'urgent' } | null>(null)
  const [label, setLabel] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const { canEdit, closures, presets, gbp } = initial

  async function run(key: string, fn: () => ReturnType<typeof addClosureAction>, done: string): Promise<boolean> {
    setBusy(key)
    try {
      const res = await runAction(fn)
      if (!res.ok) {
        setToast({ message: res.error, tone: 'urgent' })
        return false
      }
      setToast({ message: done, tone: 'ok' })
      router.refresh()
      return true
    } finally {
      setBusy(null)
    }
  }

  async function addOwn() {
    const ok = await run('add', () => addClosureAction({ startsOn, endsOn: endsOn || null, label }), 'Closure added — booking, your site and reminders know.')
    if (ok) {
      setLabel('')
      setStartsOn('')
      setEndsOn('')
    }
  }

  async function remove(c: ClosureRange) {
    if (!c.id) return
    // The dialog law: awaited BEFORE the action starts, never inside a transition.
    const yes = await confirm({
      title: `Remove “${c.label}”?`,
      message: `${formatClosureRange(c)} will be bookable again and your website will stop saying you are closed.`,
      confirmLabel: 'Remove closure',
      danger: true,
    })
    if (!yes) return
    await run(`rm:${c.id}`, () => removeClosureAction(c.id!), 'Closure removed.')
  }

  return (
    <div className="space-y-5">
      <SettingsSection title="Your closures" description="Days the office is closed, on your own calendar. No online slots are offered on them, the website says you are closed, and no visit reminder goes into them.">
        {closures.length === 0 ? (
          <EmptyState
            icon="🗓️"
            title="No closures on the calendar"
            body="Tap the holidays you close for below, or add your own dates — it takes about twenty seconds."
            action={
              presets.length > 0 ? (
                <ActionButton
                  variant="primary"
                  size="sm"
                  pending={busy === 'common'}
                  disabled={!canEdit || busy != null}
                  onClick={() => run('common', () => addPresetClosuresAction(commonKeys(presets)), 'Added the holidays most practices close for.')}
                >
                  Add the usual holidays
                </ActionButton>
              ) : (
                <a href="#add-closure" className="text-sm font-semibold text-teal-700 underline dark:text-teal-300">
                  Add your own dates
                </a>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/50" data-closure-list="">
            {closures.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{c.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatClosureRange(c)}</p>
                </div>
                {canEdit && (
                  <ActionButton variant="secondary" size="sm" pending={busy === `rm:${c.id}`} disabled={busy != null} onClick={() => remove(c)}>
                    Remove
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      {canEdit && presets.length > 0 && (
        <SettingsSection title="US holidays, one tap" description="The next twelve months. Nothing is saved until you tap it.">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <ActionButton
                key={p.key}
                variant="secondary"
                size="sm"
                pending={busy === `p:${p.key}`}
                disabled={busy != null}
                onClick={() => run(`p:${p.key}`, () => addPresetClosuresAction([p.key]), `${p.label} added.`)}
              >
                {p.label} · {formatClosureRange(p)}
              </ActionButton>
            ))}
          </div>
        </SettingsSection>
      )}

      {canEdit && (
        <SettingsSection title="Add your own" description="A retreat, a remodel, a long weekend. Leave the last day blank for a single day." className="scroll-mt-24">
          <div id="add-closure" className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Name
              <TextInput
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder="Staff retreat"
                className="mt-1 w-full"
              />
            </label>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              First day closed
              <TextInput type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="mt-1 w-full" />
            </label>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Last day (optional)
              <TextInput type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} className="mt-1 w-full" />
            </label>
            <ActionButton variant="primary" size="sm" pending={busy === 'add'} disabled={busy != null || !label.trim() || !startsOn} onClick={addOwn}>
              Add closure
            </ActionButton>
          </div>
        </SettingsSection>
      )}

      {gbp.length > 0 && <GoogleSpecialHours entries={gbp} />}

      {toast && <FlashToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  )
}

function commonKeys(presets: HolidayPreset[]): string[] {
  const picked = presets.filter((p) => COMMON_CLOSURE_SLUGS.some((c) => p.key.startsWith(`${c}-`)))
  // The next of each holiday only — "the usual holidays" is one year, not two.
  const seen = new Set<string>()
  return picked
    .filter((p) => {
      const slug = p.key.replace(/-\d{4}$/, '')
      if (seen.has(slug)) return false
      seen.add(slug)
      return true
    })
    .map((p) => p.key)
}

function GoogleSpecialHours({ entries }: { entries: GbpSpecialClosure[] }) {
  return (
    <SettingsSection
      title="On your Google listing"
      description="Special hours Google shows for you. Read-only here — these are Google’s, not yours, and they are not merged into the list above. Add a closure above if the office is really closed."
    >
      <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-200" data-gbp-closures="">
        {entries.map((g) => (
          <li key={`${g.startsOn}-${g.endsOn}`}>
            <span className="font-medium">{formatClosureRange(g)}</span>
            {g.label ? <span className="text-gray-500 dark:text-gray-400"> · {g.label}</span> : null}
          </li>
        ))}
      </ul>
    </SettingsSection>
  )
}
