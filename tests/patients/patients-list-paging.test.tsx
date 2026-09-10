/**
 * PatientsList — the page bound, on the screen.
 *
 * The roster is loaded a page at a time now, so the list has to say two things
 * honestly: the header count is the whole FILTERED set (a clinic with 4,213
 * patients must not read "100 patients" because that is how many fit on a
 * page), and the footer says which slice of it is showing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(default)/patients/actions', () => ({
  bulkInvitePatientsToPortalAction: vi.fn(),
  bulkAssignPatientTagAction: vi.fn(),
  bulkSendPayLinksAction: vi.fn(),
}))
vi.mock('@/app/(default)/patients/bulk-message-modal', () => ({ default: () => null }))
vi.mock('@/app/(default)/patients/add-patient-modal', () => ({ default: () => null }))
vi.mock('@/app/(default)/patients/import-patients-modal', () => ({ default: () => null }))
vi.mock('@/app/(default)/patients/saved-views-bar', () => ({ default: () => null }))

import PatientsList from '@/app/(default)/patients/patients-list'
import type {
  PatientListRow,
  PatientListFilters,
  PatientListSort,
  PatientFilterMeta,
} from '@/lib/services/patients'
import { DEFAULT_PATIENT_LIMIT, MAX_PATIENT_LIMIT } from '@/lib/types/patient-views'

const filters: PatientListFilters = { status: 'all' }
const sort: PatientListSort = { field: 'name', direction: 'asc' }
const meta: PatientFilterMeta = { sources: [], tags: [] }

function row(i: number): PatientListRow {
  return {
    id: `pat_${i}`,
    firstName: 'Mia',
    lastName: `Hayes${i}`,
    fullName: `Mia Hayes${i}`,
    email: null,
    phone: null,
    dateOfBirth: null,
    ageYears: null,
    source: 'booking',
    lifecycle: 'active',
    firstSeenAt: null,
    lastVisitAt: null,
    nextVisitAt: null,
    nextVisitType: null,
    recallStatus: 'na',
    outstandingBalanceCents: null,
    balanceAsOf: null,
    shopSpendCents: 0,
    lastContactAt: null,
    flags: {
      newPatient: false,
      birthdayThisWeek: false,
      hasOutstandingBalance: false,
      missingIntakeBeforeAppt: false,
      unconfirmedNext48h: false,
      lapsed: false,
      optedOut: false,
    },
    tags: [],
  }
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i))

function renderList(over: { rows?: PatientListRow[]; total: number; hasMore?: boolean; limit?: number }) {
  return render(
    <PatientsList
      rows={over.rows ?? rows(Math.min(over.total, over.limit ?? DEFAULT_PATIENT_LIMIT))}
      total={over.total}
      hasMore={over.hasMore ?? false}
      limit={over.limit ?? DEFAULT_PATIENT_LIMIT}
      meta={meta}
      filters={filters}
      sort={sort}
      orgName="Dream Dental"
    />,
  )
}

beforeEach(() => pushMock.mockClear())

describe('PatientsList — the page bound', () => {
  it('counts the whole filtered set in the header, not the page', () => {
    renderList({ total: 4213, hasMore: true })
    expect(screen.getByText('4213 patients')).toBeInTheDocument()
  })

  it('says which slice is showing when there is more behind it', () => {
    renderList({ total: 4213, hasMore: true })
    expect(screen.getByText('Showing 100 of 4213 patients.')).toBeInTheDocument()
  })

  it('says nothing at all when the page IS the whole set', () => {
    renderList({ total: 7, hasMore: false })
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show more patients/ })).not.toBeInTheDocument()
  })

  it('walks the bound up a page at a time through the URL', async () => {
    renderList({ total: 4213, hasMore: true })
    await userEvent.click(screen.getByRole('button', { name: 'Show more patients' }))
    expect(pushMock).toHaveBeenCalledWith(`/patients?show=${DEFAULT_PATIENT_LIMIT * 2}`)
  })

  it('stops at the ceiling and points at a filter instead of a longer page', () => {
    renderList({
      rows: rows(MAX_PATIENT_LIMIT),
      total: 12_000,
      hasMore: true,
      limit: MAX_PATIENT_LIMIT,
    })
    expect(screen.queryByRole('button', { name: /Show more patients/ })).not.toBeInTheDocument()
    expect(screen.getByText(/narrow it with a filter or search/)).toBeInTheDocument()
  })

  it('leaves the empty state alone — no page footer on nothing', () => {
    renderList({ rows: [], total: 0 })
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })
})
