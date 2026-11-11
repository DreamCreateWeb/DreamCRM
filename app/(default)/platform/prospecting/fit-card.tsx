import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'
import {
  BUILDER_LABELS,
  FIT_SIGNAL_LABELS,
  formatUtcStamp,
  parseVerification,
  type ProspectCrawlSignals,
  type VerificationSignal,
} from '@/lib/types/prospecting'
import { fitVerdict } from '@/lib/prospect-fit'
import NotAChainButton from './not-a-chain-button'

/**
 * The drawer's Fit card (P-04) — why this practice is (or is not) one we
 * sell to: the DSO / chain name, a shared host or phone, the practice size,
 * a new practice, the competitor stack and the builder the crawl saw. Every
 * registry / listing / sweep fact carries its source and a UTC stamp; the
 * crawl facts carry the crawl's. Platform voice. A flagged row offers "Not
 * a chain" (the owner's override, stored for good).
 */

const SOURCE_LABEL: Record<string, string> = {
  dso_list: 'the DSO list',
  our_data: 'our own records',
  nppes: 'NPI registry',
  owner: 'you',
  places: 'Google Places',
}

function stamp(sig: VerificationSignal): string {
  return `${SOURCE_LABEL[sig.source] ?? sig.source} · ${formatUtcStamp(sig.checkedAt) ?? sig.checkedAt}`
}

function sizeTone(status: string): Tone {
  if (status === 'group') return 'warn'
  if (status === 'unknown') return 'neutral'
  return 'ok'
}

const SIZE_LABEL: Record<string, string> = {
  group: 'Group practice',
  small: 'Small practice',
  solo: 'Solo dentist',
  unknown: 'Size unknown',
}

