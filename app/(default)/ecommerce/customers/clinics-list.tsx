'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ClinicListRow } from '@/lib/services/clinics'
import { enterDemoMode, seedAndEnterDemoClinic, deleteClinicAction, resendClinicInviteAction } from './admin-actions'
import { type Tone } from '@/lib/ui/encodings'
import { FilterChip } from '@/components/ui/filter-chip'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  rows: ClinicListRow[]
}

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

// Plan tier → tone (hue matches the prior gray/sky/violet, mapped to the contract).
const PLAN_TONE: Record<ClinicListRow['planTier'], Tone> = {
  basic: 'neutral',
  pro: 'info',
  premium: 'special',
}

const PLAN_LABELS: Record<ClinicListRow['planTier'], string> = {
  basic: 'Basic',
  pro: 'Pro',
  premium: 'Premium',
}

// Subscription status → tone. active/trialing healthy; the past-due family is a
// problem now; everything else is inert.
function statusTone(status: string): Tone {
  if (status === 'active' || status === 'trialing') return 'ok'
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired') return 'urgent'
  return 'neutral'
}

type Filter = 'all' | 'basic' | 'pro' | 'premium' | 'past_due' | 'inactive'
type SortKey = 'recent' | 'name' | 'revenue' | 'patients' | 'projects'

