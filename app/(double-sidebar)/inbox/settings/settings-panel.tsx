'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatShortDate, formatTime } from '@/lib/utils'
import type { EmailAccountSummary } from '@/lib/services/mailbox'
import { disconnectMailbox, reclassifyAllAction, syncMailbox } from '../mailbox-actions'

interface Props {
  accounts: EmailAccountSummary[]
  configured: boolean
  flash: { connectedEmail: string | null; error: string | null }
}

export default function SettingsPanel({ accounts, configured, flash }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reclassifying, startReclassify] = useTransition()
  const [reclassifyResult, setReclassifyResult] = useState<{
    reset: number
    classified: number
    viaHeuristic: number
    remaining: number
  } | null>(null)
  const router = useRouter()

  function handleReclassify() {
    if (!confirm('Reclassify every auto-categorized message in this inbox? Manual moves and Gmail-labeled messages are left alone. Can take a couple minutes for large mailboxes.')) {
      return
    }
    setError(null)
    setReclassifyResult(null)
    startReclassify(async () => {
      try {
        const result = await reclassifyAllAction()
        setReclassifyResult(result)
        router.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  async function handleSync(id: string) {
    setBusy(id)
    setError(null)
    try {
      await syncMailbox(id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function handleDisconnect(id: string, email: string) {
    if (!confirm(`Disconnect ${email}? Cached messages stay until cleanup. You can reconnect anytime.`)) return
    setBusy(id)
    setError(null)
    try {
      await disconnectMailbox(id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="px-6 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Inbox accounts</h1>
        <Link href="/inbox" className="text-sm text-gray-500 hover:text-violet-600 dark:hover:text-violet-400">
          ← Back to inbox
        </Link>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Connect Gmail accounts to bring their inboxes into DreamCRM. Each org can connect as many addresses as you
        need — info@, billing@, support@, etc.
      </p>

      {flash.connectedEmail && (
        <div className="mb-4 text-sm bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 px-4 py-3 rounded">
          Connected <strong>{flash.connectedEmail}</strong>. We&apos;re pulling in your recent inbox in the background.
        </div>
      )}
      {flash.error && (
        <div className="mb-4 text-sm bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 px-4 py-3 rounded">
          {flash.error}
        </div>
      )}
      {error && (
        <div className="mb-4 text-sm bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Add a Gmail account</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          You&apos;ll be sent to Google to sign in and approve access. We request read + send scopes so you can reply
          from this app.
        </p>
        {configured ? (
          <a
            href="/api/oauth/gmail/start"
            className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 inline-flex items-center gap-2"
          >
            Connect Gmail →
          </a>
        ) : (
          <div className="text-sm bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 rounded">
            Gmail OAuth isn&apos;t configured yet. A platform admin needs to set{' '}
            <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> in Vercel.
          </div>
        )}
      </div>

      {accounts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Reclassify backlog</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            We&apos;ve been improving how new mail is categorized — Gmail&apos;s own SPAM and category labels are
            now respected, replies inherit their thread&apos;s category, and known senders go straight to Primary.
            Click below to re-run the classifier over your existing inbox so older mis-categorized messages get
            sorted with the new logic. Manual moves and Gmail-labeled messages stay locked.
          </p>
          <button
            type="button"
            onClick={handleReclassify}
            disabled={reclassifying}
            className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {reclassifying ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                </svg>
                Reclassifying…
              </>
            ) : (
              'Reclassify everything'
            )}
          </button>
          {reclassifyResult && (
            <div className="mt-3 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 rounded">
              Reset {reclassifyResult.reset.toLocaleString()} messages.{' '}
              {reclassifyResult.viaHeuristic.toLocaleString()} sorted via heuristic (Gmail label, thread inheritance, or known sender).{' '}
              {reclassifyResult.classified.toLocaleString()} sorted via AI.
              {reclassifyResult.remaining > 0 && (
                <> {reclassifyResult.remaining.toLocaleString()} still pending — click again to keep processing.</>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
          Connected accounts <span className="text-gray-400 font-medium">({accounts.length})</span>
        </h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            None yet. Click <em>Connect Gmail</em> above to add your first.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            {accounts.map((a) => (
              <li key={a.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 dark:text-gray-100">
                    {a.emailAddress}
                    <span className="ml-2 text-[10px] uppercase font-semibold bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-300 px-1.5 py-0.5 rounded">
                      {a.provider}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {a.displayName ? `${a.displayName} · ` : ''}
                    Status:{' '}
                    <span
                      className={
                        a.syncStatus === 'ready'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : a.syncStatus === 'syncing'
                            ? 'text-amber-600 dark:text-amber-400'
                            : a.syncStatus === 'error'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-500'
                      }
                    >
                      {a.syncStatus}
                    </span>
                    {a.lastSyncAt && (
                      <> · synced {formatShortDate(a.lastSyncAt)} {formatTime(a.lastSyncAt)}</>
                    )}
                    {a.unreadCount > 0 && <> · {a.unreadCount} unread</>}
                  </div>
                  {a.syncError && (
                    <div className="text-xs text-red-600 mt-1 max-w-xl truncate">{a.syncError}</div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSync(a.id)}
                    disabled={busy === a.id}
                    className="btn-xs border border-gray-200 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 px-2 py-1 rounded disabled:opacity-60"
                  >
                    {busy === a.id ? 'Working…' : 'Refresh'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(a.id, a.emailAddress)}
                    disabled={busy === a.id}
                    className="btn-xs border border-red-200 dark:border-red-500/40 text-red-600 px-2 py-1 rounded disabled:opacity-60"
                  >
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
