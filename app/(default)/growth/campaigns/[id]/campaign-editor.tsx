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
import { ActionButton } from '@/components/ui/action-button'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { useUnsavedChanges } from '@/components/ui/use-unsaved-changes'
import {
  cancelScheduledCampaignAction,
  deleteCampaignAction,
  draftCampaignAction,
  improveCopyAction,
  previewCampaignAction,
  scheduleCampaignAction,
  sendCampaignAction,
  updateCampaignAction,
} from '../../../marketing/actions'
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
  scheduledAt: string | null
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
  /** Clinic IANA timezone — surfaced as a hint next to the scheduler so the
   *  staff member knows the picked wall-clock is interpreted in their zone. */
  clinicTimeZone: string
  /** Who this org emails: 'patients' for clinics, 'recipients' for the
   *  platform tenant (whose audiences are clinic owners, not patients). */
  recipientNoun?: string
}

export default function CampaignEditor({
  campaign,
  audiences,
  gmailAccounts,
  defaultFromEmail,
  stats,
  clinicTimeZone,
  recipientNoun = 'patients',
}: Props) {
  const router = useRouter()
  // Named askConfirm to avoid shadowing the local schedule-picker `confirm()`.
  const askConfirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState(campaign)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  useUnsavedChanges(dirty, () =>
    askConfirm({ title: 'Discard unsaved changes?', message: 'Your unsaved edits to this campaign will be lost.', confirmLabel: 'Discard', danger: true }),
  )
  const [showSend, setShowSend] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [previewInput, setPreviewInput] = useState<
    null | { subject: string; previewText: string; bodyHtml: string }
  >(null)
  const [showAiDraft, setShowAiDraft] = useState(false)
  const [aiImproveInstruction, setAiImproveInstruction] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  // Preview text is optional — the field stays folded until it has a value
  // or the writer asks for it (composer-widget pass: no idle chrome rows).
  const [showPreviewText, setShowPreviewText] = useState(!!campaign.previewText)

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

  async function destroy() {
    if (!(await askConfirm({ title: 'Delete this campaign?', message: 'This also deletes all its analytics.', confirmLabel: 'Delete', danger: true }))) return
    startTransition(async () => {
      await deleteCampaignAction(draft.id)
      // The clinic's campaign home is the Outreach hub (post-fold); only the
      // platform tenant still has a standalone campaigns list.
      router.push(recipientNoun === 'patients' ? '/growth/outreach' : '/growth/campaigns')
    })
  }

  const sent = campaign.status === 'completed' || campaign.status === 'active'
  const isScheduled = draft.status === 'scheduled'
  const sendDisabled =
    pending ||
    !draft.subject ||
    !draft.bodyHtml ||
    !draft.audienceId ||
    (draft.sendChannel === 'gmail' && gmailAccounts.length === 0)
  const audience = audiences.find((a) => a.id === draft.audienceId)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4">
      {/* ── Editor column ── */}
      <div className="v2-card overflow-hidden">
        <div className="px-5 py-3 border-b border-[color:var(--color-hairline)]">
          <input
            value={draft.name}
            onChange={(e) => field('name', e.target.value)}
            placeholder="Campaign name (internal only)"
            className="w-full text-base font-semibold text-gray-800 dark:text-gray-100 bg-transparent border-none focus:outline-none focus:ring-0 px-0"
          />
        </div>
        <div className="px-5 py-3 border-b border-[color:var(--color-hairline)] space-y-2">
          <Labelled label="Subject">
            <input
              value={draft.subject}
              onChange={(e) => field('subject', e.target.value)}
              placeholder="What recipients see in their inbox"
              className="form-input w-full"
            />
          </Labelled>
          {showPreviewText ? (
            <Labelled label="Preview text">
              <input
                value={draft.previewText}
                onChange={(e) => field('previewText', e.target.value)}
                placeholder="One-line tease shown next to the subject"
                className="form-input w-full"
                autoFocus={!draft.previewText}
              />
            </Labelled>
          ) : (
            <button
              type="button"
              onClick={() => setShowPreviewText(true)}
              className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              + Preview text (the one-line tease next to the subject)
            </button>
          )}
        </div>

        {/* ONE toolbar — formatting, emoji drawer, and the AI assists together
            (composer-widget pass: the separate AI bar row folded in here). */}
        {editor && (
          <EditorToolbar editor={editor}>
            <EmojiPicker
              direction="down"
              onPick={(e) => editor.chain().focus().insertContent(e).run()}
            />
            <span className="w-px h-4 bg-[color:var(--color-hairline-strong)] mx-1" />
            <button
              type="button"
              onClick={() => setShowAiDraft(true)}
              disabled={sent}
              className="text-xs font-medium px-2 py-1 rounded-[var(--r-sm)] bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300 disabled:opacity-50 transition-colors"
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
                  toast('Select some text to rewrite first.', { tone: 'urgent' })
                  return
                }
                setAiImproveInstruction('')
              }}
              disabled={sent}
              className="text-xs font-medium px-2 py-1 rounded-[var(--r-sm)] bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300 disabled:opacity-50 transition-colors"
              title="Rewrite the selected text"
            >
              ✨ Rewrite
            </button>
            {aiBusy && (
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">AI working…</span>
            )}
          </EditorToolbar>
        )}

        <div className="px-5 py-4 min-h-[320px]">
          <EditorContent editor={editor} />
        </div>

        <div className="px-5 py-2 border-t border-[color:var(--color-hairline)] flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
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
            className="text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 px-2 py-0.5 rounded-md disabled:opacity-50"
          >
            Delete campaign
          </button>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <aside className="space-y-3">
        <div className="v2-card p-4">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Send channel
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => field('sendChannel', 'resend')}
              disabled={sent}
              className={cn(
                'text-xs font-medium px-2 py-1.5 rounded-[var(--r-sm)] transition-colors',
                draft.sendChannel === 'resend'
                  ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:hover:bg-gray-700',
                sent && 'opacity-60 cursor-not-allowed',
              )}
            >
              Resend
            </button>
            <button
              onClick={() => field('sendChannel', 'gmail')}
              disabled={sent || gmailAccounts.length === 0}
              className={cn(
                'text-xs font-medium px-2 py-1.5 rounded-[var(--r-sm)] transition-colors',
                draft.sendChannel === 'gmail'
                  ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:hover:bg-gray-700',
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
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">
            {draft.sendChannel === 'resend'
              ? `Branded email from ${defaultFromEmail || 'a verified sender'}. Best for large sends; needs DNS records set up on your domain.`
              : `From your connected Gmail / Workspace mailbox. ${recipientNoun === 'patients' ? 'Patients' : 'Recipients'} see a familiar address and replies land in your inbox. Lower daily limit (~500/day).`}
          </p>
        </div>

        <div className="v2-card p-4">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Audience
          </h3>
          <select
            value={draft.audienceId ?? ''}
            onChange={(e) => field('audienceId', e.target.value ? Number(e.target.value) : null)}
            disabled={sent}
            className="form-select w-full disabled:opacity-60"
          >
            <option value="">Choose…</option>
            {audiences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.recipientCount}
              </option>
            ))}
          </select>
          {audiences.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
              No audiences yet. <a className="underline" href="/growth/audiences">Create one</a>.
            </p>
          ) : audience ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 tabular-nums font-mono-num">
              {audience.recipientCount} recipient{audience.recipientCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>

        <ActionButton
          variant="secondary"
          onClick={() =>
            setPreviewInput({
              subject: draft.subject,
              previewText: draft.previewText,
              bodyHtml: editor?.getHTML() ?? draft.bodyHtml,
            })
          }
          className="w-full justify-center"
        >
          👁 Preview email
        </ActionButton>

        {sent ? (
          <StatsPanel stats={stats} />
        ) : isScheduled ? (
          <ScheduledPanel
            scheduledAt={draft.scheduledAt}
            timeZone={clinicTimeZone}
            pending={pending}
            onCancel={() => {
              startTransition(async () => {
                const r = await cancelScheduledCampaignAction(draft.id)
                if (r.ok) {
                  setDraft((d) => ({ ...d, status: 'draft', scheduledAt: null }))
                  router.refresh()
                } else {
                  toast(r.error, { tone: 'urgent' })
                }
              })
            }}
          />
        ) : (
          <div className="space-y-1.5">
            <ActionButton
              variant="primary"
              onClick={() => setShowSend(true)}
              disabled={sendDisabled}
              className="w-full justify-center"
            >
              Send now
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => setShowSchedule(true)}
              disabled={sendDisabled}
              className="w-full justify-center"
            >
              Send later
            </ActionButton>
          </div>
        )}
      </aside>

      {previewInput && (
        <CampaignPreviewModal
          campaignId={draft.id}
          draft={previewInput}
          onClose={() => setPreviewInput(null)}
        />
      )}

      {showAiDraft && (
        <AiDraftModal
          recipientNoun={recipientNoun}
          busy={aiBusy}
          onClose={() => setShowAiDraft(false)}
          onApply={async (brief) => {
            setAiBusy(true)
            try {
              const result = await draftCampaignAction(brief)
              if (!result) {
                toast('AI is unavailable right now — try again in a moment.', { tone: 'urgent' })
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
                toast('AI is unavailable right now — try again in a moment.', { tone: 'urgent' })
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
          recipientNoun={recipientNoun}
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

      {showSchedule && (
        <ScheduleModal
          audience={audience ?? null}
          timeZone={clinicTimeZone}
          orgNoun={recipientNoun === 'patients' ? 'clinic' : 'organization'}
          dirty={dirty}
          onClose={() => setShowSchedule(false)}
          onConfirm={async (whenLocal) => {
            // Persist any pending edits first, so the scheduled send uses the
            // latest body/subject (autosave may not have fired yet).
            if (dirty) {
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
            }
            // datetime-local has no zone; treat the wall-clock as the user's
            // local time (matches the picker UI) by sending an ISO string.
            const iso = new Date(whenLocal).toISOString()
            const r = await scheduleCampaignAction(draft.id, iso)
            if (r.ok) {
              setDraft((d) => ({ ...d, status: 'scheduled', scheduledAt: iso }))
              setShowSchedule(false)
              router.refresh()
            }
            return r
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

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | {
      status: 'ready'
      html: string
      subject: string
      sampleName: string
      realRecipient: boolean
      fromLabel: string
    }

function CampaignPreviewModal({
  campaignId,
  draft,
  onClose,
}: {
  campaignId: number
  draft: { subject: string; previewText: string; bodyHtml: string }
  onClose: () => void
}) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    previewCampaignAction(campaignId, draft)
      .then((r) => {
        if (!active) return
        setState(r.ok ? { status: 'ready', ...r } : { status: 'error', error: r.error })
      })
      .catch(() => {
        if (active) setState({ status: 'error', error: 'Could not build a preview.' })
      })
    return () => {
      active = false
    }
  }, [campaignId, draft])

  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[color:var(--color-hairline)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Preview
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Exactly what a recipient receives — branding, footer, and personalization.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none -mt-0.5 px-1"
          >
            ×
          </button>
        </div>

        {state.status === 'ready' && (
          <div className="px-5 py-2.5 border-b border-[color:var(--color-hairline)] text-xs space-y-1 v2-well">
            <div className="flex gap-2">
              <span className="text-gray-400 dark:text-gray-500 w-14 shrink-0">From</span>
              <span className="font-mono text-gray-700 dark:text-gray-200 truncate">{state.fromLabel}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 dark:text-gray-500 w-14 shrink-0">To</span>
              <span className="text-gray-700 dark:text-gray-200 truncate">
                <strong>{state.sampleName}</strong>
                {state.realRecipient
                  ? ' — first in your audience'
                  : ' — sample data (no audience chosen yet)'}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 dark:text-gray-500 w-14 shrink-0">Subject</span>
              <span className="text-gray-800 dark:text-gray-100 font-medium truncate">
                {state.subject || <span className="italic font-normal text-gray-400">(no subject yet)</span>}
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden bg-[#f5f5f4] dark:bg-gray-900/40 p-3">
          {state.status === 'loading' && (
            <div className="h-[60vh] min-h-[320px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              Building preview…
            </div>
          )}
          {state.status === 'error' && (
            <div className="h-[60vh] min-h-[320px] flex items-center justify-center text-center px-6">
              <p className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>
            </div>
          )}
          {state.status === 'ready' && (
            <iframe
              title="Email preview"
              srcDoc={state.html}
              sandbox=""
              className="w-full h-[60vh] min-h-[320px] rounded-[var(--r-sm)] border border-[color:var(--color-hairline)] bg-white"
            />
          )}
        </div>

        <div className="px-5 py-3 border-t border-[color:var(--color-hairline)] flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400 dark:text-gray-500 leading-snug">
            Links are disabled in preview. {`{{firstName}}`} and {`{{bookingUrl}}`} are filled in,
            just like a real send.
          </p>
          <ActionButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function AiDraftModal({
  recipientNoun = 'patients',
  busy,
  onClose,
  onApply,
}: {
  recipientNoun?: string
  busy: boolean
  onClose: () => void
  onApply: (brief: string) => void | Promise<void>
}) {
  const [brief, setBrief] = useState('')
  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
          ✨ Draft with AI
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          One short brief — Claude writes a subject, preview text, and body in your voice.
          You can edit everything afterward.
        </p>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={6}
          placeholder={
            recipientNoun === 'patients'
              ? 'e.g. Invite patients who are overdue for a cleaning to book this month — mention our new Saturday hours and online booking. Keep it warm and short.'
              : 'e.g. Announce that DreamCRM now supports automated patient recall by SMS and email. Target: existing clinic owners on Basic plan. Encourage them to upgrade to Pro to unlock it. Keep it warm and short.'
          }
          className="form-textarea w-full resize-none"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          This replaces the current subject, preview text, and body.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <ActionButton variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={() => onApply(brief)} disabled={busy || !brief.trim()}>
            {busy ? 'Drafting…' : 'Draft it'}
          </ActionButton>
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
      className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
          ✨ Rewrite selection
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          How should Claude rewrite the highlighted text?
        </p>
        <input
          value={instruction}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. add urgency"
          className="form-input w-full"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => onChange(p)}
              className="text-xs font-medium px-2 py-1 rounded-[var(--r-sm)] bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <ActionButton variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={onApply} disabled={busy || !instruction.trim()}>
            {busy ? 'Rewriting…' : 'Rewrite'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}

function EditorToolbar({
  editor,
  children,
}: {
  editor: ReturnType<typeof useEditor>
  /** Extra toolbar tools (emoji drawer, AI assists) rendered after the
   *  formatting buttons — one row, no separate chrome bars. */
  children?: React.ReactNode
}) {
  if (!editor) return null

  function btn(active: boolean, label: string, onClick: () => void) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'text-xs font-medium px-2 py-1 rounded-[var(--r-sm)] transition-colors',
          active
            // Toggle-on = teal selection (DESIGN-SYSTEM accent rules), not a status fill.
            ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
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
    <div className="px-5 py-2 border-b border-[color:var(--color-hairline)] flex items-center gap-1 flex-wrap">
      {btn(editor.isActive('bold'), 'B', () => editor.chain().focus().toggleBold().run())}
      {btn(editor.isActive('italic'), 'I', () => editor.chain().focus().toggleItalic().run())}
      {btn(editor.isActive('strike'), 'S', () => editor.chain().focus().toggleStrike().run())}
      <span className="w-px h-4 bg-[color:var(--color-hairline-strong)] mx-1" />
      {btn(editor.isActive('heading', { level: 2 }), 'H2', () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
      )}
      {btn(editor.isActive('heading', { level: 3 }), 'H3', () =>
        editor.chain().focus().toggleHeading({ level: 3 }).run(),
      )}
      {btn(editor.isActive('blockquote'), '“ ”', () => editor.chain().focus().toggleBlockquote().run())}
      <span className="w-px h-4 bg-[color:var(--color-hairline-strong)] mx-1" />
      {btn(editor.isActive('bulletList'), '• List', () => editor.chain().focus().toggleBulletList().run())}
      {btn(editor.isActive('orderedList'), '1. List', () => editor.chain().focus().toggleOrderedList().run())}
      <span className="w-px h-4 bg-[color:var(--color-hairline-strong)] mx-1" />
      {btn(editor.isActive('link'), 'Link', setLink)}
      {btn(false, 'Image', addImage)}
      {children}
    </div>
  )
}

function StatsPanel({ stats }: { stats: CampaignStats }) {
  const openRate = stats.sent ? Math.round((stats.uniqueOpens / stats.sent) * 100) : 0
  const clickRate = stats.sent ? Math.round((stats.uniqueClicks / stats.sent) * 100) : 0
  return (
    <div className="v2-card p-4">
      <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-3">
        Performance
      </h3>
      <div className="space-y-2 text-sm">
        <StatRow label="Sent" value={stats.sent} />
        <StatRow label="Delivered" value={stats.delivered} />
        <StatRow label="Opens" value={`${stats.uniqueOpens} (${openRate}%)`} />
        <StatRow label="Clicks" value={`${stats.uniqueClicks} (${clickRate}%)`} />
        {stats.bounce > 0 && <StatRow label="Bounces" value={stats.bounce} tone="urgent" />}
        {stats.unsubscribe > 0 && <StatRow label="Unsubscribes" value={stats.unsubscribe} tone="neutral" />}
      </div>
    </div>
  )
}

function StatRow({ label, value, tone }: { label: string; value: string | number; tone?: 'urgent' | 'neutral' }) {
  return (
    <div className="flex items-center justify-between">
      <span className={tone === 'urgent' ? 'text-rose-700 dark:text-rose-300' : 'text-gray-600 dark:text-gray-300'}>
        {label}
      </span>
      <span className="font-semibold tabular-nums font-mono-num text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  )
}

function SendConfirmModal({
  campaignId,
  recipientNoun = 'patients',
  channel,
  audience,
  gmailAccounts,
  onClose,
  onSent,
}: {
  campaignId: number
  recipientNoun?: string
  channel: 'resend' | 'gmail' | 'twilio_sms'
  audience: AudienceOption | null
  gmailAccounts: GmailAccount[]
  onClose: () => void
  onSent: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [gmailAccountId, setGmailAccountId] = useState(gmailAccounts[0]?.id ?? '')
  const [result, setResult] = useState<{ sent: number; failed: number; suppressed: number } | null>(null)

  function send() {
    startTransition(async () => {
      const r = await sendCampaignAction(campaignId, {
        gmailAccountId: channel === 'gmail' ? gmailAccountId : undefined,
      })
      setResult({ sent: r.sent, failed: r.failed, suppressed: r.suppressed ?? 0 })
      if (r.failed === 0) {
        setTimeout(onSent, 1200)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {result ? (
          <>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">
              {result.failed === 0 ? '✅ Sent' : 'Done with errors'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              {result.sent} delivered, {result.failed} failed.
              {result.suppressed > 0 && (
                <>
                  {' '}
                  {result.suppressed} sat this one out — they&rsquo;ve already had 2 marketing
                  emails in the last 7 days, so we held theirs back.
                </>
              )}
            </p>
            <div className="flex justify-end">
              <ActionButton variant="primary" size="sm" onClick={onSent}>
                OK
              </ActionButton>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
              Send campaign
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Sending to {audience?.recipientCount ?? 0} recipient
              {audience?.recipientCount === 1 ? '' : 's'} via{' '}
              <strong>
                {channel === 'resend' ? 'branded email' : channel === 'gmail' ? 'your Gmail' : channel}
              </strong>.
            </p>
            {channel === 'gmail' && gmailAccounts.length > 1 && (
              <label className="block mb-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
                  From
                </span>
                <select
                  value={gmailAccountId}
                  onChange={(e) => setGmailAccountId(e.target.value)}
                  className="form-select w-full"
                >
                  {gmailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName ?? a.emailAddress} &lt;{a.emailAddress}&gt;
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 italic">
              This actually sends real emails. The action can't be undone.
              {recipientNoun === 'patients' &&
                ' Patients who already got 2 marketing emails in the last 7 days are skipped automatically.'}
            </p>
            <div className="flex justify-end gap-2">
              <ActionButton variant="ghost" size="sm" onClick={onClose} disabled={pending}>
                Cancel
              </ActionButton>
              <ActionButton variant="primary" size="sm" onClick={send} disabled={pending}>
                {pending ? 'Sending…' : 'Send now'}
              </ActionButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Sidebar panel shown while a campaign is queued for a future send. */
function ScheduledPanel({
  scheduledAt,
  timeZone,
  pending,
  onCancel,
}: {
  scheduledAt: string | null
  timeZone: string
  pending: boolean
  onCancel: () => void
}) {
  const when = scheduledAt
    ? new Date(scheduledAt).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone,
      })
    : null
  return (
    // Scheduled = info tone (ball-in-their-court / queued). v3 moved info
    // indigo→violet so it reads distinct from the dream-blue brand.
    <div className="bg-violet-50 dark:bg-violet-500/10 rounded-[var(--r-lg)] border border-violet-200 dark:border-violet-500/30 p-4">
      <h3 className="text-xs uppercase tracking-wider font-semibold text-violet-700 dark:text-violet-300 mb-1">
        Scheduled
      </h3>
      <p className="text-sm text-violet-800 dark:text-violet-200 mb-3">
        {when ? <>Queued to send <strong>{when}</strong>.</> : 'Queued to send.'}
      </p>
      <ActionButton variant="secondary" size="sm" onClick={onCancel} disabled={pending} className="w-full justify-center">
        {pending ? 'Working…' : 'Cancel scheduled send'}
      </ActionButton>
    </div>
  )
}

/** Returns a `YYYY-MM-DDTHH:mm` string in LOCAL time for a Date — the format
 *  <input type="datetime-local"> expects. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ScheduleModal({
  audience,
  timeZone,
  orgNoun = 'clinic',
  dirty,
  onClose,
  onConfirm,
}: {
  audience: AudienceOption | null
  timeZone: string
  orgNoun?: string
  dirty: boolean
  onClose: () => void
  onConfirm: (whenLocal: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Default to tomorrow at 9am local; min is 5 min out (matches the server guard).
  const now = new Date()
  const minValue = toLocalInputValue(new Date(now.getTime() + 5 * 60 * 1000))
  const defaultValue = (() => {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return toLocalInputValue(d)
  })()
  const [when, setWhen] = useState(defaultValue)
  // datetime-local is interpreted in the DEVICE's timezone (see onConfirm's
  // `new Date(whenLocal)`) — say so honestly, and flag when that differs from
  // the clinic's zone so a remote staffer isn't surprised by the send time.
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zoneMismatch = !!timeZone && deviceZone !== timeZone

  function confirm() {
    setError(null)
    startTransition(async () => {
      const r = await onConfirm(when)
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={pending ? undefined : onClose}
    >
      <div className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Schedule send</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Send to {audience?.recipientCount ?? 0} recipient{audience?.recipientCount === 1 ? '' : 's'} at a time you pick.
          {dirty ? ' Your latest edits are saved when you schedule.' : ''}
        </p>
        <label className="block mb-2">
          <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
            Date &amp; time
          </span>
          <input
            type="datetime-local"
            value={when}
            min={minValue}
            onChange={(e) => setWhen(e.target.value)}
            className="form-input w-full"
          />
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Times are in your device&rsquo;s timezone ({deviceZone}). It sends automatically — no need to keep this open.
          {zoneMismatch && (
            <span className="block mt-1 text-amber-700 dark:text-amber-400">
              Heads up: that&rsquo;s different from the {orgNoun}&rsquo;s timezone ({timeZone}) — pick the time as it reads on your own clock.
            </span>
          )}
        </p>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <ActionButton variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={confirm} disabled={pending || !when}>
            {pending ? 'Scheduling…' : 'Schedule'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