function moneyShort(cents: number): string {
  if (cents === 0) return '—'
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k/mo`
  return `$${dollars.toFixed(0)}/mo`
}

export default function ClinicsList({ rows }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<SortKey>('recent')

  const filtered = useMemo(() => {
    let out = rows
    if (filter === 'basic' || filter === 'pro' || filter === 'premium') {
      out = out.filter((r) => r.planTier === filter)
    } else if (filter === 'past_due') {
      out = out.filter(
        (r) =>
          r.subscriptionStatus === 'past_due' ||
          r.subscriptionStatus === 'unpaid' ||
          r.subscriptionStatus === 'incomplete_expired',
      )
    } else if (filter === 'inactive') {
      out = out.filter(
        (r) =>
          r.subscriptionStatus == null ||
          (r.subscriptionStatus !== 'active' && r.subscriptionStatus !== 'trialing'),
      )
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.displayName?.toLowerCase().includes(q) ?? false) ||
          r.slug.toLowerCase().includes(q) ||
          (r.city?.toLowerCase().includes(q) ?? false),
      )
    }
    return [...out].sort((a, b) => {
      switch (sort) {
        case 'name':
          return (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name)
        case 'revenue':
          return b.monthlyContributionCents - a.monthlyContributionCents
        case 'patients':
          return b.patientCount - a.patientCount
        case 'projects':
          return b.activeProjectCount - a.activeProjectCount
        case 'recent':
        default:
          return b.createdAt.getTime() - a.createdAt.getTime()
      }
    })
  }, [rows, filter, query, sort])

  const counts = useMemo(() => {
    const c = { all: rows.length, basic: 0, pro: 0, premium: 0, past_due: 0, inactive: 0 }
    for (const r of rows) {
      if (r.planTier === 'basic') c.basic++
      else if (r.planTier === 'pro') c.pro++
      else if (r.planTier === 'premium') c.premium++
      if (
        r.subscriptionStatus === 'past_due' ||
        r.subscriptionStatus === 'unpaid' ||
        r.subscriptionStatus === 'incomplete_expired'
      ) {
        c.past_due++
      }
      if (
        r.subscriptionStatus == null ||
        (r.subscriptionStatus !== 'active' && r.subscriptionStatus !== 'trialing')
      ) {
        c.inactive++
      }
    }
    return c
  }, [rows])

  return (
    <div className="space-y-4">
      {/* Filter chips + search + sort */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            All
          </FilterChip>
          <FilterChip active={filter === 'basic'} onClick={() => setFilter('basic')} count={counts.basic}>
            Basic
          </FilterChip>
          <FilterChip active={filter === 'pro'} onClick={() => setFilter('pro')} count={counts.pro}>
            Pro
          </FilterChip>
          <FilterChip active={filter === 'premium'} onClick={() => setFilter('premium')} count={counts.premium}>
            Premium
          </FilterChip>
          <FilterChip active={filter === 'past_due'} onClick={() => setFilter('past_due')} count={counts.past_due}>
            Past due
          </FilterChip>
          <FilterChip active={filter === 'inactive'} onClick={() => setFilter('inactive')} count={counts.inactive}>
            Inactive
          </FilterChip>
        </div>
        <div className="flex-1 flex gap-2 lg:justify-end">
          <input
            type="search"
            placeholder="Search by name, slug, or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="form-input w-full lg:w-72"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="form-select"
            aria-label="Sort by"
          >
            <option value="recent">Most recent</option>
            <option value="name">Name (A–Z)</option>
            <option value="revenue">MRR contribution</option>
            <option value="patients">Patient count</option>
            <option value="projects">Active projects</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/30 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">Clinic</th>
                <th className="px-3 py-3 text-left font-semibold">Plan</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">MRR</th>
                <th className="px-3 py-3 text-right font-semibold">Patients</th>
                <th className="px-3 py-3 text-right font-semibold">Projects</th>
                <th className="px-3 py-3 text-left font-semibold">Joined</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-0 py-0">
                    {rows.length === 0 ? (
                      <EmptyState
                        icon="🏢"
                        title="No clinics signed up yet"
                        body="Your first one will appear here after onboarding. Want to preview the clinic dashboard right now? Seed a demo clinic and jump straight in."
                        action={<SeedDemoClinicButton />}
                      />
                    ) : (
                      <EmptyState
                        title="No clinics match your filter"
                        body="Try a different plan, status, or search term."
                      />
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <ClinicRow key={c.orgId} clinic={c} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-right tabular-nums">
          Showing {filtered.length} of {rows.length}
        </p>
      )}
    </div>
  )
}

function ClinicRow({ clinic: c }: { clinic: ClinicListRow }) {
  const siteUrl = `https://${c.slug}.${SITE_DOMAIN}`
  const statusKey = c.subscriptionStatus ?? 'inactive'
  const name = c.displayName ?? c.name
  const initials = name.charAt(0).toUpperCase()

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
      <td className="px-5 py-3">
        <Link
          href={`/ecommerce/customers/${c.orgId}`}
          className="flex items-center gap-3 group"
        >
          {c.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={c.logoUrl}
              alt=""
              className="w-9 h-9 rounded-lg object-cover shrink-0"
            />
          ) : (
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ backgroundColor: c.brandColor ?? '#6d28d9' }}
            >
              {initials}
            </span>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-gray-800 dark:text-gray-100 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">
              {name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {c.slug}
              {c.city && (
                <span className="ml-2">
                  · {c.city}
                  {c.state ? `, ${c.state}` : ''}
                </span>
              )}
            </div>
          </div>
        </Link>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1.5">
          <StatusPill tone={PLAN_TONE[c.planTier]} label={PLAN_LABELS[c.planTier]} />
          {c.billingMode === 'comped' && (
            <StatusPill tone="neutral" label="comped" title="Platform-granted plan — no Stripe subscription" />
          )}
        </span>
      </td>
      <td className="px-3 py-3">
        {c.billingMode === 'managed' && c.pendingPlanId ? (
          <StatusPill
            tone="info"
            label="setup pending"
            title="Owner invited — waiting on them to accept and add billing"
          />
        ) : (
          <StatusPill tone={statusTone(statusKey)} label={statusKey.replace('_', ' ')} />
        )}
      </td>
      <td className="px-3 py-3 text-right font-medium text-gray-800 dark:text-gray-100 tabular-nums">
        {moneyShort(c.monthlyContributionCents)}
      </td>
      <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-200 tabular-nums">
        {c.patientCount}
      </td>
      <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-200 tabular-nums">
        {c.activeProjectCount}
      </td>
      <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
        {c.createdAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {/* View as is the demo gateway — the row primary. */}
          <ViewAsButton orgId={c.orgId} />
          {c.billingMode === 'managed' && c.pendingPlanId && <ResendInviteButton orgId={c.orgId} />}
          <ActionButton href={siteUrl} variant="ghost" size="sm" target="_blank">
            Site ↗
          </ActionButton>
          <ActionButton href={`/ecommerce/customers/${c.orgId}`} variant="ghost" size="sm">
            Open
          </ActionButton>
          <DeleteClinicButton clinic={c} />
        </div>
      </td>
    </tr>
  )
}

