'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { disconnectMailbox } from './integration-actions'
import { type Tone } from '@/lib/ui/encodings'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { relativeTime } from '@/lib/utils'
import { SettingsTabs } from '../settings-tabs'

export interface IntegrationAccount {
  id: string
  label: string
  sub: string
  /** Real per-mailbox sync health (email_account.sync_status):
   *  pending | syncing | ready | error. Absent for non-Gmail rows. */
  syncStatus?: string
  /** email_account.sync_error — the last failure message, when status='error'. */
  syncError?: string | null
  /** email_account.last_sync_at (ISO) — powers the "synced {relative}" line.
   *  null until the first successful sync. */
  lastSyncAtIso?: string | null
  /** Live unread count for this mailbox (derived, not stored). */
  unreadCount?: number
}

export interface Integration {
  key: string
  name: string
  category: string
  description: string
  icon: 'mail' | 'card' | 'send' | 'sparkle' | 'cloud'
  accent: 'rose' | 'sky' | 'amber' | 'violet' | 'emerald'
  status:
    | { kind: 'connected'; detail?: string }
    | { kind: 'available'; detail?: string }
    // `managed` marks an integration wired through platform env-vars a clinic
    // user can't touch — the panel then shows a calm "Configured by your Dream
    // Create administrator" line instead of a dead env-var instruction.
    | { kind: 'partial'; detail?: string; managed?: boolean }
    | { kind: 'misconfigured'; detail?: string; managed?: boolean }
  /** Per-account list (Gmail accounts, etc.) */
  accounts?: IntegrationAccount[]
  /** Click-to-connect URL */
  connectHref?: string
  /** "Manage" link (settings page, external dashboard, etc.) */
  manageHref?: string
}

interface Props {
  integrations: Integration[]
  tenantType: 'platform' | 'clinic' | 'patient'
}

const ACCENT_BG: Record<Integration['accent'], string> = {
  rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300',
  sky: 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-300',
  amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  violet: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
}

const STATUS_TONE: Record<Integration['status']['kind'], Tone> = {
  connected: 'ok',
  available: 'neutral',
  partial: 'warn',
  misconfigured: 'urgent',
}

const STATUS_LABEL: Record<Integration['status']['kind'], string> = {
  connected: 'Connected',
  available: 'Not connected',
  partial: 'Partial',
  misconfigured: 'Not configured',
}

/**
 * Map a mailbox's REAL sync_status column onto a pill tone + label. `ready`
 * is the healthy resting state (ok); a hard `error` is the one that needs
 * attention (urgent); `syncing`/`pending` are in-flight (info). Teal is never
 * a status, so we stay inside the semantic tones.
 */
function syncStatusPill(status: string | undefined): { tone: Tone; label: string } | null {
  switch (status) {
    case 'ready':
      return { tone: 'ok', label: 'Active' }
    case 'syncing':
      return { tone: 'info', label: 'Syncing…' }
    case 'pending':
      return { tone: 'info', label: 'First sync pending' }
    case 'error':
      return { tone: 'urgent', label: 'Sync error' }
    default:
      return null
  }
}

export default function IntegrationsPanel({ integrations, tenantType }: Props) {
  return (
    <div className="grow">
      <div className="p-6">
        <SettingsTabs
          tabs={[
            {
              id: 'accounts',
              label: 'Connected accounts',
              subtabs: [
                {
                  id: 'all',
                  label: 'Accounts',
                  content: (
                    <>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {tenantType === 'platform'
            ? 'External services that power DreamCRM behind the scenes. Most are configured by your Dream Create administrator.'
            : tenantType === 'clinic'
              ? 'Services connected to your DreamCRM workspace.'
              : 'Services connected to your account.'}
        </p>

        {integrations.length === 0 ? (
          <EmptyState
            icon="🔌"
            title="No integrations available"
            body="There's nothing to connect for this account yet."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {integrations.map((i) => (
              <IntegrationCard key={i.key} integration={i} />
            ))}
          </div>
        )}
                    </>
                  ),
                },
              ],
            },
          ]}
        />
      </div>
    </div>
  )
}

