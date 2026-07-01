'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  EMAIL_AUTOMATION_KEYS,
  EMAIL_AUTOMATION_SPECS,
  type EmailAutomationKey,
  type EmailAutomationOverride,
  type EmailCategory,
  type EmailSlotKey,
  type ResolvedEmail,
} from '@/lib/types/email-automations'
import {
  REMINDER_OFFSET_MAX_HOURS,
  REMINDER_OFFSET_MIN_HOURS,
  type ReminderSettings,
} from '@/lib/types/reminders'
import { saveEmailAutomationAction } from './actions'
import { saveReminderSettingsAction } from '../../reminders/actions'
import { ActionButton } from '@/components/ui/action-button'
import { Toggle } from '@/components/ui/toggle'
import { FlashToast } from '@/components/ui/flash-toast'

// Order + copy for the category groups a clinic scans top-to-bottom.
const CATEGORY_ORDER: EmailCategory[] = ['appointments', 'forms', 'portal', 'reviews', 'website']
const CATEGORY_LABELS: Record<EmailCategory, { title: string; blurb: string }> = {
  appointments: { title: 'Appointments', blurb: 'Confirmations, reminders, and cancellations.' },
  forms: { title: 'Forms & intake', blurb: 'The paperwork you send before a visit.' },
  portal: { title: 'Patient portal', blurb: 'Invites to your online patient portal.' },
  reviews: { title: 'Reviews', blurb: 'Asking happy patients to leave a review.' },
  website: { title: 'Website', blurb: 'Replies to people who message you from your site.' },
}

// Sample values used ONLY for the live preview, so staff see how tokens fill in.
const SAMPLE_FIELDS: Record<string, string> = {
  firstName: 'Jordan',
  patientName: 'Jordan Lee',
  clinicName: 'Bright Smiles Dental',
  clinicPhone: '(555) 123-4567',
  appointmentType: 'Cleaning',
  appointmentDate: 'Monday, Jan 12',
  appointmentTime: 'Monday, January 12 at 2:00 PM',
  urgentLine: ' you can call us at (555) 123-4567',
}

/** Client-safe token fill for the preview (mirrors applyMergeFields). */
function fillTokens(text: string): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => SAMPLE_FIELDS[k] ?? '')
}

function slotsFrom(resolved: ResolvedEmail, key: EmailAutomationKey): Record<EmailSlotKey, string> {
  const spec = EMAIL_AUTOMATION_SPECS[key]
  const out = {} as Record<EmailSlotKey, string>
  for (const f of spec.slotFields) out[f.slot] = (resolved[f.slot] ?? '') as string
  return out
}
function defaultSlots(key: EmailAutomationKey): Record<EmailSlotKey, string> {
  const spec = EMAIL_AUTOMATION_SPECS[key]
  const out = {} as Record<EmailSlotKey, string>
  for (const f of spec.slotFields) out[f.slot] = spec.slotDefaults[f.slot] ?? ''
  return out
}

