import { formatShortDate, formatTime, cn } from '@/lib/utils'
import { patientAge, type InboxPatientContext } from '@/lib/types/patient-context'
import type { InboxTerminology } from '@/lib/inbox-terminology'
import { ActionButton } from '@/components/ui/action-button'

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
    <aside className="v2-card p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-semibold text-sm shrink-0">
          {initials.toUpperCase()}
        </div>
        <div className="min-w-0 grow">
          <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {patient.firstName} {patient.lastName}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
            {isClinical && age !== null && <span className="tabular-nums">{age}y</span>}
            {patient.phone && (
              <>
                {isClinical && age !== null && <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>}
                <a href={`tel:${patient.phone}`} className="hover:text-gray-700 dark:hover:text-gray-200">
                  {patient.phone}
                </a>
              </>
            )}
            {isClinical && (
              <span className="ml-auto rounded-full bg-gray-100 dark:bg-gray-700/50 px-1.5 py-0.5 text-xs tabular-nums">
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
                <span className="text-gray-800 dark:text-gray-200">
                  {formatShortDate(nextAppointment.startTime)} · {formatTime(nextAppointment.startTime)}
                  <span className="text-gray-500 dark:text-gray-400 ml-1">({nextAppointment.type})</span>
                </span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">none scheduled</span>
              )}
            </Row>
            <Row label="Last visit">
              {lastAppointment && new Date(lastAppointment.startTime) < new Date() ? (
                <span className="text-gray-700 dark:text-gray-300">
                  {formatShortDate(lastAppointment.startTime)}
                  <span className="text-gray-500 dark:text-gray-400 ml-1">({lastAppointment.type})</span>
                </span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">no past visits</span>
              )}
            </Row>
            {patient.insuranceProvider && (
              <Row label="Insurance">
                <span className="text-gray-700 dark:text-gray-300 truncate">{patient.insuranceProvider}</span>
              </Row>
            )}
          </>
        )}
        {!isClinical && patient.email && (
          <Row label="Email">
            <a href={`mailto:${patient.email}`} className="text-gray-700 dark:text-gray-300 truncate hover:text-gray-900 dark:hover:text-gray-100">
              {patient.email}
            </a>
          </Row>
        )}
        {patient.notes && (
          <div className="mt-3 pt-3 border-t border-gray-200/60 dark:border-gray-700/40">
            <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Notes</div>
            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">{patient.notes}</p>
          </div>
        )}
      </div>

      {/* Primary action first (Book / View the record); the secondary View is
          ghost so it doesn't compete. */}
      <div className="mt-4 flex items-center gap-2">
        {isClinical ? (
          <ActionButton variant="primary" size="sm" href="/appointments" className="flex-1 justify-center">
            Book appointment
          </ActionButton>
        ) : (
          <ActionButton
            variant="primary"
            size="sm"
            href={`/ecommerce/customers?email=${encodeURIComponent(patient.email ?? '')}`}
            className="flex-1 justify-center"
          >
            View {terminology.contact}
          </ActionButton>
        )}
        {isClinical && (
          <ActionButton
            variant="secondary"
            size="sm"
            href={`/ecommerce/customers?email=${encodeURIComponent(patient.email ?? '')}`}
          >
            View
          </ActionButton>
        )}
      </div>
    </aside>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 w-16 shrink-0">{label}</div>
      <div className={cn('grow min-w-0 truncate')}>{children}</div>
    </div>
  )
}
