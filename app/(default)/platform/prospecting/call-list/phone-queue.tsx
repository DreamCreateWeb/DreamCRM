import Link from 'next/link'
import type { PhoneQueueRow } from '@/lib/services/prospecting'
import { ratingLabel } from '@/lib/types/prospecting'
import { StatusPill } from '@/components/ui/status-pill'
import { prospectInitials } from '@/lib/prospect-when'

/**
 * The phone queue — high-value prospects with no deliverable email (the
 * no-website hottest segment can't be emailed at all). Instead of rotting in
 * the browse list they surface here as a call-first list with the reasons
 * they scored and a one-tap dial. Opening the row deep-links the drawer where
 * you can log the call or add an email you found.
 */
export default function PhoneQueue({ rows }: { rows: PhoneQueueRow[] }) {
  if (rows.length === 0) return null
  return (
    <section className="mt-10">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          📵 Phone-first queue
        </span>
        <span className="rounded-full bg-[color:var(--color-surface-sunk)] px-2 py-0.5 font-mono-num text-xs font-bold text-gray-500 dark:text-gray-400">
          {rows.length}
        </span>
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Hot prospects we can&apos;t email — no website, or no address that accepts mail. These are your best cold
        calls: they need exactly what we sell and nobody else is reaching them.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="v2-card p-4 flex flex-wrap items-start justify-between gap-3"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-xs font-bold text-white ${
                  r.scoreBand === 'hot' ? 'bg-rose-500' : 'bg-amber-500'
                }`}
                aria-hidden="true"
              >
                {prospectInitials(r.name)}
              </span>
              <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/platform/prospecting?prospect=${r.id}`}
                  className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400"
                >
                  {r.name}
                </Link>
                {r.scoreBand && (
                  <StatusPill
                    tone={r.scoreBand === 'hot' ? 'urgent' : 'warn'}
                    label={`${r.scoreBand === 'hot' ? 'Hot' : 'Warm'} · ${r.opportunityScore ?? ''}`}
                  />
                )}
                {!r.websiteUrl && <StatusPill tone="special" label="No website" />}
              </div>
              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {[r.authorizedOfficialName, [r.city, r.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                {ratingLabel(r.googleRatingTenths, r.reviewCount)
                  ? ` · ${ratingLabel(r.googleRatingTenths, r.reviewCount)}`
                  : ''}
              </div>
              {r.reasons.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.reasons.map((reason, i) => (
                    <li
                      key={i}
                      className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300"
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </div>
            {r.phone && (
              <a
                href={`tel:${r.phone}`}
                className="shrink-0 rounded-[var(--r-xs)] bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
              >
                📞 ({r.phone.slice(0, 3)}) {r.phone.slice(3, 6)}-{r.phone.slice(6)}
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