export default function EmailsHub({
  config,
  reminder,
  canManage,
  focusKey,
}: {
  config: Record<EmailAutomationKey, ResolvedEmail>
  reminder: ReminderSettings
  canManage: boolean
  focusKey: string | null
}) {
  // Reminder timing/on-off is shared state (the reminder card owns it, but it
  // lives here so a re-render doesn't drop it).
  const [reminderState, setReminderState] = useState<ReminderSettings>(reminder)
  const [toast, setToast] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      {!canManage && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          These emails go to every patient, so only an owner or admin can edit them. You can still read them here.
        </p>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const keys = EMAIL_AUTOMATION_KEYS.filter((k) => EMAIL_AUTOMATION_SPECS[k].category === cat)
        if (keys.length === 0) return null
        const meta = CATEGORY_LABELS[cat]
        return (
          <section key={cat}>
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{meta.title}</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{meta.blurb}</p>
            </div>
            <div className="space-y-3">
              {keys.map((key) => (
                <EmailCard
                  key={key}
                  emailKey={key}
                  initial={config[key]}
                  canManage={canManage}
                  defaultOpen={focusKey === key}
                  onToast={setToast}
                  reminderState={reminderState}
                  setReminderState={setReminderState}
                />
              ))}
            </div>
          </section>
        )
      })}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function EmailCard({
  emailKey,
  initial,
  canManage,
  defaultOpen,
  onToast,
  reminderState,
  setReminderState,
}: {
  emailKey: EmailAutomationKey
  initial: ResolvedEmail
  canManage: boolean
  defaultOpen: boolean
  onToast: (msg: string) => void
  reminderState: ReminderSettings
  setReminderState: (next: ReminderSettings) => void
}) {
  const spec = EMAIL_AUTOMATION_SPECS[emailKey]
  const [open, setOpen] = useState(defaultOpen)
  const [slots, setSlots] = useState<Record<EmailSlotKey, string>>(() => slotsFrom(initial, emailKey))
  const [enabled, setEnabled] = useState(initial.enabled)
  const [pending, startTransition] = useTransition()
  const [focusedSlot, setFocusedSlot] = useState<EmailSlotKey | null>(null)
  const fieldRefs = useRef<Partial<Record<EmailSlotKey, HTMLInputElement | HTMLTextAreaElement | null>>>({})
  const cardRef = useRef<HTMLSpanElement>(null)

  const ownEnable = spec.enableSource === 'email_automations'
  const isReminder = spec.enableSource === 'reminder_settings'

  // Deep-link: open + scroll to this card when it's the ?email= target.
  useEffect(() => {
    if (defaultOpen) {
      setOpen(true)
      const id = requestAnimationFrame(() =>
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
      return () => cancelAnimationFrame(id)
    }
  }, [defaultOpen])

  const customized =
    spec.slotFields.some((f) => (slots[f.slot] ?? '').trim() !== (spec.slotDefaults[f.slot] ?? '').trim()) ||
    (ownEnable && !enabled)

  function insertToken(token: string) {
    const slot =
      focusedSlot ?? spec.slotFields.find((f) => f.slot === 'body')?.slot ?? spec.slotFields[0].slot
    const el = fieldRefs.current[slot]
    const cur = slots[slot] ?? ''
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart
      const e = el.selectionEnd ?? s
      const next = cur.slice(0, s) + token + cur.slice(e)
      setSlots((p) => ({ ...p, [slot]: next }))
      requestAnimationFrame(() => {
        el.focus()
        const pos = s + token.length
        el.setSelectionRange(pos, pos)
      })
    } else {
      setSlots((p) => ({ ...p, [slot]: cur + token }))
    }
  }

  function save() {
    const override: EmailAutomationOverride = {}
    for (const f of spec.slotFields) override[f.slot] = slots[f.slot]
    if (ownEnable) override.enabled = enabled
    startTransition(async () => {
      const jobs: Array<Promise<{ ok: boolean; error?: string }>> = [
        saveEmailAutomationAction(emailKey, override),
      ]
      // The reminder card also owns the timing/on-off (reminder_settings).
      if (isReminder) jobs.push(saveReminderSettingsAction(reminderState))
      const results = await Promise.all(jobs)
      const bad = results.find((r) => !r.ok)
      onToast(bad && 'error' in bad ? (bad.error ?? 'Could not save.') : 'Saved.')
    })
  }

  function resetToDefault() {
    setSlots(defaultSlots(emailKey))
    setEnabled(true)
    startTransition(async () => {
      const r = await saveEmailAutomationAction(emailKey, {})
      onToast(r.ok ? 'Reset to the default wording.' : r.error)
    })
  }

  return (
    <section ref={cardRef as unknown as React.RefObject<HTMLElement>} className="v2-card p-5">
      {/* Header — name, description, state pill, expand toggle. */}
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 items-start gap-2 text-left"
          aria-expanded={open}
        >
          <svg
            className={`mt-0.5 h-4 w-4 shrink-0 fill-current text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path d="M6 4l4 4-4 4V4z" />
          </svg>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">{spec.label}</span>
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{spec.description}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <StatePill customized={customized} off={ownEnable && !enabled} reminderOff={isReminder && !reminderState.enabled} />
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-gray-700/50">
          {/* On/off + timing controls per email shape. */}
          {ownEnable && (
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                Send this email automatically
              </span>
              <Toggle checked={enabled} onChange={setEnabled} disabled={!canManage} srLabel="Send this email automatically" />
            </label>
          )}

          {isReminder && (
            <ReminderTiming
              value={reminderState}
              onChange={setReminderState}
              disabled={!canManage}
            />
          )}

          {spec.enableSource === 'review_config' && spec.timingHint && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800/40 dark:text-gray-300">
              {spec.timingHint.text}{' '}
              <a href={spec.timingHint.href} className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                {spec.timingHint.linkLabel} →
              </a>
            </p>
          )}

          {spec.enableSource === null && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This email is sent when you choose to — there’s nothing to turn on or off.
            </p>
          )}

          {/* Editable fields + token chips. */}
          {canManage && spec.tokens.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">Insert:</span>
              {spec.tokens.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  title={t.label}
                  onClick={() => insertToken(t.token)}
                  className="rounded-full border border-gray-200 bg-white px-2 py-0.5 font-mono-num text-[11px] text-gray-700 hover:border-teal-400 hover:text-teal-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  {t.token}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {spec.slotFields.map((f) => (
              <div key={f.slot}>
                <label
                  htmlFor={`${emailKey}-${f.slot}`}
                  className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
                >
                  {f.label}
                </label>
                {f.rows <= 1 ? (
                  <input
                    id={`${emailKey}-${f.slot}`}
                    ref={(el) => {
                      fieldRefs.current[f.slot] = el
                    }}
                    value={slots[f.slot] ?? ''}
                    onChange={(e) => setSlots((p) => ({ ...p, [f.slot]: e.target.value }))}
                    onFocus={() => setFocusedSlot(f.slot)}
                    disabled={!canManage}
                    className="form-input w-full text-sm disabled:opacity-70"
                  />
                ) : (
                  <textarea
                    id={`${emailKey}-${f.slot}`}
                    ref={(el) => {
                      fieldRefs.current[f.slot] = el
                    }}
                    value={slots[f.slot] ?? ''}
                    onChange={(e) => setSlots((p) => ({ ...p, [f.slot]: e.target.value }))}
                    onFocus={() => setFocusedSlot(f.slot)}
                    rows={f.rows}
                    disabled={!canManage}
                    className="form-textarea w-full text-sm disabled:opacity-70"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Live preview + what's added for you. */}
          <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-700/50 dark:bg-gray-800/30">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Preview</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-200">Subject:</span> {fillTokens(slots.subject ?? '')}
            </p>
            <div className="mt-2 space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
              {slots.heading != null && slots.heading.trim() !== '' && (
                <p className="font-semibold">{fillTokens(slots.heading)}</p>
              )}
              <p className="whitespace-pre-wrap">{fillTokens(slots.body ?? '')}</p>
              {slots.closing != null && slots.closing.trim() !== '' && (
                <p className="whitespace-pre-wrap text-gray-500 dark:text-gray-400">{fillTokens(slots.closing)}</p>
              )}
            </div>
            {spec.includesNote.length > 0 && (
              <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
                We automatically add: {spec.includesNote.join(' · ')}.
              </p>
            )}
          </div>

          {canManage && (
            <div className="flex items-center gap-3">
              <ActionButton variant="primary" size="sm" onClick={save} disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </ActionButton>
              <button
                type="button"
                onClick={resetToDefault}
                disabled={pending || !customized}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Reset to default
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function StatePill({
  customized,
  off,
  reminderOff,
}: {
  customized: boolean
  off: boolean
  reminderOff: boolean
}) {
  if (off || reminderOff) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-700/50 dark:text-gray-300">
        Off
      </span>
    )
  }
  if (customized) {
    return (
      <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:text-teal-300">
        Customized
      </span>
    )
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
      Default
    </span>
  )
}

/** The reminder card's timing block — on/off, hours-before, forms nudge. Writes
 *  reminder_settings (via the shared state + the reminder card's Save). */
function ReminderTiming({
  value,
  onChange,
  disabled,
}: {
  value: ReminderSettings
  onChange: (next: ReminderSettings) => void
  disabled: boolean
}) {
  return (
    <div id="reminder-timing" className="space-y-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/40">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Send reminders automatically</span>
        <Toggle
          checked={value.enabled}
          onChange={(v) => onChange({ ...value, enabled: v })}
          disabled={disabled}
          srLabel="Send reminders automatically"
        />
      </label>
      <div className={`flex items-center justify-between gap-3 ${value.enabled ? '' : 'opacity-50'}`}>
        <span className="text-sm text-gray-700 dark:text-gray-300">Hours before the visit</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={REMINDER_OFFSET_MIN_HOURS}
            max={REMINDER_OFFSET_MAX_HOURS}
            step={1}
            value={value.offsetHours}
            onChange={(e) => onChange({ ...value, offsetHours: Number(e.target.value) })}
            disabled={disabled || !value.enabled}
            className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm tabular-nums dark:border-gray-700 dark:bg-gray-800"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">hours</span>
        </div>
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Also remind patients to finish their forms
        </span>
        <Toggle
          checked={value.formsReminder}
          onChange={(v) => onChange({ ...value, formsReminder: v })}
          disabled={disabled}
          srLabel="Also remind patients to finish their forms"
        />
      </label>
      <p className="text-[11px] leading-relaxed text-gray-400">
        The forms reminder uses your “Intake form request” email. Between {REMINDER_OFFSET_MIN_HOURS} and{' '}
        {REMINDER_OFFSET_MAX_HOURS} hours (7 days). Each patient gets at most one reminder per visit.
      </p>
    </div>
  )
}
