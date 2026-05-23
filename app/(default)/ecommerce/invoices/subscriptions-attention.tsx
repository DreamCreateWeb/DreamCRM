import Link from 'next/link'
import type { AdminSubscription, SubscriptionAttention } from '@/lib/services/stripe-admin'
import { formatMoney } from '@/lib/utils'
import { formatRelativeDate } from '@/lib/utils/format'

interface Props {
  attention: SubscriptionAttention
}

export default function SubscriptionsAttention({ attention }: Props) {
  const { trialEndingSoon, pastDue, scheduledCancel } = attention
  const hasAny = trialEndingSoon.length || pastDue.length || scheduledCancel.length
  if (!hasAny) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-6 mb-6 text-sm text-gray-500 dark:text-gray-400 text-center">
        ✅ No subscriptions need attention. Every active customer is paid up and not scheduled to cancel.
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <AttentionBucket
        title="Trial ending soon"
        tone="amber"
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
        tone="red"
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
        tone="violet"
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

const TONES = {
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  red: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20',
} as const

function AttentionBucket({
  title,
  tone,
  subs,
  emptyMessage,
  labelFor,
}: {
  title: string
  tone: keyof typeof TONES
  subs: AdminSubscription[]
  emptyMessage: string
  labelFor: (s: AdminSubscription) => string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <header className={`px-4 py-2.5 border-l-4 rounded-t-xl ${TONES[tone]}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          <span className="text-xs font-medium">{subs.length}</span>
        </div>
      </header>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-72 overflow-y-auto">
        {subs.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-gray-400">{emptyMessage}</li>
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
                  className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 text-right"
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
        <div className="px-4 py-2 text-[11px] text-gray-400 text-right border-t border-gray-100 dark:border-gray-700/60">
          + {subs.length - 6} more
        </div>
      )}
    </div>
  )
}
