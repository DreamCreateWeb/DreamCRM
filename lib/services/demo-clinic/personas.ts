import 'server-only'
import { phoneNumber, pick } from './helpers'

// THE 15 PEOPLE. The name/city/insurer pools and the personas every other
// seeded artifact is anchored to by identity (see the demo-org data rules in
// CLAUDE.md) — never by positional index.

export const FIRST_NAMES = [
  'Olivia',
  'Liam',
  'Emma',
  'Noah',
  'Ava',
  'Ethan',
  'Sophia',
  'Mason',
  'Isabella',
  'James',
  'Mia',
  'Lucas',
  'Charlotte',
  'Aiden',
  'Amelia',
]
export const LAST_NAMES = [
  'Anderson',
  'Brooks',
  'Carter',
  'Diaz',
  'Evans',
  'Fischer',
  'Garza',
  'Hayes',
  'Iverson',
  'Johnson',
  'Kim',
  'Lopez',
  'Mitchell',
  'Nguyen',
  'Owens',
]
const STREETS = ['Maple St', 'Oak Ave', 'Cedar Ln', 'Elm Rd', 'Pine Blvd']
export const CITIES = [
  { city: 'Austin', state: 'TX', zip: '78701' },
  { city: 'Dallas', state: 'TX', zip: '75201' },
  { city: 'Houston', state: 'TX', zip: '77001' },
]
export const APPT_TYPES = [
  'checkup',
  'cleaning',
  'filling',
  'extraction',
  'root_canal',
  'consultation',
] as const

interface PatientPersona {
  firstName: string
  lastName: string
  dateOfBirth: string
  email: string | null
  phone: string | null
  addressLine1: string
  city: string
  state: string
  postalCode: string
  insuranceProvider: string | null
  insurancePolicyNumber: string | null
  notes: string | null
  isActive: number
  source: string | null
  lifecycle: string
  firstSeenAt: Date
  lastActivityAt: Date | null
}

// Builds a curated set of 15 patients with deterministic glyph + lifecycle
// coverage for the demo. Each index has a meaning — see callers.
export function buildPatientPersonas(now: Date): PatientPersona[] {
  const dayMs = 24 * 60 * 60 * 1000
  const austin = CITIES[0]
  function persona(
    firstName: string,
    lastName: string,
    dateOfBirth: string,
    extras: Partial<PatientPersona>,
  ): PatientPersona {
    return {
      firstName,
      lastName,
      dateOfBirth,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone: phoneNumber(),
      addressLine1: `${100 + Math.floor(Math.random() * 900)} ${pick(STREETS)}`,
      city: austin.city,
      state: austin.state,
      postalCode: austin.zip,
      insuranceProvider: 'Delta Dental',
      insurancePolicyNumber: `POL-${Math.floor(Math.random() * 9_000_000) + 1_000_000}`,
      notes: null,
      isActive: 1,
      source: 'manual',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 365 * dayMs),
      lastActivityAt: new Date(now.getTime() - 30 * dayMs),
      ...extras,
    }
  }
  // Build a birthday string that falls within the next 6 days for the
  // birthday-this-week glyph. Year is held fixed at 1992 so the rest of
  // the date math doesn't drift.
  const bdayDate = new Date(now.getTime() + 3 * dayMs)
  const bday = `1992-${String(bdayDate.getMonth() + 1).padStart(2, '0')}-${String(bdayDate.getDate()).padStart(2, '0')}`

  return [
    // [0] Happy-path active patient
    persona('Mia', 'Hayes', '1988-03-12', {
      source: 'referral',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 800 * dayMs),
      lastActivityAt: new Date(now.getTime() - 7 * dayMs),
      notes: 'Prefers morning appointments.',
    }),
    // [1] New patient (★) + missing intake before future visit (📝!)
    persona('Liam', 'Brooks', '1995-08-22', {
      source: 'booking',
      lifecycle: 'new',
      firstSeenAt: new Date(now.getTime() - 9 * dayMs),
      lastActivityAt: new Date(now.getTime() - 9 * dayMs),
    }),
    // [2] Birthday this week (🎂)
    persona('Charlotte', 'Diaz', bday, {
      source: 'referral',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 450 * dayMs),
    }),
    // [3] Outstanding overdue balance ($)
    persona('Marcus', 'Johnson', '1979-11-05', {
      source: 'manual',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 600 * dayMs),
      notes: 'Insurance pre-auth is a pain — call ahead next time.',
    }),
    // [4] Confirmed next-24h appointment (puts them on Today's chair)
    persona('Sophia', 'Iverson', '1991-02-14', {
      source: 'booking',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 200 * dayMs),
    }),
    // [5] Lapsed (💤) — ~20 months since last visit (past the 18mo default)
    persona('Aiden', 'Kim', '1965-06-30', {
      source: 'referral',
      lifecycle: 'lapsed',
      firstSeenAt: new Date(now.getTime() - 1500 * dayMs),
      lastActivityAt: new Date(now.getTime() - 600 * dayMs),
    }),
    // [6] At-risk — 7 months since last visit
    persona('Emma', 'Lopez', '1983-12-01', {
      source: 'walk_in',
      lifecycle: 'at_risk',
      firstSeenAt: new Date(now.getTime() - 720 * dayMs),
      lastActivityAt: new Date(now.getTime() - 210 * dayMs),
    }),
    // [7] Has relationship notes + intake on file
    persona('Noah', 'Mitchell', '1972-04-18', {
      source: 'referral',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 900 * dayMs),
      lastActivityAt: new Date(now.getTime() - 14 * dayMs),
      notes: 'Anxious patient — see relationship notes.',
    }),
    // [8..13] Filler active patients
    persona('Olivia', 'Anderson', '1990-09-09', { source: 'booking' }),
    persona('Ethan', 'Carter', '1985-07-25', { source: 'referral' }),
    persona('Isabella', 'Evans', '1978-10-11', { source: 'manual' }),
    persona('Mason', 'Garza', '1996-01-30', { source: 'lead_form', lifecycle: 'lead' }),
    persona('Ava', 'Fischer', '1982-05-19', { source: 'booking' }),
    persona('James', 'Owens', '1969-08-08', { source: 'invite' }),
    // [14] Archived (filter-only)
    persona('Lucas', 'Nguyen', '1955-03-03', {
      isActive: 0,
      lifecycle: 'archived',
      lastActivityAt: new Date(now.getTime() - 700 * dayMs),
    }),
  ]
}
