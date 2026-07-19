/**
 * PatientsList — the 12-week heartbeat sparkline (law 7).
 *
 * Mirrors tests/leads/leads-view.test.tsx's heartbeat block: renders with a
 * signal-bearing series, stays hidden with no series / a single blip, and is
 * decorative (aria-hidden svg; the adjacent text label carries the meaning).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
import type { PatientListFilters, PatientListSort, PatientFilterMeta } from '@/lib/services/patients'

const filters: PatientListFilters = { status: 'all' }
const sort: PatientListSort = { field: 'name', direction: 'asc' }
const meta: PatientFilterMeta = { sources: [], tags: [] }

// 12 buckets, oldest first — mirrors getNewPatientsPerWeek12's shape.
const series = (values: number[]) =>
  values.map((v, i) => ({ bucket: `Wk ${i + 1}`, value: v }))

function renderList(perWeek12?: Array<{ bucket: string; value: number }>) {
  return render(
    <PatientsList
      rows={[]}
      meta={meta}
      filters={filters}
      sort={sort}
      orgName="Dream Dental"
      perWeek12={perWeek12}
    />,
  )
}

describe('PatientsList — 12-week heartbeat sparkline (law 7)', () => {
  it('renders the sparkline with its label when the series carries signal', () => {
    const { container } = renderList(series([0, 1, 0, 2, 0, 0, 3, 0, 0, 1, 0, 2]))
    expect(screen.getByText('New patients · 12 weeks')).toBeInTheDocument()
    // Decorative: the svg is wrapped in aria-hidden; the adjacent text label
    // carries the meaning.
    const spark = container.querySelector('[aria-hidden="true"] svg')
    expect(spark).not.toBeNull()
    expect(spark!.querySelectorAll('circle')).toHaveLength(12)
  })

  it('stays hidden without the series or with fewer than 2 nonzero weeks', () => {
    // No prop at all (default []) — nothing renders.
    const { container, rerender } = render(
      <PatientsList rows={[]} meta={meta} filters={filters} sort={sort} orgName="Dream Dental" />,
    )
    expect(screen.queryByText('New patients · 12 weeks')).not.toBeInTheDocument()
    // A single blip is not a trend — still hidden.
    rerender(
      <PatientsList
        rows={[]}
        meta={meta}
        filters={filters}
        sort={sort}
        orgName="Dream Dental"
        perWeek12={series([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4])}
      />,
    )
    expect(screen.queryByText('New patients · 12 weeks')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"] svg')).toBeNull()
  })
})
