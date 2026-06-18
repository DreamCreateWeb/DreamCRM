'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import {
  MAX_TEMPLATE_BODY_LEN,
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
 * note. `{{firstName}}` etc. are filled per-patient in the composer, so we show
 * the raw token here.
 */
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
  const [toast, setToast] = useState<string | null>(null)
  const [, startTransition] = useTransition()

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
        setToast(res.error)
      }
    })
  }

  function onCreated(t: MessageTemplateRow) {
    setTemplates((cur) => [...cur, t])
    setAdding(false)
    setToast('Template added.')
  }
  function onUpdated(id: string, patch: { name: string; body: string }) {
    setTemplates((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    setEditingId(null)
    setToast('Template saved.')
  }
  function onDeleted(id: string) {
    setTemplates((cur) => cur.filter((t) => t.id !== id))
    setToast('Template deleted.')
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
                onError={setToast}
              />
            ) : (
              <TemplateCard
                template={t}
                canManage={canManage}
                isFirst={i === 0}
                isLast={i === templates.length - 1}
                onEdit={() => setEditingId(t.id)}
                onDelete={() => onDeleted(t.id)}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
                onError={setToast}
              />
            )}
          </li>
        ))}
      </ul>

      {templates.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No templates yet.</p>
      )}

      {canManage && (
        <div className="mt-4">
          {adding ? (
            <TemplateForm onCancel={() => setAdding(false)} onSaved={() => {}} onCreated={onCreated} onError={setToast} />
          ) : (
            <ActionButton variant="secondary" size="sm" onClick={() => setAdding(true)}>
              + New template
            </ActionButton>
          )}
        </div>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function TemplateCard({
  template,
  canManage,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onError,
}: {
  template: MessageTemplateRow
  canManage: boolean
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onError: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function doDelete() {
    startTransition(async () => {
      const res = await deleteMessageTemplateAction(template.id)
      if (res.ok) onDelete()
      else onError(res.error)
    })
  }

  return (
    <div className="rounded-lg border border-[color:var(--color-hairline)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{template.name}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap">{template.body}</p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <IconBtn label="Move up" disabled={isFirst || pending} onClick={onMoveUp}>↑</IconBtn>
            <IconBtn label="Move down" disabled={isLast || pending} onClick={onMoveDown}>↓</IconBtn>
            <button
              type="button"
              onClick={onEdit}
              disabled={pending}
              className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 px-1.5 py-1"
            >
              Edit
            </button>
            {confirming ? (
              <>
                <button type="button" onClick={doDelete} disabled={pending} className="text-xs font-medium text-rose-600 dark:text-rose-400 px-1.5 py-1">
                  {pending ? '…' : 'Confirm'}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="text-xs text-gray-500 px-1 py-1">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} disabled={pending} className="text-xs font-medium text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 px-1.5 py-1">
                Delete
              </button>
            )}
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
  const [body, setBody] = useState(initial?.body ?? '')
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!name.trim() || !body.trim()) {
      onError('Add a name and a message.')
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
    <div className="rounded-lg border border-teal-500/40 bg-teal-500/[0.03] p-3 space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name (e.g. Confirming your visit)"
        className="form-input w-full text-sm"
        autoFocus
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_TEMPLATE_BODY_LEN))}
        placeholder="Hi {{firstName}}, …"
        rows={3}
        className="form-textarea w-full text-sm"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          {'{{firstName}}'} fills in the patient&apos;s name when sent.
        </span>
        <div className="flex items-center gap-2">
          <ActionButton variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : initial ? 'Save' : 'Add template'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
