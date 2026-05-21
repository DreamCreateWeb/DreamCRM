'use client'

import { useEffect, useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { DOMSerializer } from 'prosemirror-model'
import { cn } from '@/lib/utils'
import {
  deleteCampaignAction,
  draftCampaignAction,
  improveCopyAction,
  sendCampaignAction,
  updateCampaignAction,
} from '../../actions'
import type { CampaignStats } from '@/lib/services/marketing-campaigns'

export interface CampaignEditorData {
  id: number
  name: string
  subject: string
  previewText: string
  bodyHtml: string
  bodyJson: Record<string, unknown> | null
  audienceId: number | null
  sendChannel: 'resend' | 'gmail' | 'twilio_sms'
  status: string
  sentAt: string | null
}

interface AudienceOption {
  id: number
  name: string
  recipientCount: number
}

interface GmailAccount {
  id: string
  emailAddress: string
  displayName: string | null
}

interface Props {
  campaign: CampaignEditorData
  audiences: AudienceOption[]
  gmailAccounts: GmailAccount[]
  defaultFromEmail: string
  stats: CampaignStats
}

export default function CampaignEditor({
  campaign,
  audiences,
  gmailAccounts,
  defaultFromEmail,
  stats,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState(campaign)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [showAiDraft, setShowAiDraft] = useState(false)
  const [aiImproveInstruction, setAiImproveInstruction] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image,
      Placeholder.configure({
        placeholder: 'Write your email…',
      }),
    ],
    content: campaign.bodyJson ?? (campaign.bodyHtml || '<p></p>'),
    editorProps: {
      attributes: {
        class:
          'prose prose-sm prose-stone dark:prose-invert max-w-none focus:outline-none min-h-[280px]',
      },
    },
    immediatelyRender: false,
    onUpdate({ editor }) {
      setDraft((d) => ({
        ...d,
        bodyHtml: editor.getHTML(),
        bodyJson: editor.getJSON() as Record<string, unknown>,
      }))
      setDirty(true)
    },
  })

  const save = useCallback(() => {
    if (!dirty) return
    startTransition(async () => {
      await updateCampaignAction(draft.id, {
        name: draft.name,
        subject: draft.subject || null,
        previewText: draft.previewText || null,
        bodyHtml: draft.bodyHtml || null,
        bodyJson: draft.bodyJson,
        audienceId: draft.audienceId ?? null,
        sendChannel: draft.sendChannel,
      })
      setDirty(false)
      setSavedAt(Date.now())
    })
  }, [draft, dirty])

  // Autosave 1.2s after the last change
  useEffect(() => {
    if (!dirty) return
    const id = setTimeout(save, 1200)
    return () => clearTimeout(id)
  }, [dirty, save])

  function field<K extends keyof CampaignEditorData>(k: K, v: CampaignEditorData[K]) {
    setDraft((d) => ({ ...d, [k]: v }))
    setDirty(true)
  }

  function destroy() {
    if (!confirm('Delete this campaign and all its analytics?')) return
    startTransition(async () => {
      await deleteCampaignAction(draft.id)
      router.push('/marketing/campaigns')
    })
  }

  const sent = campaign.status === 'completed' || campaign.status === 'active'
  const audience = audiences.find((a) => a.id === draft.audienceId)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4">
      {/* ── Editor column ── */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-700/60">
          <input
            value={draft.name}
            onChange={(e) => field('name', e.target.value)}
            placeholder="Campaign name (internal only)"
            className="w-full text-base font-semibold text-stone-800 dark:text-stone-100 bg-transparent border-none focus:outline-none focus:ring-0 px-0"
          />
        </div>
        <div className="px-5 py-3 border-b border-stone-100 dark:border-stone-700/40 space-y-2">
          <Labelled label="Subject">
            <input
              value={draft.subject}
              onChange={(e) => field('subject', e.target.value)}
              placeholder="What recipients see in their inbox"
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
            />
          </Labelled>
          <Labelled label="Preview text">
            <input
              value={draft.previewText}
              onChange={(e) => field('previewText', e.target.value)}
              placeholder="One-line tease shown next to the subject"
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
            />
          </Labelled>
        </div>

        <div className="px-5 py-2 border-b border-stone-100 dark:border-stone-700/40 flex items-center gap-2 flex-wrap bg-stone-50/40 dark:bg-stone-800/30">
          <button
            type="button"
            onClick={() => setShowAiDraft(true)}
            disabled={sent}
            className="text-[11px] font-medium px-2 py-1 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20 disabled:opacity-50"
            title="Write a draft from a brief"
          >
            ✨ AI draft
          </button>
          <button
            type="button"
            onClick={() => {
              if (!editor) return
              const { from, to } = editor.state.selection
              if (from === to) {
                alert('Select some text to rewrite first.')
                return
              }
              setAiImproveInstruction('')
            }}
            disabled={sent}
            className="text-[11px] font-medium px-2 py-1 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20 disabled:opacity-50"
            title="Rewrite the selected text"
          >
            ✨ Rewrite selection
          </button>
          <span className="text-[10px] text-stone-400 dark:text-stone-500 ml-auto">
            {aiBusy ? 'AI working…' : 'AI is tenant-aware (platform / clinic voice)'}
          </span>
        </div>

        {editor && <EditorToolbar editor={editor} />}

        <div className="px-5 py-4 min-h-[320px]">
          <EditorContent editor={editor} />
        </div>

        <div className="px-5 py-2 border-t border-stone-100 dark:border-stone-700/40 flex items-center justify-between text-[11px] text-stone-400 dark:text-stone-500">
          <span>
            {dirty
              ? 'Editing…'
              : savedAt
                ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
                : 'Up to date'}
          </span>
          <button
            onClick={destroy}
            disabled={pending}
            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 px-2 py-0.5 rounded-md disabled:opacity-50"
          >
            Delete campaign
          </button>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <aside className="space-y-3">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Send channel
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => field('sendChannel', 'resend')}
              disabled={sent}
              className={cn(
                'text-[12px] font-medium px-2 py-1.5 rounded-md',
                draft.sendChannel === 'resend'
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
                sent && 'opacity-60 cursor-not-allowed',
              )}
            >
              Resend
            </button>
            <button
              onClick={() => field('sendChannel', 'gmail')}
              disabled={sent || gmailAccounts.length === 0}
              className={cn(
                'text-[12px] font-medium px-2 py-1.5 rounded-md',
                draft.sendChannel === 'gmail'
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
                (sent || gmailAccounts.length === 0) && 'opacity-60 cursor-not-allowed',
              )}
              title={
                gmailAccounts.length === 0
                  ? 'No Gmail account connected — connect one from the Inbox settings'
                  : ''
              }
            >
              Gmail
            </button>
          </div>
          <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-2 leading-snug">
            {draft.sendChannel === 'resend'
              ? `From ${defaultFromEmail || 'Resend default'}. Best deliverability for blast sends.`
              : 'Sends one-by-one from your connected mailbox. Warmer for cold outreach.'}
          </p>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Audience
          </h3>
          <select
            value={draft.audienceId ?? ''}
            onChange={(e) => field('audienceId', e.target.value ? Number(e.target.value) : null)}
            disabled={sent}
            className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 disabled:opacity-60"
          >
            <option value="">Choose…</option>
            {audiences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.recipientCount}
              </option>
            ))}
          </select>
          {audiences.length === 0 ? (
            <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-2 italic">
              No audiences yet. <a className="underline" href="/marketing/audiences">Create one</a>.
            </p>
          ) : audience ? (
            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-2 tabular-nums">
              {audience.recipientCount} recipient{audience.recipientCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>

        {sent ? (
          <StatsPanel stats={stats} />
        ) : (
          <button
            onClick={() => setShowSend(true)}
            disabled={
              pending ||
              !draft.subject ||
              !draft.bodyHtml ||
              !draft.audienceId ||
              (draft.sendChannel === 'gmail' && gmailAccounts.length === 0)
            }
            className="w-full text-sm font-semibold py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 disabled:opacity-50"
          >
            Send campaign
          </button>
        )}
      </aside>

      {showAiDraft && (
        <AiDraftModal
          busy={aiBusy}
          onClose={() => setShowAiDraft(false)}
          onApply={async (brief) => {
            setAiBusy(true)
            try {
              const result = await draftCampaignAction(brief)
              if (!result) {
                alert('AI is unavailable right now — try again in a moment.')
                return
              }
              field('subject', result.subject)
              field('previewText', result.previewText)
              editor?.commands.setContent(result.bodyHtml)
              setShowAiDraft(false)
            } finally {
              setAiBusy(false)
            }
          }}
        />
      )}

      {aiImproveInstruction !== null && (
        <AiImproveModal
          busy={aiBusy}
          instruction={aiImproveInstruction}
          onChange={setAiImproveInstruction}
          onClose={() => setAiImproveInstruction(null)}
          onApply={async () => {
            if (!editor) return
            const { from, to } = editor.state.selection
            if (from === to) {
              setAiImproveInstruction(null)
              return
            }
            const selectedHtml = renderSelectionAsHtml(editor, from, to)
            setAiBusy(true)
            try {
              const result = await improveCopyAction(selectedHtml, aiImproveInstruction)
              if (!result) {
                alert('AI is unavailable right now — try again in a moment.')
                return
              }
              editor.chain().focus().deleteRange({ from, to }).insertContent(result).run()
              setAiImproveInstruction(null)
            } finally {
              setAiBusy(false)
            }
          }}
        />
      )}

      {showSend && (
        <SendConfirmModal
          campaignId={draft.id}
          channel={draft.sendChannel}
          audience={audience ?? null}
          gmailAccounts={gmailAccounts}
          onClose={() => setShowSend(false)}
          onSent={() => {
            setShowSend(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function renderSelectionAsHtml(editor: ReturnType<typeof useEditor>, from: number, to: number): string {
  if (!editor) return ''
  // ProseMirror's DOMSerializer turns a fragment into real DOM nodes. Render
  // into a detached div + read innerHTML to get the same markup the editor
  // would emit.
  const serializer = DOMSerializer.fromSchema(editor.schema)
  const fragment = editor.state.doc.slice(from, to).content
  const div = document.createElement('div')
  div.appendChild(serializer.serializeFragment(fragment))
  return div.innerHTML
}

function AiDraftModal({
  busy,
  onClose,
  onApply,
}: {
  busy: boolean
  onClose: () => void
  onApply: (brief: string) => void | Promise<void>
}) {
  const [brief, setBrief] = useState('')
  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 dark:bg-black/60 flex items-center justify-center p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-1">
          ✨ Draft with AI
        </h2>
        <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-3">
          One short brief — Claude writes a tenant-appropriate subject, preheader, and body.
          You can edit everything afterwards.
        </p>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={6}
          placeholder="e.g. Announce that DreamCRM now supports automated patient recall by SMS and email. Target: existing clinic owners on Basic plan. Encourage them to upgrade to Pro to unlock it. Keep it warm and short."
          className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 resize-none"
        />
        <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">
          This replaces the current subject, preheader, and body.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(brief)}
            disabled={busy || !brief.trim()}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
          >
            {busy ? 'Drafting…' : 'Draft it'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AiImproveModal({
  busy,
  instruction,
  onChange,
  onApply,
  onClose,
}: {
  busy: boolean
  instruction: string
  onChange: (s: string) => void
  onApply: () => void | Promise<void>
  onClose: () => void
}) {
  const presets = ['Make it punchier', 'Shorten by half', 'Add urgency', 'More casual', 'More formal']
  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 dark:bg-black/60 flex items-center justify-center p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-1">
          ✨ Rewrite selection
        </h2>
        <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-3">
          How should Claude rewrite the highlighted text?
        </p>
        <input
          value={instruction}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. add urgency"
          className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => onChange(p)}
              className="text-[11px] font-medium px-2 py-1 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            disabled={busy || !instruction.trim()}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
          >
            {busy ? 'Rewriting…' : 'Rewrite'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null

  function btn(active: boolean, label: string, onClick: () => void) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'text-[11px] font-medium px-2 py-1 rounded-md',
          active
            ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
            : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700',
        )}
      >
        {label}
      </button>
    )
  }

  function setLink() {
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = prompt('URL', previousUrl ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  function addImage() {
    const url = prompt('Image URL', 'https://')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  return (
    <div className="px-5 py-2 border-b border-stone-100 dark:border-stone-700/40 flex items-center gap-1 flex-wrap">
      {btn(editor.isActive('bold'), 'B', () => editor.chain().focus().toggleBold().run())}
      {btn(editor.isActive('italic'), 'I', () => editor.chain().focus().toggleItalic().run())}
      {btn(editor.isActive('strike'), 'S', () => editor.chain().focus().toggleStrike().run())}
      <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-1" />
      {btn(editor.isActive('heading', { level: 2 }), 'H2', () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
      )}
      {btn(editor.isActive('heading', { level: 3 }), 'H3', () =>
        editor.chain().focus().toggleHeading({ level: 3 }).run(),
      )}
      {btn(editor.isActive('blockquote'), '“ ”', () => editor.chain().focus().toggleBlockquote().run())}
      <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-1" />
      {btn(editor.isActive('bulletList'), '• List', () => editor.chain().focus().toggleBulletList().run())}
      {btn(editor.isActive('orderedList'), '1. List', () => editor.chain().focus().toggleOrderedList().run())}
      <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-1" />
      {btn(editor.isActive('link'), 'Link', setLink)}
      {btn(false, 'Image', addImage)}
    </div>
  )
}

function StatsPanel({ stats }: { stats: CampaignStats }) {
  const openRate = stats.sent ? Math.round((stats.uniqueOpens / stats.sent) * 100) : 0
  const clickRate = stats.sent ? Math.round((stats.uniqueClicks / stats.sent) * 100) : 0
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
      <h3 className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-3">
        Performance
      </h3>
      <div className="space-y-2 text-sm">
        <StatRow label="Sent" value={stats.sent} />
        <StatRow label="Delivered" value={stats.delivered} />
        <StatRow label="Opens" value={`${stats.uniqueOpens} (${openRate}%)`} />
        <StatRow label="Clicks" value={`${stats.uniqueClicks} (${clickRate}%)`} />
        {stats.bounce > 0 && <StatRow label="Bounces" value={stats.bounce} tone="warn" />}
        {stats.unsubscribe > 0 && <StatRow label="Unsubscribes" value={stats.unsubscribe} tone="warn" />}
      </div>
    </div>
  )
}

function StatRow({ label, value, tone }: { label: string; value: string | number; tone?: 'warn' }) {
  return (
    <div className="flex items-center justify-between">
      <span className={tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'}>
        {label}
      </span>
      <span className="font-semibold tabular-nums text-stone-800 dark:text-stone-100">{value}</span>
    </div>
  )
}

function SendConfirmModal({
  campaignId,
  channel,
  audience,
  gmailAccounts,
  onClose,
  onSent,
}: {
  campaignId: number
  channel: 'resend' | 'gmail' | 'twilio_sms'
  audience: AudienceOption | null
  gmailAccounts: GmailAccount[]
  onClose: () => void
  onSent: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [gmailAccountId, setGmailAccountId] = useState(gmailAccounts[0]?.id ?? '')
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null)

  function send() {
    startTransition(async () => {
      const r = await sendCampaignAction(campaignId, {
        gmailAccountId: channel === 'gmail' ? gmailAccountId : undefined,
      })
      setResult({ sent: r.sent, failed: r.failed })
      if (r.failed === 0) {
        setTimeout(onSent, 1200)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 dark:bg-black/60 flex items-center justify-center p-4"
      onClick={result ? onClose : onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {result ? (
          <>
            <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-2">
              {result.failed === 0 ? '✅ Sent' : 'Done with errors'}
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-300 mb-4">
              {result.sent} delivered, {result.failed} failed.
            </p>
            <div className="flex justify-end">
              <button
                onClick={onSent}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900"
              >
                OK
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-3">
              Send campaign
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-300 mb-4">
              Sending to {audience?.recipientCount ?? 0} recipient
              {audience?.recipientCount === 1 ? '' : 's'} via{' '}
              <strong>{channel === 'resend' ? 'Resend' : 'Gmail'}</strong>.
            </p>
            {channel === 'gmail' && gmailAccounts.length > 1 && (
              <label className="block mb-3">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
                  From
                </span>
                <select
                  value={gmailAccountId}
                  onChange={(e) => setGmailAccountId(e.target.value)}
                  className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                >
                  {gmailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName ?? a.emailAddress} &lt;{a.emailAddress}&gt;
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-[11px] text-stone-400 dark:text-stone-500 mb-4 italic">
              This actually sends real emails. The action can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={pending}
                className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={pending}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 disabled:opacity-50"
              >
                {pending ? 'Sending…' : 'Send now'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
