'use client'

import Link from 'next/link'
import { IntroShell, TurnOnButton, AskManager } from '@/components/feature-switch/feature-intro'
import { StatusPill } from '@/components/ui/status-pill'
import { FEATURE_BY_KEY } from '@/lib/feature-switches'

const def = FEATURE_BY_KEY.growth

/**
 * The facts the recall engine needs, each with its door. A fact is a
 * sentence and a pill — never a fake zero dressed as data: an unreadable
 * count says so.
 */
export default function GrowthIntroCard({
  orgName,
  canManage,
  patientCount,
  google,
  dueReachable,
  marketable,
}: {
  orgName: string
  canManage: boolean
  /** null = the count could not be read just now (never shown as zero). */
  patientCount: number | null
  /** 'unreadable' = the connection could not be read just now (never shown as "not connected"). */
  google: { name: string } | null | 'unreadable'
  dueReachable: number | null
  marketable: number | null
}) {
  const hasPatients = patientCount != null && patientCount > 0
  const patientsUnreadable = patientCount == null
  const googleUnreadable = google === 'unreadable'
  const gbp = googleUnreadable ? null : google
  return (
    <IntroShell eyebrow={`Growth · ${orgName}`} title={def.label} lede={def.lede} does={def.does} know={def.know} feature="growth" testId="growth-intro">
      <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">What the first win needs</p>
      <ul className="mt-2 space-y-2.5" data-testid="growth-facts">
        <li className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill
            tone={patientsUnreadable ? 'neutral' : hasPatients ? 'ok' : 'warn'}
            label={patientsUnreadable ? 'Couldn’t count patients just now' : hasPatients ? 'Patients loaded' : 'No patients yet'}
          />
          <span className="text-gray-700 dark:text-gray-200">
            {hasPatients ? (
              <>
                <span className="font-mono-num tabular-nums font-semibold">{(patientCount ?? 0).toLocaleString()}</span> on file
                {marketable != null && (
                  <>
                    , <span className="font-mono-num tabular-nums font-semibold">{marketable.toLocaleString()}</span> reachable by email
                  </>
                )}
                .
              </>
            ) : (
              <>
                Recall needs patients.{' '}
                <Link href="/integrations/pms" className="text-teal-700 dark:text-teal-400 hover:underline">
                  Connect your practice software
                </Link>{' '}
                or{' '}
                <Link href="/patients" className="text-teal-700 dark:text-teal-400 hover:underline">
                  import a CSV
                </Link>
                .
              </>
            )}
          </span>
        </li>
        <li className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill
            tone={googleUnreadable ? 'neutral' : gbp ? 'ok' : 'warn'}
            label={googleUnreadable ? 'Couldn’t read Google just now' : gbp ? 'Google connected' : 'Google not connected'}
          />
          <span className="text-gray-700 dark:text-gray-200">
            {gbp ? (
              <>Reviews and local search read from {gbp.name}.</>
            ) : (
              <>
                Reviews and local search need your Google Business Profile.{' '}
                <Link href="/integrations" className="text-teal-700 dark:text-teal-400 hover:underline">
                  Connect Google
                </Link>
                .
              </>
            )}
          </span>
        </li>
        {hasPatients && (
          <li className="flex flex-wrap items-center gap-2 text-sm" data-testid="growth-due">
            <StatusPill tone={dueReachable == null ? 'neutral' : dueReachable > 0 ? 'info' : 'neutral'} label="Overdue for a cleaning" />
            <span className="text-gray-700 dark:text-gray-200">
              {dueReachable == null ? (
                'Couldn’t count them just now.'
              ) : (
                <>
                  <span className="font-mono-num tabular-nums font-semibold">{dueReachable.toLocaleString()}</span> due and reachable — the first invitation would go to them, after your yes.
                </>
              )}
            </span>
          </li>
        )}
      </ul>

      {canManage ? <TurnOnButton feature="growth" label={def.label} /> : <AskManager />}
    </IntroShell>
  )
}
