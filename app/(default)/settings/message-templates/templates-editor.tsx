'use client'

import { useMemo, useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { StatusPill } from '@/components/ui/status-pill'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  MAX_TEMPLATE_BODY_LEN,
  MAX_TEMPLATE_NAME_LEN,
  type MessageTemplateRow,
} from '@/lib/types/message-templates'
import {
  createMessageTemplateAction,
  updateMessageTemplateAction,
  deleteMessageTemplateAction,
  reorderMessageTemplatesAction,
} from './actions'

/**
 * Manage the clinic's canned-reply templates (backed by email_snippet). Add /
 * edit / delete / reorder. Owner/admin only; a member sees them read-only with a
 * note. `{{firstName}}` / `{{lastName}}` / `{{fullName}}` are filled per-patient
 * in the composer (see renderTemplate in patient-messaging.ts) — here we show
 * the raw token on the card and a live-filled preview inside the editor.
 */

/** A stand-in patient so staff can preview exactly what a patient receives. */
const SAMPLE = { firstName: 'Jordan', lastName: 'Blake' }

/** Mirror of the server-side `renderTemplate` merge — kept in lock-step so the
 *  preview is faithful. Function-form replace so `$` in a name isn't read as a
 *  regex backreference. */
function renderPreview(body: string): string {
  return body
    .replace(/\{\{firstName\}\}/g, () => SAMPLE.firstName)
    .replace(/\{\{lastName\}\}/g, () => SAMPLE.lastName)
    .replace(/\{\{fullName\}\}/g, () => `${SAMPLE.firstName} ${SAMPLE.lastName}`)
}

