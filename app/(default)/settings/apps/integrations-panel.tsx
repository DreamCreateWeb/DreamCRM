'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { disconnectMailbox } from './integration-actions'
import { type Tone } from '@/lib/ui/encodings'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { SettingsTabs } from '../settings-tabs'

export interface IntegrationAccount {
  id: string
  label: string
  sub: string
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
    | { kind: 'partial'; detail?: string }
    | { kind: 'misconfigured'; detail?: string }
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
            ? 'External services that power DreamCRM behind the scenes. Most are configured via environment variables in the Vercel project.'
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
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl p-5 flex flex-col">
      <div className="flex items-start gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg shrink-0 flex items-center justify-center ${ACCENT_BG[i.accent]}`}>
          <IconFor icon={i.icon} />
        </div>
        <div className="grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{i.name}</h3>
            <StatusPill tone={STATUS_TONE[i.status.kind]} label={STATUS_LABEL[i.status.kind]} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold mt-0.5">
            {i.category}
          </p>
        </div>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-snug">{i.description}</p>
      {i.status.detail && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{i.status.detail}</p>
      )}
      {i.accounts && i.accounts.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {i.accounts.map((a) => (
            <AccountRow key={a.id} integrationKey={i.key} account={a} />
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center gap-2 pt-2">
        {i.status.kind !== 'connected' && i.connectHref && (
          <ActionButton href={i.connectHref} variant="primary" size="sm">
            Connect
          </ActionButton>
        )}
        {i.connectHref && i.accounts && i.accounts.length > 0 && (
          <ActionButton href={i.connectHref} variant="secondary" size="sm">
            Add another
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
  const [pending, startTransition] = useTransition()

  function handleDisconnect() {
    if (integrationKey !== 'gmail') return
    if (!confirm(`Disconnect ${account.sub}? This stops inbox sync and revokes the OAuth token.`)) return
    startTransition(async () => {
      await disconnectMailbox(account.id)
      router.refresh()
    })
  }

  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/40">
      <div className="min-w-0 grow">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{account.label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{account.sub}</p>
      </div>
      {integrationKey === 'gmail' && (
        <ActionButton
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          disabled={pending}
          className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
        >
          Disconnect
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
