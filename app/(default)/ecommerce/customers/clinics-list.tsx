'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import type { ClinicListRow } from '@/lib/services/clinics'
import { enterDemoMode, seedAndEnterDemoClinic } from './admin-actions'

interface Props {
  rows: ClinicListRow[]
}

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

const PLAN_BADGES: Record<ClinicListRow['planTier'], string> = {
  basic: 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
  pro: 'bg-sky-500/20 text-sky-700 dark:text-sky-400',
  premium: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',
}

const PLAN_LABELS: Record<ClinicListRow['planTier'], string> = {
  basic: 'Basic',
  pro: 'Pro',
  premium: 'Premium',
}

const STATUS_BADGES: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  trialing: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  past_due: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  unpaid: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  canceled: 'bg-red-500/20 text-red-700 dark:text-red-400',
  incomplete: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  incomplete_expired: 'bg-red-500/20 text-red-700 dark:text-red-400',
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
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            All <span className="ml-1 text-xs opacity-70">({counts.all})</span>
          </FilterChip>
          <FilterChip active={filter === 'basic'} onClick={() => setFilter('basic')}>
            Basic <span className="ml-1 text-xs opacity-70">({counts.basic})</span>
          </FilterChip>
          <FilterChip active={filter === 'pro'} onClick={() => setFilter('pro')}>
            Pro <span className="ml-1 text-xs opacity-70">({counts.pro})</span>
          </FilterChip>
          <FilterChip active={filter === 'premium'} onClick={() => setFilter('premium')}>
            Premium <span className="ml-1 text-xs opacity-70">({counts.premium})</span>
          </FilterChip>
          <FilterChip active={filter === 'past_due'} onClick={() => setFilter('past_due')}>
            Past due <span className="ml-1 text-xs opacity-70">({counts.past_due})</span>
          </FilterChip>
          <FilterChip active={filter === 'inactive'} onClick={() => setFilter('inactive')}>
            Inactive <span className="ml-1 text-xs opacity-70">({counts.inactive})</span>
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
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-500 dark:text-gray-400">
                    {rows.length === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-3xl">🏢</p>
                        <p>No clinics signed up yet — your first one will appear here after onboarding.</p>
                        <p className="text-xs">
                          Want to preview the clinic dashboard right now? Seed a demo clinic and jump straight in.
                        </p>
                        <SeedDemoClinicButton />
                      </div>
                    ) : (
                      <>No clinics match your filter.</>
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
        <p className="text-xs text-gray-500 dark:text-gray-400 text-right">
          Showing {filtered.length} of {rows.length}
        </p>
      )}
    </div>
  )
}

function ClinicRow({ clinic: c }: { clinic: ClinicListRow }) {
  const siteUrl = `https://${c.slug}.${SITE_DOMAIN}`
  const statusKey = c.subscriptionStatus ?? 'inactive'
  const statusBadge = STATUS_BADGES[statusKey] ?? 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300'
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
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_BADGES[c.planTier]}`}>
          {PLAN_LABELS[c.planTier]}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge}`}>
          {statusKey.replace('_', ' ')}
        </span>
      </td>
      <td className="px-3 py-3 text-right font-medium text-gray-800 dark:text-gray-100">
        {moneyShort(c.monthlyContributionCents)}
      </td>
      <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-200">
        {c.patientCount}
      </td>
      <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-200">
        {c.activeProjectCount}
      </td>
      <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
        {c.createdAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-3 text-xs font-medium">
          <ViewAsButton orgId={c.orgId} />
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
          >
            Site ↗
          </a>
          <Link
            href={`/ecommerce/customers/${c.orgId}`}
            className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
          >
            Open
          </Link>
        </div>
      </td>
    </tr>
  )
}

function ViewAsButton({ orgId }: { orgId: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => enterDemoMode({ orgId, role: 'owner' }))}
      className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50"
      title="Drop into this clinic's dashboard as their owner"
    >
      {pending ? 'Switching…' : 'View as'}
    </button>
  )
}

function SeedDemoClinicButton() {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => seedAndEnterDemoClinic('owner'))}
      className="btn-sm bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
    >
      {pending ? 'Seeding…' : 'Create demo clinic & view'}
    </button>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm font-medium px-3 py-1.5 rounded-full transition ${
        active
          ? 'bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-800'
          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}
