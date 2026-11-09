import Link from 'next/link'
import { US_TIMEZONES, resolveClinicTimeZone } from '@/lib/clinic-timezone'
import { PMS_ANSWER_CHOICES } from '@/lib/onboarding/pms-answer'
import { formatPhone } from '@/lib/phone'
import type { PmsConnectRequestView } from '@/lib/services/pms-connect'

export interface SetupCallProfile {
  timezone: string | null
  phone: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  npi: string | null
  brandColor: string | null
  pmsAnswer: string | null
}

const SETTINGS_DOOR = '/settings/clinic'

/**
 * "Setup call" — what the call captured, field by field, each with its door
 * into the clinic's own settings (open the clinic in View-as to use them).
 * A field the call did not learn says so and offers the same door.
 */
export default function SetupCallCard({
  profile,
  pmsRequest,
}: {
  profile: SetupCallProfile | null
  pmsRequest: PmsConnectRequestView | null
}) {
  const p = profile
  const address = [p?.addressLine1, [p?.city, p?.state].filter(Boolean).join(', '), p?.postalCode]
    .filter(Boolean)
    .join(' · ')
  const tz = p?.timezone ? (US_TIMEZONES.find((z) => z.id === p.timezone)?.label ?? p.timezone) : null
  const pms = pmsRequest
    ? `${pmsRequest.vendorName ?? PMS_ANSWER_CHOICES.find((c) => c.id === pmsRequest.vendor)?.label ?? pmsRequest.vendor} — request ${pmsRequest.status}`
    : (PMS_ANSWER_CHOICES.find((c) => c.id === p?.pmsAnswer)?.label ?? null)
  const rows: Array<{ label: string; value: string | null; href: string }> = [
    { label: 'Time zone', value: tz ?? `${resolveClinicTimeZone(null)} (default)`, href: SETTINGS_DOOR },
    { label: 'Address', value: address || null, href: SETTINGS_DOOR },
    { label: 'Phone', value: p?.phone ? formatPhone(p.phone) : null, href: SETTINGS_DOOR },
    { label: 'Practice NPI', value: p?.npi ?? null, href: SETTINGS_DOOR },
    { label: 'Brand colour', value: p?.brandColor ?? null, href: SETTINGS_DOOR },
    { label: 'Practice software', value: pms, href: '/integrations/pms' },
  ]
  return (
    <div className="v2-card p-6 mb-6">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Setup call</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">What the call captured. Anything blank is still theirs to fill in.</p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-gray-500 dark:text-gray-400">{r.label}</dt>
            <dd className="text-right text-gray-800 dark:text-gray-100">
              {r.value ?? <span className="text-gray-500 dark:text-gray-400">Not captured</span>}{' '}
              <Link href={r.href} className="text-xs text-teal-700 dark:text-teal-400 hover:underline">
                {r.value ? 'Edit' : 'Add'}
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
