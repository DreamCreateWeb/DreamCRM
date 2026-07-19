import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
const { bulkLeadMock } = vi.hoisted(() => ({
  bulkLeadMock: vi.fn(async () => ({ ok: true, updated: 2 })),
}))
vi.mock('@/app/(default)/leads/actions', () => ({
  bulkSetLeadStatusAction: bulkLeadMock,
}))
vi.mock('@/app/(default)/leads/lead-drawer', () => ({
  default: ({
    row,
    onStatusChange,
  }: {
    row: { id: string; name: string }
    onStatusChange: (id: string, next: string, action: () => Promise<unknown>) => void
  }) => (
    <div data-testid="lead-drawer-stub">
      drawer:{row.name}
      {/* A never-resolving action keeps the transition pending so the optimistic
          flip persists for assertion. */}
      <button onClick={() => onStatusChange(row.id, 'contacted', () => new Promise(() => {}))}>
        stub-contacted
      </button>
    </div>
  ),
}))

import LeadsView from '@/app/(default)/leads/leads-view'
import type { LeadRow, LeadCounts } from '@/lib/services/leads'

function makeRow(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'lead_1',
    name: 'Olivia Chen',
    email: 'olivia@example.com',
    phone: '(415) 555-0188',
    preferredDate: null,
    message: 'Looking for a family dentist.',
    sourcePage: '/',
    referrer: 'https://www.google.com/',
    utmSource: 'google',
    utmMedium: 'organic',
    utmCampaign: null,
    status: 'new',
    convertedToPatientId: null,
    convertedPatientName: null,
    contactedAt: null,
    convertedAt: null,
    archivedAt: null,
    archivedReason: null,
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
    ageHours: 0,
    ...overrides,
  }
}

const baseCounts: LeadCounts = { new: 0, contacted: 0, converted: 0, archived: 0, total: 0 }

