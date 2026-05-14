export const PLAN_COLORS: Record<string, string> = {
  basic: '#10b981',
  pro: '#0ea5e9',
  premium: '#8b5cf6',
}

export function planBadge(plan: string | null) {
  const p = plan ?? 'none'
  const cls: Record<string, string> = {
    basic: 'bg-emerald-100 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-400',
    pro: 'bg-sky-100 dark:bg-sky-400/20 text-sky-700 dark:text-sky-400',
    premium: 'bg-violet-100 dark:bg-violet-400/20 text-violet-700 dark:text-violet-400',
    none: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${cls[p] ?? cls.none}`}>
      {p === 'none' ? 'No Plan' : p}
    </span>
  )
}

export function statusBadge(status: string | null) {
  const s = status ?? 'none'
  const cls: Record<string, string> = {
    active: 'bg-emerald-100 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-400',
    trialing: 'bg-sky-100 dark:bg-sky-400/20 text-sky-700 dark:text-sky-400',
    past_due: 'bg-amber-100 dark:bg-amber-400/20 text-amber-700 dark:text-amber-400',
    canceled: 'bg-red-100 dark:bg-red-400/20 text-red-600 dark:text-red-400',
    unpaid: 'bg-red-100 dark:bg-red-400/20 text-red-600 dark:text-red-400',
    none: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
  }
  const label = s === 'none' ? 'No Subscription' : s.replace('_', ' ')
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls[s] ?? cls.none}`}>
      {label}
    </span>
  )
}

export function invoiceStatusBadge(status: string) {
  const cls: Record<string, string> = {
    paid: 'bg-emerald-100 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-400',
    open: 'bg-sky-100 dark:bg-sky-400/20 text-sky-700 dark:text-sky-400',
    void: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
    uncollectible: 'bg-red-100 dark:bg-red-400/20 text-red-600 dark:text-red-400',
    draft: 'bg-gray-100 dark:bg-gray-700 text-gray-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${cls[status] ?? cls.draft}`}>
      {status}
    </span>
  )
}

export function fmt$$(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)
}

export function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