export default function TemplatesEditor({
  initial,
  canManage,
}: {
  initial: MessageTemplateRow[]
  canManage: boolean
}) {
  const [templates, setTemplates] = useState<MessageTemplateRow[]>(initial)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'urgent' } | null>(null)
  const [, startTransition] = useTransition()
  const confirm = useConfirm()

  const flash = (message: string) => setToast({ message, tone: 'ok' })
  const err = (message: string) => setToast({ message, tone: 'urgent' })

  function move(index: number, dir: -1 | 1) {
    const next = [...templates]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setTemplates(next)
    startTransition(async () => {
      const res = await reorderMessageTemplatesAction(next.map((t) => t.id))
      if (!res.ok) {
        setTemplates(templates) // revert
        err(res.error)
      }
    })
  }

  function onCreated(t: MessageTemplateRow) {
    setTemplates((cur) => [...cur, t])
    setAdding(false)
    flash('Template added.')
  }
  function onUpdated(id: string, patch: { name: string; body: string }) {
    setTemplates((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    setEditingId(null)
    flash('Template saved.')
  }

  async function requestDelete(t: MessageTemplateRow) {
    const ok = await confirm({
      title: `Delete “${t.name}”?`,
      message: 'Your team won’t be able to drop this reply into a conversation anymore. This can’t be undone.',
      confirmLabel: 'Delete template',
      danger: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteMessageTemplateAction(t.id)
      if (res.ok) {
        setTemplates((cur) => cur.filter((x) => x.id !== t.id))
        flash('Template deleted.')
      } else {
        err(res.error)
      }
    })
  }

  return (
    <div>
      {!canManage && (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          These replies are available to everyone in the composer. Only an owner or admin can edit them.
        </p>
      )}

      <ul className="space-y-3">
        {templates.map((t, i) => (
          <li key={t.id}>
            {editingId === t.id ? (
              <TemplateForm
                initial={t}
                onCancel={() => setEditingId(null)}
                onSaved={(patch) => onUpdated(t.id, patch)}
                onError={err}
              />
            ) : (
              <TemplateCard
                template={t}
                canManage={canManage}
                isFirst={i === 0}
                isLast={i === templates.length - 1}
                isBusy={editingId !== null || adding}
                onEdit={() => setEditingId(t.id)}
                onDelete={() => requestDelete(t)}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
              />
            )}
          </li>
        ))}
      </ul>

      {templates.length === 0 && !adding && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No saved replies yet. Add one your team can drop into a conversation in one click.
        </p>
      )}

      {canManage && (
        <div className="mt-4">
          {adding ? (
            <TemplateForm onCancel={() => setAdding(false)} onSaved={() => {}} onCreated={onCreated} onError={err} />
          ) : (
            <ActionButton variant="secondary" size="sm" onClick={() => setAdding(true)} disabled={editingId !== null}>
              + New template
            </ActionButton>
          )}
        </div>
      )}

      {toast && <FlashToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  )
}

function TemplateCard({
  template,
  canManage,
  isFirst,
  isLast,
  isBusy,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  template: MessageTemplateRow
  canManage: boolean
  isFirst: boolean
  isLast: boolean
  /** Another row is mid-edit / a new one is being added — dim actions so the
   *  surface reads as single-focus. */
  isBusy: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="v2-well rounded-[var(--r-md)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{template.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
            {template.body}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <IconBtn label="Move up" disabled={isFirst || isBusy} onClick={onMoveUp}>↑</IconBtn>
            <IconBtn label="Move down" disabled={isLast || isBusy} onClick={onMoveDown}>↓</IconBtn>
            <button
              type="button"
              onClick={onEdit}
              disabled={isBusy}
              className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 px-1.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isBusy}
              className="text-xs font-medium text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 px-1.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-6 w-6 rounded text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

function TemplateForm({
  initial,
  onCancel,
  onSaved,
  onCreated,
  onError,
}: {
  initial?: MessageTemplateRow
  onCancel: () => void
  onSaved: (patch: { name: string; body: string }) => void
  onCreated?: (t: MessageTemplateRow) => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  // No slice-on-change: the count + gate below own length. Silently truncating a
  // paste loses the tail of a reply the clinic pasted in — surface it instead.
  const [body, setBody] = useState(initial?.body ?? '')
  const [pending, startTransition] = useTransition()

  const bodyLen = body.length
  const over = bodyLen > MAX_TEMPLATE_BODY_LEN
  const near = !over && bodyLen >= MAX_TEMPLATE_BODY_LEN * 0.9
  const countTone = over
    ? 'text-rose-600 dark:text-rose-400'
    : near
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-400 dark:text-gray-500'

  const preview = useMemo(() => renderPreview(body), [body])
  const canSave = name.trim().length > 0 && body.trim().length > 0 && !over && !pending

  function submit() {
    if (!name.trim() || !body.trim()) {
      onError('Add a name and a message.')
      return
    }
    if (over) {
      onError(`That message is ${(bodyLen - MAX_TEMPLATE_BODY_LEN).toLocaleString()} characters over the ${MAX_TEMPLATE_BODY_LEN.toLocaleString()} limit — trim it and try again.`)
      return
    }
    startTransition(async () => {
      if (initial) {
        const res = await updateMessageTemplateAction(initial.id, { name, body })
        if (res.ok) onSaved({ name: name.trim(), body: body.trim() })
        else onError(res.error)
      } else {
        const res = await createMessageTemplateAction({ name, body })
        if (res.ok) onCreated?.(res.template)
        else onError(res.error)
      }
    })
  }

  return (
    <div className="rounded-[var(--r-md)] border border-teal-500/40 bg-teal-500/[0.03] p-4 space-y-3 section-enter">
      <div className="flex items-center justify-between">
        <StatusPill tone="special" label={initial ? 'Editing template' : 'New template'} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tmpl-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          Name <span className="font-normal text-gray-400 dark:text-gray-500">(only your team sees this)</span>
        </label>
        <input
          id="tmpl-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MAX_TEMPLATE_NAME_LEN))}
          placeholder="e.g. Confirming your visit"
          className="form-input w-full text-sm"
          maxLength={MAX_TEMPLATE_NAME_LEN}
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="tmpl-body" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Message
          </label>
          <span className={`font-mono-num tabular-nums text-[11px] ${countTone}`} aria-live="polite">
            {bodyLen.toLocaleString()} / {MAX_TEMPLATE_BODY_LEN.toLocaleString()}
          </span>
        </div>
        <textarea
          id="tmpl-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Hi {{firstName}}, …"
          rows={4}
          aria-invalid={over}
          className={`form-textarea w-full text-sm ${over ? 'border-rose-500/70 focus:border-rose-500' : ''}`}
        />
        {over && (
          <p className="text-[11px] text-rose-600 dark:text-rose-400">
            Over the limit by {(bodyLen - MAX_TEMPLATE_BODY_LEN).toLocaleString()} characters — trim it to save.
          </p>
        )}
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Type <code className="font-mono-num rounded bg-gray-100 dark:bg-gray-700/50 px-1 py-px">{'{{firstName}}'}</code>,{' '}
          <code className="font-mono-num rounded bg-gray-100 dark:bg-gray-700/50 px-1 py-px">{'{{lastName}}'}</code>, or{' '}
          <code className="font-mono-num rounded bg-gray-100 dark:bg-gray-700/50 px-1 py-px">{'{{fullName}}'}</code> and we fill in the patient&apos;s name when sent.
        </p>
      </div>

      {/* Live preview — exactly what the patient reads, tokens filled in. */}
      <div className="space-y-1.5">
        <p className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          Preview <span className="font-normal text-gray-400 dark:text-gray-500">(as {SAMPLE.firstName} {SAMPLE.lastName} would see it)</span>
        </p>
        <div className="v2-well rounded-[var(--r-md)] p-3 min-h-[3rem]">
          {body.trim() ? (
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{preview}</p>
          ) : (
            <p className="text-xs italic text-gray-400 dark:text-gray-500">
              Start typing a message and the preview shows here.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <ActionButton variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </ActionButton>
        <ActionButton variant="primary" size="sm" onClick={submit} disabled={!canSave}>
          {pending ? 'Saving…' : initial ? 'Save' : 'Add template'}
        </ActionButton>
      </div>
    </div>
  )
}
