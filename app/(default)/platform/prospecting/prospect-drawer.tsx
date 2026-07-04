import Link from 'next/link'
import type { ProspectDetail } from '@/lib/services/prospecting'
import {
  PROSPECT_STATUS_LABELS,
  SCORE_BAND_LABELS,
  INTENT_SIGNAL_LABELS,
  ratingLabel,
  type ProspectAiVerdict,
  type ProspectCrawlSignals,
} from '@/lib/types/prospecting'
import { StatusPill } from '@/components/ui/status-pill'
import DrawerActions from './drawer-actions'
import ContactsPanel from './contacts-panel'

/**
 * Server-rendered prospect drawer — opens via ?prospect=<id> so it deep-links
 * and needs zero client state. Enrichment, verdict, score reasons, outreach
 * history, call log, and the action strip.
 */

const ROW = 'flex items-start justify-between gap-3 py-1.5 text-sm'
const KEY = 'text-gray-500 dark:text-gray-400 shrink-0'
const VAL = 'text-gray-900 dark:text-gray-100 text-right'
const SECTION = 'mt-5'
const SECTION_TITLE =
  'text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2'

function yesNo(v: boolean): string {
  return v ? 'Yes' : 'No'
}

export default function ProspectDrawer({
  detail,
  closeHref,
}: {
  detail: ProspectDetail
  closeHref: string
}) {
  const p = detail.prospect
  const signals = (p.enrichment ?? null) as ProspectCrawlSignals | null
  const verdict = (p.aiVerdict ?? null) as ProspectAiVerdict | null

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-white dark:bg-gray-800 shadow-2xl border-l border-[color:var(--color-hairline)] overflow-y-auto">
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{p.name}</h2>
            <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {[p.addressLine1, p.city, p.state, p.postalCode].filter(Boolean).join(', ')}
            </div>
          </div>
          <Link
            href={closeHref}
            scroll={false}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill
            tone={p.status === 'call_list' ? 'special' : p.status === 'converted' ? 'ok' : 'info'}
            label={PROSPECT_STATUS_LABELS[p.status as keyof typeof PROSPECT_STATUS_LABELS] ?? p.status}
          />
          {p.scoreBand && (
            <StatusPill
              tone={p.scoreBand === 'hot' ? 'urgent' : p.scoreBand === 'warm' ? 'warn' : 'neutral'}
              label={`${SCORE_BAND_LABELS[p.scoreBand as keyof typeof SCORE_BAND_LABELS]} · ${p.opportunityScore}`}
              title="Opportunity score — how much this practice needs what we sell"
            />
          )}
          {p.intentSignal && (
            <StatusPill
              tone="special"
              label={
                INTENT_SIGNAL_LABELS[p.intentSignal as keyof typeof INTENT_SIGNAL_LABELS] ??
                p.intentSignal
              }
            />
          )}
        </div>

        {/* Contact */}
        <div className={SECTION}>
          <div className={SECTION_TITLE}>Contact</div>
          <div className={ROW}>
            <span className={KEY}>Owner / official</span>
            <span className={VAL}>
              {p.authorizedOfficialName ?? '—'}
              {p.authorizedOfficialTitle ? ` (${p.authorizedOfficialTitle.toLowerCase()})` : ''}
            </span>
          </div>
          <div className={ROW}>
            <span className={KEY}>Phone</span>
            <span className={`${VAL} tabular-nums`}>
              {p.phone ? `(${p.phone.slice(0, 3)}) ${p.phone.slice(3, 6)}-${p.phone.slice(6)}` : '—'}
            </span>
          </div>
          <div className={ROW}>
            <span className={KEY}>NPI</span>
            <span className={`${VAL} tabular-nums`}>{p.npiNumber ?? '—'}</span>
          </div>
        </div>

        {/* Reachability — every discovered/entered address, ranked + verified */}
        <div className={SECTION}>
          <ContactsPanel prospectId={p.id} contacts={detail.contacts} />
        </div>

        {/* Online presence */}
        <div className={SECTION}>
          <div className={SECTION_TITLE}>Online presence</div>
          <div className={ROW}>
            <span className={KEY}>Website</span>
            <span className={VAL}>
              {p.websiteUrl ? (
                <a
                  href={p.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-600 dark:text-teal-400 hover:underline break-all"
                >
                  {p.websiteUrl.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              ) : p.enrichedAt ? (
                <StatusPill tone="urgent" label="None found" />
              ) : (
                'not checked yet'
              )}
            </span>
          </div>
          <div className={ROW}>
            <span className={KEY}>Google</span>
            <span className={`${VAL} tabular-nums`}>
              {ratingLabel(p.googleRatingTenths, p.reviewCount) ?? '—'}
              {p.googleMapsUri && (
                <a
                  href={p.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-teal-600 dark:text-teal-400 hover:underline"
                >
                  map
                </a>
              )}
            </span>
          </div>
          {signals && (
            <>
              <div className={ROW}>
                <span className={KEY}>HTTPS / mobile-ready</span>
                <span className={VAL}>
                  {yesNo(signals.ssl)} / {yesNo(signals.mobileViewport)}
                </span>
              </div>
              <div className={ROW}>
                <span className={KEY}>Online booking</span>
                <span className={VAL}>{yesNo(signals.bookingWidget)}</span>
              </div>
              <div className={ROW}>
                <span className={KEY}>Footer copyright</span>
                <span className={VAL}>{signals.copyrightYear ?? '—'}</span>
              </div>
              <div className={ROW}>
                <span className={KEY}>Site builder</span>
                <span className={VAL}>{signals.builder ?? 'custom / unknown'}</span>
              </div>
              <div className={ROW}>
                <span className={KEY}>Social linked</span>
                <span className={VAL}>
                  {Object.entries(signals.socialLinks)
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                    .join(', ') || 'none'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Why this score */}
        {verdict && p.scoreReasons != null && (
          <div className={SECTION}>
            <div className={SECTION_TITLE}>Why this score</div>
            <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              {(p.scoreReasons as string[]).map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  {r}
                </li>
              ))}
            </ul>
            {verdict.summary && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{verdict.summary}</p>
            )}
          </div>
        )}

        {/* Intent */}
        {p.intentSummary && (
          <div className={SECTION}>
            <div className={SECTION_TITLE}>What they said</div>
            <p className="text-sm text-gray-700 dark:text-gray-300">{p.intentSummary}</p>
            {Array.isArray(p.talkingPoints) && (p.talkingPoints as string[]).length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                {(p.talkingPoints as string[]).map((t) => (
                  <li key={t} className="flex gap-2">
                    <span aria-hidden="true">→</span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Outreach history */}
        {detail.touches.length > 0 && (
          <div className={SECTION}>
            <div className={SECTION_TITLE}>Outreach history</div>
            <ul className="space-y-2">
              {detail.touches.map((t) => (
                <li key={t.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <StatusPill
                      tone={t.channel === 'dry_run' ? 'neutral' : t.status === 'sent' ? 'ok' : 'urgent'}
                      label={t.channel === 'dry_run' ? 'Dry run' : t.status}
                    />
                    <span className="text-gray-900 dark:text-gray-100">Touch {t.stepNumber}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.subject}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Call log */}
        {detail.calls.length > 0 && (
          <div className={SECTION}>
            <div className={SECTION_TITLE}>Call log</div>
            <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
              {detail.calls.map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.outcome.replace(/_/g, ' ')}</span>
                  {c.note && <span className="text-gray-500 dark:text-gray-400"> — {c.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DrawerActions
          prospectId={p.id}
          status={p.status}
          hasEmail={Boolean(p.email)}
        />
      </div>
    </aside>
  )
}
