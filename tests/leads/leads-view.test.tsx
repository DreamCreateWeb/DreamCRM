import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(default)/leads/lead-drawer', () => ({
  default: ({ row }: { row: { name: string } }) => (
    <div data-testid="lead-drawer-stub">drawer:{row.name}</div>
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

  it('tones the status pills per the contract — Contacted is sky (ball is theirs), not amber', () => {
    // Tone remap: new=violet (special), contacted=sky (info — amber would
    // imply WE still owe action), converted=emerald (ok), archived=gray.
    const rows = [
      makeRow({ id: 'l1', name: 'New Person', status: 'new' }),
      makeRow({ id: 'l2', name: 'Contacted Person', status: 'contacted' }),
      makeRow({ id: 'l3', name: 'Converted Person', status: 'converted' }),
      makeRow({ id: 'l4', name: 'Archived Person', status: 'archived' }),
    ]
    render(<LeadsView rows={rows} counts={{ ...baseCounts, total: 4 }} status="all" search="" />)
    const pillFor = (name: string) =>
      // the row's status pill sits right after the patient name in the header row
      screen.getByText(name).parentElement!.querySelector('span.rounded-full') as HTMLElement
    expect(pillFor('Contacted Person').className).toContain('text-sky-700')
    expect(pillFor('Contacted Person').className).not.toContain('amber')
    expect(pillFor('New Person').className).toContain('text-violet-700')
    expect(pillFor('Converted Person').className).toContain('text-emerald-700')
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
