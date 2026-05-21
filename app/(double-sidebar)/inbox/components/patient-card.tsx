import Link from 'next/link'
import { formatShortDate, formatTime, cn } from '@/lib/utils'
import { patientAge, type InboxPatientContext } from '@/lib/types/patient-context'
import type { InboxTerminology } from '@/lib/inbox-terminology'

interface Props {
  ctx: InboxPatientContext
  terminology: InboxTerminology
}

/**
 * Contact context card — surfaces the matched contact's record next to the
 * email so the user has full context without context-switching to the CRM.
 *
 * Adapts to tenant type:
 * - Clinic tenants see appointment / visit / insurance fields ("patient" lingo)
 * - Platform tenant sees just name + phone + notes ("client" lingo) since
 *   the clinical fields don't apply to B2B
 *
 * Stays compact (~250-300px tall) and visually distinct from the email body
 * so it reads as ambient context rather than content.
 */
export default function PatientCard({ ctx, terminology }: Props) {
  const { patient, nextAppointment, lastAppointment, appointmentCount } = ctx
  const age = patientAge(patient.dateOfBirth)
  const initials = (patient.firstName[0] ?? '?') + (patient.lastName[0] ?? '')
  const isClinical = terminology.isClinical

  return (
    <aside className="rounded-xl border border-stone-200 dark:border-stone-700/60 bg-gradient-to-b from-stone-50/80 to-white dark:from-stone-800/40 dark:to-stone-900/40 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-semibold text-sm shrink-0">
          {initials.toUpperCase()}
        </div>
        <div className="min-w-0 grow">
          <div className="font-semibold text-stone-900 dark:text-stone-100 truncate">
            {patient.firstName} {patient.lastName}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5 flex-wrap">
            {isClinical && age !== null && <span>{age}y</span>}
            {patient.phone && (
              <>
                {isClinical && age !== null && <span className="text-stone-300 dark:text-stone-600">·</span>}
                <a href={`tel:${patient.phone}`} className="hover:text-stone-700 dark:hover:text-stone-200">
                  {patient.phone}
                </a>
              </>
            )}
            {isClinical && (
              <span className="ml-auto rounded-full bg-stone-100 dark:bg-stone-700/50 px-1.5 py-0.5 text-[10px] tabular-nums">
                {appointmentCount} visit{appointmentCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2 text-[12px]">
        {isClinical && (
          <>
            <Row label="Next visit">
              {nextAppointment ? (
                <span className="text-stone-800 dark:text-stone-200">
                  {formatShortDate(nextAppointment.startTime)} · {formatTime(nextAppointment.startTime)}
                  <span className="text-stone-500 dark:text-stone-400 ml-1">({nextAppointment.type})</span>
                </span>
              ) : (
                <span className="text-stone-400 dark:text-stone-500">none scheduled</span>
              )}
            </Row>
            <Row label="Last visit">
              {lastAppointment && new Date(lastAppointment.startTime) < new Date() ? (
                <span className="text-stone-700 dark:text-stone-300">
                  {formatShortDate(lastAppointment.startTime)}
                  <span className="text-stone-500 dark:text-stone-400 ml-1">({lastAppointment.type})</span>
                </span>
              ) : (
                <span className="text-stone-400 dark:text-stone-500">no past visits</span>
              )}
            </Row>
            {patient.insuranceProvider && (
              <Row label="Insurance">
                <span className="text-stone-700 dark:text-stone-300 truncate">{patient.insuranceProvider}</span>
              </Row>
            )}
          </>
        )}
        {!isClinical && patient.email && (
          <Row label="Email">
            <a href={`mailto:${patient.email}`} className="text-stone-700 dark:text-stone-300 truncate hover:text-stone-900 dark:hover:text-stone-100">
              {patient.email}
            </a>
          </Row>
        )}
        {patient.notes && (
          <div className="mt-3 pt-3 border-t border-stone-200/60 dark:border-stone-700/40">
            <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-1">Notes</div>
            <p className="text-[12px] text-stone-700 dark:text-stone-300 line-clamp-3">{patient.notes}</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {isClinical ? (
          <Link
            href="/appointments"
            className="flex-1 text-center text-[12px] font-medium rounded-md bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white px-2.5 py-1.5 transition-colors"
          >
            Book appointment
          </Link>
        ) : (
          <Link
            href={`/ecommerce/customers?email=${encodeURIComponent(patient.email ?? '')}`}
            className="flex-1 text-center text-[12px] font-medium rounded-md bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white px-2.5 py-1.5 transition-colors"
          >
            View {terminology.contact}
          </Link>
        )}
        {isClinical && (
          <Link
            href={`/ecommerce/customers?email=${encodeURIComponent(patient.email ?? '')}`}
            className="text-[12px] font-medium rounded-md border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 px-2.5 py-1.5 transition-colors"
          >
            View
          </Link>
        )}
      </div>
    </aside>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-500 w-16 shrink-0">{label}</div>
      <div className={cn('grow min-w-0 truncate')}>{children}</div>
    </div>
  )
}