describe('LeadsView — list + filters + drawer trigger', () => {
  it('renders the contextual empty-state copy per status', () => {
    const { rerender } = render(<LeadsView rows={[]} counts={baseCounts} status="new" search="" />)
    expect(screen.getByText(/No new leads right now/)).toBeInTheDocument()
    rerender(<LeadsView rows={[]} counts={baseCounts} status="contacted" search="" />)
    expect(screen.getByText(/No leads in the "contacted" queue/)).toBeInTheDocument()
    rerender(<LeadsView rows={[]} counts={baseCounts} status="converted" search="" />)
    expect(screen.getByText(/No conversions yet/)).toBeInTheDocument()
    rerender(<LeadsView rows={[]} counts={baseCounts} status="archived" search="" />)
    expect(screen.getByText(/Archive is empty/)).toBeInTheDocument()
  })

  it('renders the count badges on the status filter chips', () => {
    const counts: LeadCounts = { new: 3, contacted: 1, converted: 2, archived: 1, total: 7 }
    render(<LeadsView rows={[]} counts={counts} status="new" search="" />)
    // Each chip is a button whose text combines the label + the count
    // (e.g. "Contacted1"). Look up the chip buttons by their label text
    // node and check the merged textContent on the button parent.
    const chipByLabel = (label: string) =>
      screen.getAllByRole('button').find((b) => b.textContent?.startsWith(label) && b.textContent.length <= label.length + 3)!
    expect(chipByLabel('New').textContent).toBe('New3')
    expect(chipByLabel('Contacted').textContent).toBe('Contacted1')
    expect(chipByLabel('Converted').textContent).toBe('Converted2')
    expect(chipByLabel('Archived').textContent).toBe('Archived1')
    expect(chipByLabel('All').textContent).toBe('All7')
  })

  it('renders each row with name, contact, status pill, and aging label', () => {
    const rows = [
      makeRow({ id: 'l1', name: 'Olivia Chen', status: 'new', ageHours: 0 }),
      makeRow({
        id: 'l2',
        name: 'Marcus Johnson',
        email: 'marcus.j@example.com',
        phone: '(415) 555-0156',
        status: 'contacted',
        ageHours: 36,
      }),
      makeRow({
        id: 'l3',
        name: 'Emma Lopez',
        status: 'converted',
        ageHours: 14 * 24,
        convertedToPatientId: 'pat_emma',
        convertedPatientName: 'Emma Lopez',
      }),
    ]
    render(<LeadsView rows={rows} counts={{ ...baseCounts, total: 3 }} status="all" search="" />)
    expect(screen.getByText('Olivia Chen')).toBeInTheDocument()
    expect(screen.getByText('Marcus Johnson')).toBeInTheDocument()
    expect(screen.getByText('Emma Lopez').closest('span')).toBeInTheDocument()
    // Status pills — each rendered once
    expect(screen.getAllByText('New')).toHaveLength(2) // chip + pill
    expect(screen.getAllByText('Contacted').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Converted').length).toBeGreaterThanOrEqual(2)
    // Aging labels — 'just now' for < 1h, 'Xh ago' for < 24h, 'Xd ago' otherwise
    expect(screen.getByText('just now')).toBeInTheDocument()
    expect(screen.getByText('1d ago')).toBeInTheDocument() // 36h → 1d
    expect(screen.getByText('14d ago')).toBeInTheDocument()
  })

  it('shows the "Fresh — call within the hour" badge only on brand-new leads', () => {
    const fresh = makeRow({ id: 'l1', name: 'Fresh Lead', status: 'new', ageHours: 0 })
    const aged = makeRow({ id: 'l2', name: 'Aged Lead', status: 'new', ageHours: 6 })
    render(<LeadsView rows={[fresh, aged]} counts={{ ...baseCounts, new: 2, total: 2 }} status="new" search="" />)
    const badges = screen.getAllByText(/Fresh — call within the hour/)
    expect(badges).toHaveLength(1)
  })

  it('tones the status pills per the SEMANTIC contract (asserts data-tone, not colors)', () => {
    // The meaning is the TONE, not the paint: new=special, contacted=info
    // (ball is THEIRS — `warn` would wrongly imply WE still owe action),
    // converted=ok, archived=neutral. Asserting data-tone keeps this pinned to
    // the contract even if the palette is restyled (the v2 info sky→indigo move
    // would have silently passed an old `text-sky-700` check).
    const rows = [
      makeRow({ id: 'l1', name: 'New Person', status: 'new', ageHours: 6 }),
      makeRow({ id: 'l2', name: 'Contacted Person', status: 'contacted' }),
      makeRow({ id: 'l3', name: 'Converted Person', status: 'converted' }),
      makeRow({ id: 'l4', name: 'Archived Person', status: 'archived' }),
    ]
    render(<LeadsView rows={rows} counts={{ ...baseCounts, total: 4 }} status="all" search="" />)
    // The row's STATUS pill is the first tone-bearing pill after the name.
    const toneFor = (name: string) =>
      screen.getByText(name).parentElement!.querySelector('[data-tone]')!.getAttribute('data-tone')
    expect(toneFor('Contacted Person')).toBe('info')
    expect(toneFor('Contacted Person')).not.toBe('warn') // never "we owe action"
    expect(toneFor('New Person')).toBe('special')
    expect(toneFor('Converted Person')).toBe('ok')
    expect(toneFor('Archived Person')).toBe('neutral')
  })

  it('shows a link back to the converted patient on converted rows', () => {
    const row = makeRow({
      id: 'l3',
      name: 'Emma Lopez',
      status: 'converted',
      convertedToPatientId: 'pat_emma',
      convertedPatientName: 'Emma Lopez',
    })
    render(<LeadsView rows={[row]} counts={{ ...baseCounts, converted: 1, total: 1 }} status="converted" search="" />)
    const link = screen.getByRole('link', { name: /→ Emma Lopez/ })
    expect(link).toHaveAttribute('href', '/patients/pat_emma')
  })

  it('opens the lead drawer on row click', () => {
    const row = makeRow({ name: 'Olivia Chen' })
    render(<LeadsView rows={[row]} counts={{ ...baseCounts, new: 1, total: 1 }} status="new" search="" />)
    expect(screen.queryByTestId('lead-drawer-stub')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Olivia Chen'))
    expect(screen.getByTestId('lead-drawer-stub')).toHaveTextContent('drawer:Olivia Chen')
  })

  it('optimistically drops a lead from the "new" view the instant it is marked contacted', async () => {
    const row = makeRow({ id: 'l1', name: 'Olivia Chen', status: 'new' })
    render(<LeadsView rows={[row]} counts={{ ...baseCounts, new: 1, total: 1 }} status="new" search="" />)
    fireEvent.click(screen.getByText('Olivia Chen'))
    fireEvent.click(screen.getByText('stub-contacted'))
    // The optimistic status → 'contacted' no longer matches the 'new' filter, so
    // the row (and the now-closed drawer) disappear without a server round-trip.
    await waitFor(() => expect(screen.queryByText('Olivia Chen')).not.toBeInTheDocument())
  })

  it('displays UTM campaign attribution on the row when present', () => {
    const row = makeRow({
      name: 'Rachel Williams',
      sourcePage: '/',
      utmCampaign: 'fall_recall',
    })
    render(<LeadsView rows={[row]} counts={{ ...baseCounts, new: 1, total: 1 }} status="new" search="" />)
    expect(screen.getByText('fall_recall')).toBeInTheDocument()
    expect(screen.getByText('from /')).toBeInTheDocument()
  })
})

describe('LeadsView — 14-day heartbeat sparkline (law 7)', () => {
  // 14 buckets, oldest first — mirrors getLeadsPerDay14's shape.
  const series = (values: number[]) =>
    values.map((v, i) => ({ bucket: `Jul ${i + 1}`, value: v }))

  it('renders the sparkline with its label when the series carries signal', () => {
    const { container } = render(
      <LeadsView
        rows={[]}
        counts={baseCounts}
        status="new"
        search=""
        perDay14={series([0, 1, 0, 2, 0, 0, 3, 0, 0, 0, 1, 0, 0, 2])}
      />,
    )
    expect(screen.getByText('Last 14 days')).toBeInTheDocument()
    // Decorative: the svg is wrapped in aria-hidden; the adjacent text label
    // carries the meaning.
    const spark = container.querySelector('[aria-hidden="true"] svg')
    expect(spark).not.toBeNull()
    expect(spark!.querySelectorAll('circle')).toHaveLength(14)
  })

  it('stays hidden without the series or with fewer than 2 nonzero days', () => {
    // No prop at all (default []) — nothing renders.
    const { rerender, container } = render(
      <LeadsView rows={[]} counts={baseCounts} status="new" search="" />,
    )
    expect(screen.queryByText('Last 14 days')).not.toBeInTheDocument()
    // A single blip is not a trend — still hidden.
    rerender(
      <LeadsView
        rows={[]}
        counts={baseCounts}
        status="new"
        search=""
        perDay14={series([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])}
      />,
    )
    expect(screen.queryByText('Last 14 days')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"] svg')).toBeNull()
  })
})

describe('LeadsView — bulk triage', () => {
  it('keeps the bulk bar hidden until a row is selected', () => {
    const rows = [makeRow({ id: 'l1', name: 'Olivia Chen', status: 'new' })]
    render(<LeadsView rows={rows} counts={{ ...baseCounts, new: 1, total: 1 }} status="new" search="" />)
    expect(screen.queryByRole('button', { name: 'Mark contacted' })).not.toBeInTheDocument()
  })

  it('select-all selects every visible inquiry and reveals the count', () => {
    const rows = [
      makeRow({ id: 'l1', name: 'Olivia Chen', status: 'new' }),
      makeRow({ id: 'l2', name: 'Marcus Johnson', status: 'new' }),
    ]
    render(<LeadsView rows={rows} counts={{ ...baseCounts, new: 2, total: 2 }} status="new" search="" />)
    fireEvent.click(screen.getByLabelText('Select all inquiries'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('bulk-marks the selected inquiries contacted in one pass', async () => {
    bulkLeadMock.mockClear()
    const rows = [
      makeRow({ id: 'l1', name: 'Olivia Chen', status: 'new' }),
      makeRow({ id: 'l2', name: 'Marcus Johnson', status: 'new' }),
    ]
    render(<LeadsView rows={rows} counts={{ ...baseCounts, new: 2, total: 2 }} status="new" search="" />)
    fireEvent.click(screen.getByLabelText('Select Olivia Chen'))
    fireEvent.click(screen.getByLabelText('Select Marcus Johnson'))
    fireEvent.click(screen.getByRole('button', { name: 'Mark contacted' }))
    await waitFor(() => expect(bulkLeadMock).toHaveBeenCalledWith(['l1', 'l2'], 'contacted'))
  })

  it('only acts on selections that are visible in the current filter', async () => {
    bulkLeadMock.mockClear()
    // Two 'new' rows shown; selecting all then archiving must pass only those ids.
    const rows = [
      makeRow({ id: 'l1', name: 'Olivia Chen', status: 'new' }),
      makeRow({ id: 'l2', name: 'Marcus Johnson', status: 'new' }),
    ]
    render(<LeadsView rows={rows} counts={{ ...baseCounts, new: 2, total: 2 }} status="new" search="" />)
    fireEvent.click(screen.getByLabelText('Select all inquiries'))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(bulkLeadMock).toHaveBeenCalledWith(['l1', 'l2'], 'archived'))
  })
})
