'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapLink from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { cn } from '@/lib/utils'
import { ActionButton } from '@/components/ui/action-button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { FlashToast } from '@/components/ui/flash-toast'
import type { RetentionKind } from '@/lib/types/retention'
import { saveAutomationMessageAction, resetAutomationMessageAction } from './actions'

/**
 * The automation message editor (campaigns phase 2): subject + preview +
 * a slim TipTap body. Saving stores the org's override; Reset deletes it
 * and the automation falls back to the stock message. Members see it all
 * read-only — reading the message never needs a role.
 */
export default function AutomationMessageEditor({
  kind,
  initial,
  isCustom,
  canManage,
}: {
  kind: RetentionKind
  initial: { subject: string; previewText: string; bodyHtml: string }
  isCustom: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const askConfirm = useConfirm()
  const [subject, setSubject] = useState(initial.subject)
  const [previewText, setPreviewText] = useState(initial.previewText)
  const [custom, setCustom] = useState(isCustom)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder: 'Write the message…' }),
    ],
    content: initial.bodyHtml || '<p></p>',
    editable: canManage,
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-stone dark:prose-invert max-w-none focus:outline-none min-h-[220px]',
      },
    },
    immediatelyRender: false,
    onUpdate() {
      setDirty(true)
    },
  })

  function save() {
    if (!editor) return
    startTransition(async () => {
      const res = await saveAutomationMessageAction(kind, {
        subject,
        previewText,
        bodyHtml: editor.getHTML(),
      })
      if (res.ok) {
        setCustom(true)
        setDirty(false)
        setToast('Saved — the next auto-send uses your version.')
        router.refresh()
      } else {
        setToast(res.error)
      }
    })
  }

  async function reset() {
    if (
      !(await askConfirm({
        title: 'Reset to the stock message?',
        message: 'Your edited version is deleted and the automation goes back to the built-in message.',
        confirmLabel: 'Reset',
        danger: true,
      }))
    )
      return
    startTransition(async () => {
      const res = await resetAutomationMessageAction(kind)
      if (res.ok && res.message) {
        setSubject(res.message.subject)
        setPreviewText(res.message.previewText)
        editor?.commands.setContent(res.message.bodyHtml)
        setCustom(false)
        setDirty(false)
        setToast('Back to the stock message.')
        router.refresh()
      } else if (!res.ok) {
        setToast(res.error)
      }
    })
  }

  return (
    <div className="v2-card overflow-hidden">
      <div className="px-5 py-3 border-b border-[color:var(--color-hairline)] flex items-center justify-between gap-3">
        <span
          className={cn(
            'text-xs font-medium rounded-full px-2 py-0.5',
            custom
              ? 'text-violet-700 dark:text-violet-300 bg-violet-500/10'
              : 'text-gray-600 dark:text-gray-300 bg-[color:var(--color-surface-sunk)]',
          )}
        >
          {custom ? 'Customized — sends your version' : 'Stock message — sends the built-in copy'}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {'{{firstName}}'} and {'{{bookingUrl}}'} fill in per patient
        </span>
      </div>

      <div className="px-5 py-3 border-b border-[color:var(--color-hairline)] space-y-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
            Subject
          </span>
          <input
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value)
              setDirty(true)
            }}
            disabled={!canManage}
            className="form-input w-full disabled:opacity-70"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
            Preview text (optional)
          </span>
          <input
            value={previewText}
            onChange={(e) => {
              setPreviewText(e.target.value)
              setDirty(true)
            }}
            disabled={!canManage}
            placeholder="One-line tease shown next to the subject"
            className="form-input w-full disabled:opacity-70"
          />
        </label>
      </div>

      {canManage && editor && (
        <div className="px-5 py-2 border-b border-[color:var(--color-hairline)] flex items-center gap-1 flex-wrap">
          <ToolbarBtn active={editor.isActive('bold')} label="B" onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarBtn active={editor.isActive('italic')} label="I" onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarBtn active={editor.isActive('bulletList')} label="• List" onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarBtn
            active={editor.isActive('link')}
            label="Link"
            onClick={() => {
              const previousUrl = editor.getAttributes('link').href as string | undefined
              const url = prompt('URL', previousUrl ?? 'https://')
              if (url === null) return
              if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
              else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
            }}
          />
        </div>
      )}

      <div className="px-5 py-4">
        <EditorContent editor={editor} />
      </div>

      <div className="px-5 py-3 border-t border-[color:var(--color-hairline)] flex items-center justify-between gap-3">
        {canManage ? (
          <>
            {custom ? (
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="text-xs font-medium text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 disabled:opacity-50"
              >
                Reset to the stock message
              </button>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Saving makes this your version — you can always reset.
              </span>
            )}
            <ActionButton variant="primary" size="sm" onClick={save} disabled={pending || !dirty}>
              {pending ? 'Saving…' : 'Save message'}
            </ActionButton>
          </>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Only an owner or admin can edit this message.
          </span>
        )}
      </div>

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function ToolbarBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'text-xs font-medium px-2 py-1 rounded-[var(--r-sm)] transition-colors',
        active
          ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
      )}
    >
      {label}
    </button>
  )
}
