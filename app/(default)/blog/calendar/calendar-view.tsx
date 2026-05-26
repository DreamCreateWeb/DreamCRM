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

export default function CalendarView({ items }: { items: CalendarItem[] }) {
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
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
            Content calendar
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Plan your posts
          </h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
            Generate ideas tailored to your services and town, draft them in a click, then schedule them to publish
            on their own. Every post is your clinic&apos;s own — never recycled.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/blog"
            className="text-[13px] font-medium px-3 py-2 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            All posts
          </Link>
          <button
            type="button"
            onClick={() => setShowIdeas(true)}
            className="text-[13px] font-semibold px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
          >
            ✨ Generate ideas
          </button>
        </div>
      </div>

      <div className="space-y-8">
        <Section
          title="Ideas to draft"
          count={ideasToDraft.length}
          empty="No idea stubs right now. Hit “Generate ideas” to fill your queue."
        >
          {ideasToDraft.map((i) => (
            <Row key={i.id} item={i}>
              <Link
                href={`/blog/${i.id}?ai=1`}
                className="text-[12px] font-semibold px-2.5 py-1.5 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300"
              >
                ✨ Draft this
              </Link>
            </Row>
          ))}
        </Section>

        <Section title="Drafts" count={drafts.length} empty="No drafts in progress.">
          {drafts.map((i) => (
            <Row key={i.id} item={i}>
              {i.ready ? (
                <ScheduleControl id={i.id} onDone={() => router.refresh()} />
              ) : (
                <span className="text-[11px] text-stone-400 dark:text-stone-500 italic">
                  Add content + an author to schedule
                </span>
              )}
            </Row>
          ))}
        </Section>

        <Section title="Scheduled" count={scheduled.length} empty="Nothing scheduled yet.">
          {scheduled.map((i) => (
            <Row key={i.id} item={i}>
              <span className="text-[12px] text-amber-700 dark:text-amber-300 tabular-nums">
                Goes live {fmtDateTime(i.scheduledFor)}
              </span>
              <UnscheduleButton id={i.id} onDone={() => router.refresh()} />
            </Row>
          ))}
        </Section>

        <Section title="Recently published" count={published.length} empty="No published posts yet.">
          {published.map((i) => (
            <Row key={i.id} item={i}>
              <span className="text-[12px] text-stone-400 dark:text-stone-500 tabular-nums">{fmt(i.publishedAt)}</span>
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
      <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">
        {title} <span className="text-stone-400 dark:text-stone-500 font-normal">· {count}</span>
      </h2>
      {count === 0 ? (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-6 text-center">
          <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">{empty}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 divide-y divide-stone-100 dark:divide-stone-700/40">
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
        <Link
          href={`/blog/${item.id}`}
          className="font-medium text-[14px] text-stone-800 dark:text-stone-100 hover:text-violet-600 dark:hover:text-violet-400"
        >
          {item.title}
        </Link>
        <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
          {item.category ?? 'Uncategorized'}
          {item.source === 'ai_draft' && ' · AI'}
        </div>
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
        className="text-[12px] px-2 py-1 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
      />
      <button
        type="button"
        onClick={schedule}
        disabled={pending}
        className="text-[12px] font-semibold px-2.5 py-1.5 rounded-md bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 disabled:opacity-50"
      >
        {pending ? 'Scheduling…' : 'Schedule'}
      </button>
      {error && <span className="text-[11px] text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  )
}

function UnscheduleButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      onClick={() => startTransition(async () => {
        await unscheduleBlogPostAction(id)
        onDone()
      })}
      disabled={pending}
      className="text-[12px] font-medium px-2 py-1 rounded-md text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 disabled:opacity-50"
    >
      Unschedule
    </button>
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
    <div className="fixed inset-0 z-50 bg-stone-900/40 dark:bg-black/60 flex items-center justify-center p-4" onClick={busy || pending ? undefined : onClose}>
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-1">✨ Generate ideas</h2>
        <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-3">
          Original topic ideas tailored to your services, town, and the season. Pick the ones you like — each becomes a
          draft you finish with one click. Nothing publishes on its own.
        </p>

        {!generated ? (
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="w-full text-sm font-semibold py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
          >
            {busy ? 'Thinking up ideas…' : 'Generate 6 ideas'}
          </button>
        ) : ideas && ideas.length > 0 ? (
          <>
            <div className="space-y-2 mb-4">
              {ideas.map((idea, i) => (
                <label
                  key={i}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-stone-200 dark:border-stone-700 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/40"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(checked[i])}
                    onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-stone-800 dark:text-stone-100">{idea.title}</p>
                    <p className="text-[12px] text-stone-500 dark:text-stone-400">{idea.angle}</p>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-violet-600 dark:text-violet-400">
                      {idea.category}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-between items-center gap-2">
              <button onClick={generate} disabled={busy} className="text-[12px] text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 disabled:opacity-50">
                {busy ? 'Regenerating…' : '↻ Regenerate'}
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700">
                  Cancel
                </button>
                <button
                  onClick={add}
                  disabled={pending || Object.values(checked).every((v) => !v)}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-white dark:text-stone-900 disabled:opacity-50"
                >
                  {pending ? 'Adding…' : `Add ${Object.values(checked).filter(Boolean).length} to queue`}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-3">
              AI is unavailable right now — try again in a moment.
            </p>
            <button onClick={onClose} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
