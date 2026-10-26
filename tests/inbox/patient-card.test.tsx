import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PatientCard from '@/app/(double-sidebar)/inbox/components/patient-card'
import { inboxTerminology } from '@/lib/inbox-terminology'
import type { InboxPatientContext } from '@/lib/types/patient-context'

/**
 * The Gmail inbox's patient card — "the record is right here". Its View
 * button sent a clinic to /ecommerce/customers?email=…, which 308s to the
 * whole patient list and drops the email; Book went to a bare /appointments
 * with no drawer and no patient. The card holds the full patient row, so
 * both doors now use its id (dead-control-deeplinks: assert the href).
 */
function ctx(over: Partial<InboxPatientContext['patient']> = {}): InboxPatientContext {
  return {
    patient: {
      id: 'pat_42',
      firstName: 'Mia',
      lastName: 'Hayes',
      email: 'mia@example.com',
      phone: '555-0100',
      dateOfBirth: '1990-04-15',
      insuranceProvider: 'Delta Dental',
      notes: null,
      ...over,
    } as unknown as InboxPatientContext['patient'],
    nextAppointment: null,
    lastAppointment: null,
    appointmentCount: 3,
  }
}

describe('PatientCard doors', () => {
  it('a clinic’s View opens the patient record and Book opens the drawer with the patient picked', () => {
    render(<PatientCard ctx={ctx()} terminology={inboxTerminology('clinic')} />)
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/patients/pat_42')
    expect(screen.getByRole('link', { name: 'Book appointment' })).toHaveAttribute('href', '/appointments?new=1&patient=pat_42')
    expect(document.querySelector('a[href^="/ecommerce/customers"]')).toBeNull()
  })

  it('the platform tenant keeps its customers path (the clinical doors do not apply to B2B)', () => {
    render(<PatientCard ctx={ctx()} terminology={inboxTerminology('platform')} />)
    expect(screen.getByRole('link', { name: 'View client' })).toHaveAttribute('href', '/ecommerce/customers?email=mia%40example.com')
    expect(screen.queryByRole('link', { name: 'Book appointment' })).toBeNull()
  })
})
