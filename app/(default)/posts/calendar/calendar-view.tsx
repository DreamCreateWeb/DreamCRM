'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CalendarItem } from './page'
import {
  suggestTopicsAction,
  createTopicStubsAction,
  scheduleBlogPostAction,
  unscheduleBlogPostAction,
} from '../actions'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'

interface Idea {
  title: string
  angle: string
  category: string
}

function fmt(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function defaultScheduleValue(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CalendarView({ items, orgName = 'Your clinic' }: { items: CalendarItem[]; orgName?: string }) {
  const router = useRouter()
  const [showIdeas, setShowIdeas] = useState(false)

  const ideasToDraft = items.filter((i) => i.status === 'draft' && !i.hasBody)
  const drafts = items.filter((i) => i.status === 'draft' && i.hasBody)
  const scheduled = items
    .filter((i) => i.status === 'scheduled')
    .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
  const published = items
    .filter((i) => i.status === 'published')
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, 8)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Website · ${orgName}`}
        title="Plan your posts"
        subtitle="Generate ideas tailored to your services and town, draft them in a click, then schedule them to publish on their own. Every post is your clinic's own — never recycled."
        actions={
          <>
            <ActionButton variant="secondary" size="sm" href="/posts">
              All posts
            </ActionButton>
            <ActionButton variant="primary" size="sm" onClick={() => setShowIdeas(true)}>
              ✨ Generate ideas
            </ActionButton>
          </>
        }
      />

      <div className="space-y-8">
        <Section
          title="Ideas to draft"
          count={ideasToDraft.length}
          empty="No idea stubs right now. Hit “Generate ideas” to fill your queue."
        >
          {ideasToDraft.map((i) => (
            <Row key={i.id} item={i}>
              <ActionButton variant="secondary" size="sm" href={`/posts/${i.id}?ai=1`}>
                ✨ Draft this
              </ActionButton>
            </Row>
          ))}
        </Section>

        <Section title="Drafts" count={drafts.length} empty="No drafts in progress.">
          {drafts.map((i) => (
            <Row key={i.id} item={i}>
              {i.ready ? (
                <ScheduleControl id={i.id} onDone={() => router.refresh()} />
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                  Add content + an author to schedule
                </span>
              )}
            </Row>
          ))}
        </Section>

        <Section title="Scheduled" count={scheduled.length} empty="Nothing scheduled yet.">
          {scheduled.map((i) => (
            <Row key={i.id} item={i}>
              <span className="text-xs text-indigo-700 dark:text-indigo-300 tabular-nums font-mono-num">
                Goes live {fmtDateTime(i.scheduledFor)}
              </span>
              <UnscheduleButton id={i.id} onDone={() => router.refresh()} />
            </Row>
          ))}
        </Section>

        <Section title="Recently published" count={published.length} empty="No published posts yet.">
          {published.map((i) => (
            <Row key={i.id} item={i}>
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">{fmt(i.publishedAt)}</span>
            </Row>
          ))}
        </Section>
      </div>

      {showIdeas && <GenerateIdeasModal onClose={() => setShowIdeas(false)} onAdded={() => router.refresh()} />}
    </div>
  )
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
        {title} <span className="text-gray-500 dark:text-gray-400 font-normal tabular-nums">· {count}</span>
      </h2>
      {count === 0 ? (
        <div className="v2-well p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">{empty}</p>
        </div>
      ) : (
        <div className="v2-card divide-y divide-[color:var(--color-hairline)]">
          {children}
        </div>
      )}
    </section>
  )
}

function Row({ item, children }: { item: CalendarItem; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/posts/${item.id}`}
            className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:text-teal-700 dark:hover:text-teal-400"
          >
            {item.title}
          </Link>
          {item.source === 'ai_draft' && <StatusPill tone="special" label="AI" title="AI-drafted" />}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.category ?? 'Uncategorized'}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  )
}

function ScheduleControl({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(defaultScheduleValue())
  const [error, setError] = useState<string | null>(null)

  function schedule() {
    setError(null)
    startTransition(async () => {
      const res = await scheduleBlogPostAction(id, new Date(value).toISOString())
      if (!res.ok) {
        setError(res.error)
        return
      }
      onDone()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-xs px-2 py-1 rounded-[var(--r-sm)] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      />
      <ActionButton variant="primary" size="sm" onClick={schedule} disabled={pending}>
        {pending ? 'Scheduling…' : 'Schedule'}
      </ActionButton>
      {error && <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  )
}

function UnscheduleButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  return (
    <ActionButton
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await unscheduleBlogPostAction(id)
          onDone()
        })
      }
    >
      Unschedule
    </ActionButton>
  )
}

function GenerateIdeasModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()
  const [ideas, setIdeas] = useState<Idea[] | null>(null)
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [generated, setGenerated] = useState(false)

  async function generate() {
    setBusy(true)
    try {
      const result = (await suggestTopicsAction(6)) as Idea[] | null
      setGenerated(true)
      if (result && result.length) {
        setIdeas(result)
        setChecked(Object.fromEntries(result.map((_, i) => [i, true])))
      } else {
        setIdeas([])
      }
    } finally {
      setBusy(false)
    }
  }

  function add() {
    if (!ideas) return
    const selected = ideas.filter((_, i) => checked[i])
    if (selected.length === 0) return
    startTransition(async () => {
      await createTopicStubsAction(
        selected.map((i) => ({ title: i.title, angle: i.angle, category: i.category })),
      )
      onAdded()
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 flex items-center justify-center p-4"
      onClick={busy || pending ? undefined : onClose}
    >
      <div
        className="bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">✨ Generate ideas</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Original topic ideas tailored to your services, town, and the season. Pick the ones you like — each becomes a
          draft you finish with one click. Nothing publishes on its own.
        </p>

        {!generated ? (
          <ActionButton variant="primary" onClick={generate} disabled={busy} className="w-full">
            {busy ? 'Thinking up ideas…' : 'Generate 6 ideas'}
          </ActionButton>
        ) : ideas && ideas.length > 0 ? (
          <>
            <div className="space-y-2 mb-4">
              {ideas.map((idea, i) => (
                <label
                  key={i}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(checked[i])}
                    onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{idea.title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{idea.angle}</p>
                    <span className="text-xs uppercase tracking-wider font-semibold text-teal-700 dark:text-teal-400">
                      {idea.category}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-between items-center gap-2">
              <button
                onClick={generate}
                disabled={busy}
                className="text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 disabled:opacity-50"
              >
                {busy ? 'Regenerating…' : '↻ Regenerate'}
              </button>
              <div className="flex gap-2">
                <ActionButton variant="secondary" size="sm" onClick={onClose}>
                  Cancel
                </ActionButton>
                <ActionButton
                  variant="primary"
                  size="sm"
                  onClick={add}
                  disabled={pending || Object.values(checked).every((v) => !v)}
                >
                  {pending ? 'Adding…' : `Add ${Object.values(checked).filter(Boolean).length} to queue`}
                </ActionButton>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              AI is unavailable right now — try again in a moment.
            </p>
            <ActionButton variant="primary" size="sm" onClick={onClose}>
              Close
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  )
}
