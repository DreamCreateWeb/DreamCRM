import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { TenantContext } from '@/lib/auth/context'
import {
  CANNED_TEMPLATES,
  getInboxStats,
  getPatientThreadById,
  getThreadPatientContext,
  listMessagesInThread,
  listPatientThreads,
  markThreadRead,
  renderTemplate,
  type ThreadFilters,
  type ThreadMessage,
  type ThreadPatientContext,
  type ThreadRow,
} from '@/lib/services/patient-messaging'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { agingBorderClass, messageRotTier } from '@/lib/ui/encodings'
import { channelMeta, CHANNEL_LEGEND } from './channel-meta'
import ThreadDetailPanel from './clinic-thread-detail-panel'
import MessagesSurfaceTabs from './surface-tabs'
import NavBadgeSync from './nav-badge-sync'

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

/**
 * Aging left-border for an inbound thread waiting on a reply — drifts
 * fresh (emerald) → aging (amber) → overdue (rose) via the shared
 * messages rot vocabulary. Returns transparent when the ball isn't ours
 * (last message was outbound, or no messages yet).
 */
function rotBorderClass(t: ThreadRow): string {
  if (t.lastMessageDirection !== 'inbound' || !t.lastMessageAt) {
    return agingBorderClass(null)
  }
  const waitingHours = (Date.now() - t.lastMessageAt.getTime()) / (60 * 60 * 1000)
  return agingBorderClass(messageRotTier(waitingHours))
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

  // Pull the message stream + the slim patient context strip in parallel —
  // so staff replying see next/last visit, PMS balance, and missing-intake
  // without leaving the inbox.
  const [messages, patientContext]: [ThreadMessage[], ThreadPatientContext | null] = activeThread
    ? await Promise.all([
        listMessagesInThread(ctx.organizationId, activeThread.id),
        getThreadPatientContext(ctx.organizationId, activeThread.patientId),
      ])
    : [[], null]

  // Mark the active thread read when it has unread messages on the
  // staff side. Call the service directly (NOT the server action wrapper):
  // markReadAction calls revalidatePath('/messages') which Next.js
  // disallows during render — the route would throw with a server-side
  // exception every time a staff member clicked a thread with unread
  // messages, then succeed on reload (because the unreadCount was 0 by
  // then). The page is `force-dynamic` so explicit revalidation is
  // redundant anyway; the next click already triggers a fresh render.
  if (activeThread && activeThread.unreadCount > 0) {
    await markThreadRead(ctx.organizationId, activeThread.id)
  }

  const filterEmpty = threads.length === 0 && hasActiveFilters(filters)
  // Drives the mobile single-pane collapse: a thread is "selected" when the
  // ?thread= param resolved to a real thread. List shows when false; detail
  // shows when true. At lg+ both render regardless.
  const threadSelected = activeThread != null

  return (
    <div className="flex flex-col h-full bg-[color:var(--color-canvas)]">
      {/* Drops the sidebar's unread-Messages badge the moment a thread is read. */}
      <NavBadgeSync signal={activeThread?.id ?? 'list'} />
      {/* Surface tabs (Patients ⇄ Mailbox) — shared with /inbox so neither is
          a one-way trip. */}
      <MessagesSurfaceTabs active="patients" />

      {/* ── Top filter bar (the two-pane PageHeader analogue) ────────── */}
      <div className="border-b border-[color:var(--color-hairline)] bg-[color:var(--color-surface-2)] px-4 py-2 flex items-center gap-2 flex-wrap shrink-0">
        {STATUS_FILTERS.map((f) => {
          const active = (filters.status ?? 'open') === f.key
          const count = f.key === 'open' ? stats.open : f.key === 'archived' ? stats.archived : null
          return (
            <NavFilterChip
              key={f.key ?? 'all'}
              href={buildHref(searchParams, { status: f.key, thread: undefined })}
              label={f.label}
              active={active}
              count={count}
              title={STATUS_FILTER_TITLES[f.key ?? 'all']}
            />
          )
        })}
        <span className="w-px h-4 bg-[color:var(--color-hairline-strong)] mx-1" aria-hidden="true" />
        {ASSIGN_FILTERS.map((f) => {
          const active = (filters.assignedTo ?? 'all') === f.key
          return (
            <NavFilterChip
              key={f.key ?? 'all-assign'}
              href={buildHref(searchParams, { assignedTo: f.key, thread: undefined })}
              label={f.label}
              active={active}
              title={ASSIGN_FILTER_TITLES[f.key ?? 'all']}
            />
          )
        })}
        <span className="w-px h-4 bg-[color:var(--color-hairline-strong)] mx-1" aria-hidden="true" />
        <NavFilterChip
          href={buildHref(searchParams, { unread: searchParams.unread === '1' ? undefined : '1', thread: undefined })}
          label="Unread only"
          active={searchParams.unread === '1'}
          count={stats.unread || null}
          title="Show only threads with messages you haven't read yet"
        />
        {/* Key affordance — explains the rot border + channel hues. */}
        <div className="ml-auto shrink-0">
          <EncodingLegend
            aging="messages"
            pills={CHANNEL_LEGEND}
          />
        </div>
      </div>

      {/* ── Two-column body ─────────────────────────────────────────── */}
      {/* Below lg, this is one pane at a time (list OR detail) — picking a
          thread (?thread=…) swaps to the detail with a "← All conversations"
          back link; with none selected we show the list. At lg+ both panes
          show side-by-side, exactly as before. */}
      <div className="flex-1 flex min-h-0">
        {/* Thread list — full width on mobile when no thread is selected;
            hidden on mobile once a thread is open; fixed-width column at lg+. */}
        <aside
          className={`${threadSelected ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-[22rem] shrink-0 border-r border-[color:var(--color-hairline)] bg-[color:var(--color-surface-1)] overflow-y-auto`}
        >
          {threads.length === 0 ? (
            <EmptyState
              icon={filterEmpty ? '🔍' : '💬'}
              title={filterEmpty ? 'No threads match these filters' : 'No conversations yet'}
              body={
                filterEmpty
                  ? 'Try a different status or clear the unread filter to see more.'
                  : 'When a patient messages you — in-app, by email, or by text — the thread shows up right here.'
              }
            />
          ) : (
            <ul>
              {threads.map((t) => {
                const ch = channelMeta(t.lastMessageChannel)
                const active = activeThread?.id === t.id
                const preview =
                  t.lastMessagePreview ?? (t.lastMessageDirection ? '' : 'No messages yet')
                return (
                  <li key={t.id} className={`border-b border-[color:var(--color-hairline)] border-l-4 ${rotBorderClass(t)}`}>
                    <Link
                      href={buildHref(searchParams, { thread: t.id })}
                      aria-current={active ? 'true' : undefined}
                      className={`block px-4 py-3 transition-colors ${
                        active
                          ? 'bg-teal-500/5 shadow-[inset_0_0_0_1px_rgb(40_179_173/0.4)]'
                          : 'hover:bg-gray-500/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className={`text-sm truncate ${t.unreadCount > 0 ? 'font-bold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-200'}`}>
                          {t.patientFirstName} {t.patientLastName}
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                          {fmtRelative(t.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={preview || undefined}>
                        {t.lastMessageDirection === 'outbound' ? (
                          <span className="text-gray-500 dark:text-gray-400">You: </span>
                        ) : null}
                        {t.lastMessagePreview ?? <span className="italic">No messages yet</span>}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span
                          className={`text-xs font-medium px-1.5 py-0.5 rounded-[var(--r-xs)] ${ch.pill}`}
                          title={ch.title}
                        >
                          {ch.label}
                        </span>
                        {t.unreadCount > 0 && (
                          <span
                            className="text-xs font-bold px-1.5 py-0.5 rounded-[var(--r-xs)] bg-amber-500 text-white dark:text-gray-900 tabular-nums"
                            title={`${t.unreadCount} unread message${t.unreadCount === 1 ? '' : 's'}`}
                          >
                            {t.unreadCount}
                          </span>
                        )}
                        {t.assignedUserName && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={`Assigned to ${t.assignedUserName}`}>
                            · {t.assignedUserName.split(' ')[0]}
                          </span>
                        )}
                        {t.status === 'snoozed' && (
                          <span className="text-xs text-amber-700 dark:text-amber-300" title="Snoozed — will resurface later">💤 Snoozed</span>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* Thread detail — full width on mobile once a thread is open;
            hidden on mobile when none is selected (the list shows instead);
            grows beside the list at lg+. */}
        <section className={`${threadSelected ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 flex-col`}>
          {activeThread ? (
            <ThreadDetailPanel
              // Re-mount the panel per thread so its useState-initializer
              // hooks (auto-picked channel, blank composer body) re-run
              // with the new thread's messages. Without this React reuses
              // the same instance across thread switches and the channel
              // selector sticks on whatever the first-opened thread had —
              // and any in-progress draft text leaks across patients.
              key={activeThread.id}
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
              patientContext={patientContext}
              backHref={buildHref(searchParams, { thread: undefined })}
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
              <EmptyState
                icon="💬"
                title={threads.length === 0 ? 'No patient conversations yet' : 'Pick a thread to read or reply'}
                body="Every patient who messages you — in-app, by email, or by text — lands here, threaded by patient. One row per relationship, across every channel."
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * Link-based filter chip for the navigation-driven thread filters. Mirrors the
 * shared <FilterChip> recipe (components/ui/filter-chip.tsx) visually — same
 * active/inactive treatment, ≥ text-xs, tabular-nums counts — but renders an
 * <a> because filtering here is a server navigation (the page is RSC), not an
 * onClick toggle. Carries `title` so each chip's meaning is hoverable.
 */
function NavFilterChip({
  href,
  label,
  active,
  count,
  title,
}: {
  href: string
  label: string
  active: boolean
  count?: number | null
  title?: string
}) {
  // Mirrors the shared <FilterChip> recipe (components/ui/filter-chip.tsx) but
  // renders an <a> because filtering here is a server navigation, not onClick.
  // Selection ≠ status: teal tint + teal text + a hairline-strong ring.
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      title={title}
      className={`inline-flex items-center gap-1 rounded-[var(--r-xs)] px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
          : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {label}
      {count != null && count > 0 && <span className="tabular-nums opacity-70">{count}</span>}
    </Link>
  )
}

const STATUS_FILTER_TITLES: Record<string, string> = {
  open: 'Conversations that still need attention',
  snoozed: "Snoozed for later — they'll resurface",
  archived: 'Closed and tucked away',
  all: 'Every conversation, any status',
}

const ASSIGN_FILTER_TITLES: Record<string, string> = {
  all: "Everyone's conversations",
  me: 'Just the ones assigned to you',
  unassigned: 'Conversations nobody has picked up yet',
}

/** True when the filters are narrower than the open/everyone default. */
function hasActiveFilters(filters: ThreadFilters): boolean {
  return (
    (filters.status ?? 'open') !== 'open' ||
    (filters.assignedTo ?? 'all') !== 'all' ||
    !!filters.search ||
    !!filters.hasUnread
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
