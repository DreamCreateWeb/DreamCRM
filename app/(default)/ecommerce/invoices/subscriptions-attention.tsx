import Link from 'next/link'
import type { AdminSubscription, SubscriptionAttention } from '@/lib/services/stripe-admin'
import { formatMoney } from '@/lib/utils'
import { formatRelativeDate } from '@/lib/utils/format'
import { EmptyState } from '@/components/ui/empty-state'
import { type Tone } from '@/lib/ui/encodings'

interface Props {
  attention: SubscriptionAttention
}

export default function SubscriptionsAttention({ attention }: Props) {
  const { trialEndingSoon, pastDue, scheduledCancel } = attention
  const hasAny = trialEndingSoon.length || pastDue.length || scheduledCancel.length
  if (!hasAny) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-6">
        <EmptyState
          icon="✅"
          title="No subscriptions need attention"
          body="Every active customer is paid up and not scheduled to cancel."
        />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <AttentionBucket
        title="Trial ending soon"
        tone="warn"
        subs={trialEndingSoon}
        emptyMessage="No trials wrapping up."
        labelFor={(s) =>
          s.trialEnd
            ? `Ends ${formatRelativeDate(new Date(s.trialEnd * 1000))}`
            : 'Trial ending'
        }
      />
      <AttentionBucket
        title="Past due"
        tone="urgent"
        subs={pastDue}
        emptyMessage="No failed payments."
        labelFor={(s) =>
          s.currentPeriodEnd
            ? `Cycle ended ${formatRelativeDate(new Date(s.currentPeriodEnd * 1000))}`
            : 'Payment failed'
        }
      />
      <AttentionBucket
        title="Scheduled to cancel"
        tone="special"
        subs={scheduledCancel}
        emptyMessage="No churn risk flagged."
        labelFor={(s) =>
          s.currentPeriodEnd
            ? `Cancels ${formatRelativeDate(new Date(s.currentPeriodEnd * 1000))}`
            : 'Cancels at period end'
        }
      />
    </div>
  )
}

// Header accent per bucket — color paired with the title text, never alone.
const HEADER_ACCENT: Record<Tone, string> = {
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  urgent: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  special: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  neutral: 'border-gray-500/40 bg-gray-500/10 text-gray-600 dark:text-gray-300',
}

function AttentionBucket({
  title,
  tone,
  subs,
  emptyMessage,
  labelFor,
}: {
  title: string
  tone: Tone
  subs: AdminSubscription[]
  emptyMessage: string
  labelFor: (s: AdminSubscription) => string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <header className={`px-4 py-2.5 border-l-4 rounded-t-xl ${HEADER_ACCENT[tone]}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          <span className="text-xs font-medium tabular-nums">{subs.length}</span>
        </div>
      </header>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-72 overflow-y-auto">
        {subs.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">{emptyMessage}</li>
        ) : (
          subs.slice(0, 6).map((s) => (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {s.clinicOrgId ? (
                    <Link
                      href={`/ecommerce/customers/${s.clinicOrgId}`}
                      className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:text-violet-600 dark:hover:text-violet-400 truncate block"
                    >
                      {s.clinicName ?? s.customerName ?? s.customerEmail ?? '—'}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate block">
                      {s.clinicName ?? s.customerName ?? s.customerEmail ?? '—'}
                    </span>
                  )}
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {s.productName ?? '—'}
                    {s.unitAmountCents != null && (
                      <>
                        {' · '}
                        {formatMoney(s.unitAmountCents, (s.currency ?? 'USD').toUpperCase())} / {s.interval ?? 'mo'}
                      </>
                    )}
                  </div>
                </div>
                <div
                  className="text-xs text-gray-500 dark:text-gray-400 shrink-0 text-right tabular-nums"
                  suppressHydrationWarning
                >
                  {labelFor(s)}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
      {subs.length > 6 && (
        <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 text-right border-t border-gray-100 dark:border-gray-700/60 tabular-nums">
          + {subs.length - 6} more
        </div>
      )}
    </div>
  )
}