function IntegrationCard({ integration: i }: { integration: Integration }) {
  const isConnected = i.status.kind === 'connected'
  const hasAccounts = !!i.accounts && i.accounts.length > 0
  // An "available" integration with a live connect path is an invitation, not
  // a settled state — give it a teal-tinted etched surface so it reads clearly
  // apart from connected/managed cards. (Teal = identity/selection accent.)
  const invite = i.status.kind === 'available' && !!i.connectHref
  const isManaged = 'managed' in i.status && !!i.status.managed

  return (
    <div
      className={`v2-card flex flex-col p-5 ${
        invite ? 'ring-1 ring-inset ring-teal-500/25 dark:ring-teal-400/20' : ''
      }`}
    >
      <div className="mb-3 flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ACCENT_BG[i.accent]}`}>
          <IconFor icon={i.icon} />
        </div>
        <div className="min-w-0 grow">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{i.name}</h3>
            <StatusPill tone={STATUS_TONE[i.status.kind]} label={STATUS_LABEL[i.status.kind]} />
          </div>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {i.category}
          </p>
        </div>
      </div>

      <p className="mb-3 text-sm leading-snug text-gray-600 dark:text-gray-300">{i.description}</p>

      {i.status.detail && (
        <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{i.status.detail}</p>
      )}

      {/* Env-var-configured integrations a clinic user can't act on: a calm,
          neutral line instead of a dead "set X env var" instruction. No docs
          URL exists in the codebase, so we don't invent one. */}
      {isManaged && (
        <p className="mb-3 flex items-center gap-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          <svg className="h-3.5 w-3.5 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 0h10.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25v-6a2.25 2.25 0 012.25-2.25z" />
          </svg>
          Configured by your Dream Create administrator.
        </p>
      )}

      {hasAccounts && (
        <ul className="mb-3 space-y-1.5">
          {i.accounts!.map((a) => (
            <AccountRow key={a.id} integrationKey={i.key} account={a} />
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        {/* Primary Connect — the clear call to action on an unconnected,
            connectable integration. When mailboxes already exist it steps
            down to a secondary "Add another mailbox" so the connected state
            doesn't read the same as an empty one. */}
        {!isConnected && i.connectHref && !hasAccounts && (
          <ActionButton href={i.connectHref} variant="primary" size="sm">
            Connect
          </ActionButton>
        )}
        {i.connectHref && hasAccounts && (
          <ActionButton href={i.connectHref} variant="secondary" size="sm">
            {i.key === 'gmail' ? 'Add another mailbox' : 'Add another'}
          </ActionButton>
        )}
        {i.manageHref && (
          <ActionButton
            href={i.manageHref}
            variant="ghost"
            size="sm"
            target={i.manageHref.startsWith('http') ? '_blank' : undefined}
            className="ml-auto"
          >
            {i.manageHref.startsWith('http') ? 'Open dashboard ↗' : 'Manage →'}
          </ActionButton>
        )}
      </div>
    </div>
  )
}

function AccountRow({ integrationKey, account }: { integrationKey: string; account: IntegrationAccount }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()

  async function handleDisconnect() {
    if (integrationKey !== 'gmail') return
    if (
      !(await confirm({
        title: `Disconnect ${account.sub}?`,
        message: 'This stops inbox sync and revokes the OAuth token.',
        confirmLabel: 'Disconnect',
        danger: true,
      }))
    )
      return
    startTransition(async () => {
      await disconnectMailbox(account.id)
      router.refresh()
    })
  }

  const pill = syncStatusPill(account.syncStatus)
  // Only claim a "synced {time}" once there's a real last_sync_at timestamp.
  const syncedLabel = account.lastSyncAtIso ? `Synced ${relativeTime(account.lastSyncAtIso)}` : null
  const unread =
    typeof account.unreadCount === 'number' && account.unreadCount > 0
      ? `${account.unreadCount} unread`
      : null

  return (
    <li className="v2-well flex items-center gap-2 px-2.5 py-2">
      <div className="min-w-0 grow">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{account.label}</p>
          {pill && <StatusPill tone={pill.tone} label={pill.label} title={account.syncError ?? undefined} />}
        </div>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{account.sub}</p>
        {/* Health line — every value here is real (last_sync_at + live unread).
            When the mailbox errored, surface the actual sync_error message. */}
        {account.syncStatus === 'error' && account.syncError ? (
          <p className="mt-0.5 truncate text-xs text-rose-600 dark:text-rose-400" title={account.syncError}>
            {account.syncError}
          </p>
        ) : (
          (syncedLabel || unread) && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500 dark:text-gray-400">
              {syncedLabel && (
                <span className="tabular-nums font-mono-num">{syncedLabel}</span>
              )}
              {syncedLabel && unread && <span aria-hidden="true">·</span>}
              {unread && <span className="tabular-nums font-mono-num">{unread}</span>}
            </p>
          )
        )}
      </div>
      {integrationKey === 'gmail' && (
        <ActionButton
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          disabled={pending}
          className="shrink-0 self-start text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
        >
          {pending ? 'Disconnecting…' : 'Disconnect'}
        </ActionButton>
      )}
    </li>
  )
}

function IconFor({ icon }: { icon: Integration['icon'] }) {
  const cls = 'w-5 h-5'
  switch (icon) {
    case 'mail':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      )
    case 'card':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9V6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25V9m-19.5 0v9.75A2.25 2.25 0 004.5 21h15a2.25 2.25 0 002.25-2.25V9" />
        </svg>
      )
    case 'send':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      )
    case 'sparkle':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18 6V3M16.5 4.5h3M18 18v-3m-1.5 1.5h3" />
        </svg>
      )
    case 'cloud':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
        </svg>
      )
  }
}