function ResendInviteButton({ orgId }: { orgId: string }) {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  return (
    <ActionButton
      variant="ghost"
      size="sm"
      disabled={pending || sent}
      title="Re-send the owner's invite email"
      onClick={() =>
        startTransition(async () => {
          try {
            await resendClinicInviteAction(orgId)
            setSent(true)
            setTimeout(() => setSent(false), 4000)
          } catch {
            /* surfaced by the disabled state resetting; keep quiet */
          }
        })
      }
    >
      {sent ? 'Invite sent ✓' : pending ? 'Sending…' : 'Resend invite'}
    </ActionButton>
  )
}

function DeleteClinicButton({ clinic }: { clinic: ClinicListRow }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ActionButton
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400"
        title="Delete this clinic and all its data"
      >
        Delete
      </ActionButton>
      {open && <DeleteClinicModal clinic={clinic} onClose={() => setOpen(false)} />}
    </>
  )
}

function DeleteClinicModal({ clinic, onClose }: { clinic: ClinicListRow; onClose: () => void }) {
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ name: string; subscriptionCanceled: boolean } | null>(null)
  const matches = typed.trim() === clinic.slug
  const hasActiveSub =
    clinic.subscriptionStatus === 'active' || clinic.subscriptionStatus === 'trialing'

  function submit() {
    setError(null)
    if (!matches) { setError('Type the slug exactly to confirm.'); return }
    startTransition(async () => {
      try {
        const r = await deleteClinicAction({ orgId: clinic.orgId, confirmSlug: clinic.slug })
        setResult({ name: r.name, subscriptionCanceled: r.subscriptionCanceled })
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  function finish() {
    onClose()
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-2 sm:px-4">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {result ? 'Clinic deleted' : `Delete ${clinic.displayName ?? clinic.name}?`}
          </h2>
          {!result && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This permanently deletes the clinic org, its members, patients, appointments,
              invoices, intake forms + submissions, conversations, and everything else
              scoped to <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">{clinic.slug}</code>.
              This can&rsquo;t be undone.
            </p>
          )}
        </div>

        {result ? (
          <div className="px-6 py-5">
            <p className="text-2xl mb-2">🗑️</p>
            <p className="text-sm text-gray-800 dark:text-gray-100">
              <strong>{result.name}</strong> and all its data have been removed.
            </p>
            {result.subscriptionCanceled && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Stripe subscription was canceled.
              </p>
            )}
            <div className="mt-5 flex justify-end">
              <ActionButton variant="primary" size="sm" onClick={finish}>
                Done
              </ActionButton>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 py-5 space-y-3">
              {hasActiveSub && (
                <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                  This clinic has an active Stripe subscription. We&rsquo;ll cancel it before
                  deleting the org. If the cancel call fails, the DB delete still proceeds —
                  you may need to clean up the stale subscription in Stripe manually.
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Type the clinic slug{' '}
                <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded font-mono">
                  {clinic.slug}
                </code>{' '}
                to confirm.
              </p>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={clinic.slug}
                autoFocus
                className="form-input w-full text-sm font-mono"
              />
              {error && <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700/60 flex justify-end gap-2">
              <ActionButton variant="secondary" size="sm" onClick={onClose} disabled={pending}>
                Cancel
              </ActionButton>
              <ActionButton variant="danger" size="sm" onClick={submit} disabled={pending || !matches}>
                {pending ? 'Deleting…' : 'Delete forever'}
              </ActionButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ViewAsButton({ orgId }: { orgId: string }) {
  const [pending, start] = useTransition()
  return (
    <ActionButton
      variant="primary"
      size="sm"
      disabled={pending}
      onClick={() => start(() => enterDemoMode({ orgId, role: 'owner' }))}
      title="Drop into this clinic's dashboard as their owner"
    >
      {pending ? 'Switching…' : 'View as'}
    </ActionButton>
  )
}

function SeedDemoClinicButton() {
  const [pending, start] = useTransition()
  return (
    <ActionButton
      variant="primary"
      size="sm"
      disabled={pending}
      onClick={() => start(() => seedAndEnterDemoClinic('owner'))}
    >
      {pending ? 'Seeding…' : 'Create demo clinic & view'}
    </ActionButton>
  )
}