export function FitCard({
  verification,
  signals,
  prospectId,
  prospectName,
  status,
  suppressedReason,
  readOnly = false,
}: {
  verification: unknown
  signals: ProspectCrawlSignals | null
  prospectId: string
  prospectName: string
  status: string
  suppressedReason: string | null
  /** A merged shell or a customer offers no override. */
  readOnly?: boolean
}) {
  const v = parseVerification(verification)
  const fit = v.fit
  const read = fitVerdict(fit)
  const flagged = read.chain || (status === 'disqualified' && suppressedReason === 'chain')
  const stack = signals?.stack
  const builder = signals?.builder ?? null
  const nothing = !fit && !signals

  return (
    <div data-fit-card>
      <div className="flex flex-wrap items-center gap-2">
        {flagged ? (
          <StatusPill tone="urgent" label="Chain — set aside" title="Chains and DSOs are targeted later with other features" />
        ) : fit?.chainOverride ? (
          <StatusPill tone="ok" label="Not a chain (by hand)" title={fit.chainOverride.detail ?? undefined} />
        ) : fit?.dso ? (
          <StatusPill tone="ok" label="Not a chain" title="No DSO name on the practice, the registry or the listing; no shared host or phone" />
        ) : (
          <StatusPill tone="neutral" label="Fit not checked yet" title="The verify pass reads the DSO list, the registry and the listing" />
        )}
        {fit?.newPractice?.status === 'new' && <StatusPill tone="special" label="New practice" title={fit.newPractice.detail ?? undefined} />}
        {fit?.size && fit.size.status !== 'unknown' && (
          <StatusPill tone={sizeTone(fit.size.status)} label={SIZE_LABEL[fit.size.status] ?? fit.size.status} title={fit.size.detail ?? undefined} />
        )}
      </div>
      {flagged && (
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300" data-fit-reason>
          {read.chain ? read.reason : "Part of a chain; we'll target chains later"}
        </p>
      )}
      {nothing && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Nothing read yet — Verify now reads the DSO list, the registry and the listing; Re-enrich reads the site.
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {fit?.dso && (
          <li className="text-sm" data-fit-signal="dso">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400">{FIT_SIGNAL_LABELS.dso}</span>
              <StatusPill
                tone={fit.dso.status === 'match' && !fit.chainOverride ? 'urgent' : 'ok'}
                label={fit.dso.status === 'match' ? (fit.dso.name ?? 'Matched') : 'None'}
              />
            </div>
            <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
              {fit.dso.detail && <span>{fit.dso.detail}</span>}
              {fit.dso.matchedOn && <span> (on the {fit.dso.matchedOn === 'npi' ? 'NPI organization name' : fit.dso.matchedOn === 'listing' ? 'Google listing name' : 'practice name'})</span>}
              <span className="block text-gray-500 dark:text-gray-400">{stamp(fit.dso)}</span>
            </div>
          </li>
        )}
        {fit?.chain && (
          <li className="text-sm" data-fit-signal="chain">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400">{FIT_SIGNAL_LABELS.chain}</span>
              <StatusPill
                tone={fit.chain.status === 'none' || fit.chainOverride ? 'ok' : 'urgent'}
                label={
                  fit.chain.status === 'shared_host'
                    ? `Same website · ${fit.chain.count ?? '?'} practices`
                    : fit.chain.status === 'shared_phone'
                      ? `Same phone · ${fit.chain.count ?? '?'} practices`
                      : 'None'
                }
              />
            </div>
            <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
              {fit.chain.detail && <span>{fit.chain.detail}</span>}
              <span className="block text-gray-500 dark:text-gray-400">{stamp(fit.chain)}</span>
            </div>
          </li>
        )}
        {fit?.size && (
          <li className="text-sm" data-fit-signal="size">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400">{FIT_SIGNAL_LABELS.size}</span>
              <StatusPill tone={sizeTone(fit.size.status)} label={SIZE_LABEL[fit.size.status] ?? fit.size.status} />
            </div>
            <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
              {fit.size.detail && <span>{fit.size.detail}</span>}
              <span className="block text-gray-500 dark:text-gray-400">{stamp(fit.size)}</span>
            </div>
          </li>
        )}
        {fit?.newPractice && (
          <li className="text-sm" data-fit-signal="newPractice">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400">{FIT_SIGNAL_LABELS.newPractice}</span>
              <StatusPill
                tone={fit.newPractice.status === 'new' ? 'special' : 'neutral'}
                label={fit.newPractice.status === 'new' ? 'New practice' : fit.newPractice.status === 'established' ? 'Established' : 'Unknown'}
              />
            </div>
            <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
              {fit.newPractice.detail && <span>{fit.newPractice.detail}</span>}
              <span className="block text-gray-500 dark:text-gray-400">{stamp(fit.newPractice)}</span>
            </div>
          </li>
        )}
        {fit?.chainOverride && (
          <li className="text-sm" data-fit-signal="chainOverride">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400">{FIT_SIGNAL_LABELS.chainOverride}</span>
              <StatusPill tone="ok" label="By hand" />
            </div>
            <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
              {fit.chainOverride.detail && <span>{fit.chainOverride.detail}</span>}
              <span className="block text-gray-500 dark:text-gray-400">{stamp(fit.chainOverride)}</span>
            </div>
          </li>
        )}
        {signals && (
          <li className="text-sm" data-fit-signal="stack">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400">Booking / review tools on the site</span>
              {Array.isArray(stack) ? (
                stack.length > 0 ? (
                  <StatusPill tone="info" label={stack.join(' · ')} title="A modern stack — they already have doors; we replace tools, not install the first" />
                ) : (
                  <StatusPill tone="warn" label="None" title="No booking widget, no review engine — a phone number is their only door" />
                )
              ) : (
                <StatusPill tone="neutral" label="Not read" title="An older crawl — Re-enrich reads the stack" />
              )}
            </div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              our crawler · {formatUtcStamp(signals.fetchedAt) ?? signals.fetchedAt}
            </div>
          </li>
        )}
        {signals && (
          <li className="text-sm" data-fit-signal="builder">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400">Site builder</span>
              <StatusPill
                tone={builder ? (builder === 'wordpress' ? 'neutral' : 'warn') : 'neutral'}
                label={builder ? (BUILDER_LABELS[builder] ?? builder) : 'Custom / unknown'}
                title={builder && builder !== 'wordpress' ? 'A DIY or template site — the website we sell replaces it' : undefined}
              />
            </div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              our crawler · {formatUtcStamp(signals.fetchedAt) ?? signals.fetchedAt}
            </div>
          </li>
        )}
      </ul>
      {flagged && !readOnly && <NotAChainButton prospectId={prospectId} prospectName={prospectName} />}
    </div>
  )
}
