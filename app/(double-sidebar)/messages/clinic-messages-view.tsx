import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { TenantContext } from '@/lib/auth/context'
import {
  CANNED_TEMPLATES,
  getInboxStats,
  getPatientThreadById,
  listMessagesInThread,
  listPatientThreads,
  renderTemplate,
  type MessageChannel,
  type ThreadFilters,
  type ThreadMessage,
  type ThreadRow,
} from '@/lib/services/patient-messaging'
import { markReadAction } from './clinic-actions'
import ThreadDetailPanel from './clinic-thread-detail-panel'

/**
 * Front-style unified Patient Communications inbox for clinic tenants.
 *
 * Layout:
 *   ┌────────────┬──────────────────┬──────────────────────────────┐
 *   │ Filter rail│ Thread list      │ Thread detail + composer     │
 *   │  (chips)   │ (one row /       │  (header + stream + reply)   │
 *   │            │  patient)        │                              │
 *   └────────────┴──────────────────┴──────────────────────────────┘
 *
 * URL state: ?thread=<id> selects the active thread. Filter chips
 * navigate via additional query params (status, assignedTo, q).
 */

interface SP {
  thread?: string
  status?: string
  assignedTo?: string
  q?: string
  unread?: string
}

const STATUS_FILTERS: { key: ThreadFilters['status']; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'snoozed', label: 'Snoozed' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

const ASSIGN_FILTERS: { key: ThreadFilters['assignedTo']; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'me', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
]

function fmtRelative(d: Date | null): string {
  if (!d) return ''
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function channelChip(channel: MessageChannel | null): { label: string; cls: string } {
  switch (channel) {
    case 'email':  return { label: 'Email', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' }
    case 'sms':    return { label: 'SMS',   cls: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300' }
    case 'in_app': return { label: 'In-app', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' }
    default:       return { label: '—', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400' }
  }
}

/** Aging color border — inbound-unanswered drifts green→amber→red */
function rotClass(t: ThreadRow): string {
  if (t.lastMessageDirection !== 'inbound' || !t.lastMessageAt) return 'border-l-transparent'
  const hours = (Date.now() - t.lastMessageAt.getTime()) / (60 * 60 * 1000)
  if (hours < 4) return 'border-l-emerald-400 dark:border-l-emerald-500'
  if (hours < 24) return 'border-l-amber-400 dark:border-l-amber-500'
  return 'border-l-rose-400 dark:border-l-rose-500'
}

export default async function ClinicMessagesView({
  ctx,
  searchParams,
}: {
  ctx: TenantContext
  searchParams: SP
}) {
  if (ctx.tenantType !== 'clinic') redirect('/messages')

  const filters: ThreadFilters = {
    status: (STATUS_FILTERS.find((f) => f.key === searchParams.status)?.key as ThreadFilters['status']) ?? 'open',
    assignedTo: (ASSIGN_FILTERS.find((f) => f.key === searchParams.assignedTo)?.key as ThreadFilters['assignedTo']) ?? 'all',
    search: searchParams.q,
    hasUnread: searchParams.unread === '1',
  }

  const [threads, stats] = await Promise.all([
    listPatientThreads(ctx.organizationId, ctx.userId, filters),
    getInboxStats(ctx.organizationId, ctx.userId),
  ])

  const activeThread = searchParams.thread
    ? await getPatientThreadById(ctx.organizationId, searchParams.thread)
    : null

  const messages: ThreadMessage[] = activeThread
    ? await listMessagesInThread(ctx.organizationId, activeThread.id)
    : []

  // Mark the active thread read when it has unread messages on the
  // staff side. Fire-and-forget — the next render will reflect zero.
  if (activeThread && activeThread.unreadCount > 0) {
    await markReadAction(activeThread.id)
  }

  return (
    <div className="flex flex-col h-full bg-stone-50 dark:bg-stone-950">
      {/* ── Top filter bar ─────────────────────────────────────────── */}
      <div className="border-b border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900 px-4 py-2 flex items-center gap-2 flex-wrap shrink-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mr-2 shrink-0">
          Inbox
        </p>
        {STATUS_FILTERS.map((f) => {
          const active = (filters.status ?? 'open') === f.key
          const count = f.key === 'open' ? stats.open : f.key === 'archived' ? stats.archived : null
          return (
            <FilterChip
              key={f.key ?? 'all'}
              href={buildHref(searchParams, { status: f.key, thread: undefined })}
              label={f.label}
              active={active}
              count={count}
            />
          )
        })}
        <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-1" />
        {ASSIGN_FILTERS.map((f) => {
          const active = (filters.assignedTo ?? 'all') === f.key
          return (
            <FilterChip
              key={f.key ?? 'all-assign'}
              href={buildHref(searchParams, { assignedTo: f.key, thread: undefined })}
              label={f.label}
              active={active}
            />
          )
        })}
        <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-1" />
        <FilterChip
          href={buildHref(searchParams, { unread: searchParams.unread === '1' ? undefined : '1', thread: undefined })}
          label="Unread only"
          active={searchParams.unread === '1'}
          count={stats.unread || null}
        />
      </div>

      {/* ── Two-column body ─────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* Thread list */}
        <aside className="w-[22rem] shrink-0 border-r border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
                No threads match the current filters.
              </p>
            </div>
          ) : (
            <ul>
              {threads.map((t) => {
                const ch = channelChip(t.lastMessageChannel)
                const active = activeThread?.id === t.id
                return (
                  <li key={t.id} className={`border-b border-stone-100 dark:border-stone-700/40 border-l-2 ${rotClass(t)}`}>
                    <Link
                      href={buildHref(searchParams, { thread: t.id })}
                      className={`block px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/40 ${active ? 'bg-violet-50/50 dark:bg-violet-500/[0.08]' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className={`text-[13px] truncate ${t.unreadCount > 0 ? 'font-bold text-stone-900 dark:text-stone-100' : 'font-medium text-stone-700 dark:text-stone-200'}`}>
                          {t.patientFirstName} {t.patientLastName}
                        </p>
                        <span className="text-[10px] text-stone-400 dark:text-stone-500 tabular-nums shrink-0">
                          {fmtRelative(t.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-[12px] text-stone-500 dark:text-stone-400 truncate">
                        {t.lastMessageDirection === 'outbound' ? (
                          <span className="text-stone-400 dark:text-stone-500">You: </span>
                        ) : null}
                        {t.lastMessagePreview ?? <span className="italic">No messages yet</span>}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ch.cls}`}>
                          {ch.label}
                        </span>
                        {t.unreadCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-600 text-white tabular-nums">
                            {t.unreadCount}
                          </span>
                        )}
                        {t.assignedUserName && (
                          <span className="text-[10px] text-stone-400 dark:text-stone-500 truncate">
                            · {t.assignedUserName.split(' ')[0]}
                          </span>
                        )}
                        {t.status === 'snoozed' && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400">💤 Snoozed</span>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* Thread detail */}
        <section className="flex-1 min-w-0 flex flex-col">
          {activeThread ? (
            <ThreadDetailPanel
              thread={{
                id: activeThread.id,
                patientId: activeThread.patientId,
                patientFirstName: activeThread.patientFirstName,
                patientLastName: activeThread.patientLastName,
                patientEmail: activeThread.patientEmail,
                patientPhone: activeThread.patientPhone,
                status: activeThread.status,
                assignedUserName: activeThread.assignedUserName,
                snoozedUntil: activeThread.snoozedUntil ? activeThread.snoozedUntil.toISOString() : null,
                lastMessageChannel: activeThread.lastMessageChannel,
              }}
              messages={messages.map((m) => ({
                ...m,
                sentAt: m.sentAt.toISOString(),
              }))}
              currentUserName={ctx.userName ?? null}
              templates={CANNED_TEMPLATES.map((t) => ({
                key: t.key,
                label: t.label,
                rendered: renderTemplate(t.body, {
                  firstName: activeThread.patientFirstName,
                  lastName: activeThread.patientLastName,
                }),
              }))}
              hasEmail={!!activeThread.patientEmail}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-10">
              <div className="max-w-md text-center">
                <p className="text-base font-semibold text-stone-700 dark:text-stone-200 mb-2">
                  {threads.length === 0
                    ? 'No patient conversations yet'
                    : 'Pick a thread to read or reply'}
                </p>
                <p className="text-[13px] text-stone-500 dark:text-stone-400">
                  Every patient who messages you (in-app, email, SMS) lands here, threaded by patient — one row per relationship across every channel.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function FilterChip({
  href,
  label,
  active,
  count,
}: {
  href: string
  label: string
  active: boolean
  count?: number | null
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'text-[11px] font-semibold px-2.5 py-1 rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
          : 'text-[11px] font-medium px-2.5 py-1 rounded-full text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
      }
    >
      {label}
      {count != null && count > 0 && (
        <span className={active ? 'ml-1 opacity-75 tabular-nums' : 'ml-1 text-stone-500 dark:text-stone-400 tabular-nums'}>
          {count}
        </span>
      )}
    </Link>
  )
}

function buildHref(current: SP, overrides: Partial<SP>): string {
  const merged: Record<string, string | undefined> = { ...current, ...overrides }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v)
  }
  const qs = params.toString()
  return `/messages${qs ? `?${qs}` : ''}`
}
