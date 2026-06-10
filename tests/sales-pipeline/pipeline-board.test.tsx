import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PipelineProject } from '@/lib/services/projects'

vi.mock('../../app/(default)/ecommerce/orders/pipeline-actions', () => ({
  moveProjectStage: vi.fn(),
  deletePipelineProject: vi.fn(),
  createPipelineProject: vi.fn(),
}))

import PipelineBoard from '@/app/(default)/ecommerce/orders/pipeline-board'

function project(overrides: Partial<PipelineProject> = {}): PipelineProject {
  return {
    id: overrides.id ?? 'p_x',
    title: 'Site refresh',
    description: null,
    type: 'website',
    status: 'lead',
    budgetCents: 250_000,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    organizationId: 'org_x',
    clinicName: 'X Clinic',
    clinicSlug: 'x',
    ownerUserId: null,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-05-10'),
    ...overrides,
  }
}

describe('PipelineBoard', () => {
  it('shows an empty state when there are no projects at all', () => {
    render(<PipelineBoard projects={[]} />)
    expect(screen.getByText(/No projects in the pipeline yet/i)).toBeInTheDocument()
  })

  it('renders project titles across the kanban columns', () => {
    render(
      <PipelineBoard
        projects={[
          project({ id: 'a', status: 'lead', title: 'Lead Project' }),
          project({ id: 'b', status: 'in_progress', title: 'Building it' }),
          project({ id: 'c', status: 'completed', title: 'Shipped it' }),
        ]}
      />,
    )
    expect(screen.getByText('Lead Project')).toBeInTheDocument()
    expect(screen.getByText('Building it')).toBeInTheDocument()
    expect(screen.getByText('Shipped it')).toBeInTheDocument()
    // Each card has a stage select pre-set to its status
    expect((screen.getByLabelText('Stage for Lead Project') as HTMLSelectElement).value).toBe('lead')
    expect((screen.getByLabelText('Stage for Building it') as HTMLSelectElement).value).toBe('in_progress')
    expect((screen.getByLabelText('Stage for Shipped it') as HTMLSelectElement).value).toBe('completed')
  })

  it('hides on-hold/cancelled in the side rail until toggled', async () => {
    const user = userEvent.setup()
    render(
      <PipelineBoard
        projects={[
          project({ id: 'a', status: 'lead', title: 'Main One' }),
          project({ id: 'b', status: 'on_hold', title: 'Paused One' }),
        ]}
      />,
    )
    expect(screen.queryByText('Paused One')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /On hold & cancelled/i }))
    expect(screen.getByText('Paused One')).toBeInTheDocument()
  })

  it('filters by project type when a type chip is clicked', async () => {
    const user = userEvent.setup()
    render(
      <PipelineBoard
        projects={[
          project({ id: 'a', type: 'website', title: 'Web Build' }),
          project({ id: 'b', type: 'videography', title: 'Video Shoot' }),
        ]}
      />,
    )
    // FilterChip hides the emoji from the accessible name (aria-hidden) and
    // renders the count in a trailing span → name is "Videography <count>".
    await user.click(screen.getByRole('button', { name: /^Videography\b/ }))
    expect(screen.queryByText('Web Build')).not.toBeInTheDocument()
    expect(screen.getByText('Video Shoot')).toBeInTheDocument()
  })

  it('filters by clinic via the clinic dropdown', async () => {
    const user = userEvent.setup()
    render(
      <PipelineBoard
        projects={[
          project({ id: 'a', organizationId: 'org_a', clinicName: 'Acme', title: 'Acme Site' }),
          project({ id: 'b', organizationId: 'org_b', clinicName: 'Bright', title: 'Bright Video' }),
        ]}
      />,
    )
    await user.selectOptions(screen.getByLabelText('Filter by clinic'), 'org_b')
    expect(screen.queryByText('Acme Site')).not.toBeInTheDocument()
    expect(screen.getByText('Bright Video')).toBeInTheDocument()
  })

  it('searches by title, clinic name, and description', async () => {
    const user = userEvent.setup()
    render(
      <PipelineBoard
        projects={[
          project({ id: 'a', title: 'Hero shoot', description: null }),
          project({ id: 'b', title: 'Brand refresh', description: 'New colors and logo' }),
        ]}
      />,
    )
    const search = screen.getByPlaceholderText(/Search title, clinic, notes/i)
    await user.type(search, 'colors')
    expect(screen.queryByText('Hero shoot')).not.toBeInTheDocument()
    expect(screen.getByText('Brand refresh')).toBeInTheDocument()
  })

  it('shows an overdue pill on cards past their due date that are still open', () => {
    render(
      <PipelineBoard
        projects={[
          project({
            id: 'late',
            status: 'in_progress',
            title: 'Late one',
            dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          }),
        ]}
      />,
    )
    expect(screen.getByText(/Overdue/)).toBeInTheDocument()
  })

  it("does not show overdue for completed projects even if dueDate is in the past", () => {
    render(
      <PipelineBoard
        projects={[
          project({
            id: 'done',
            status: 'completed',
            title: 'Shipped late',
            dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          }),
        ]}
      />,
    )
    expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument()
  })

  it('links clinic name on each card to the clinic detail page', () => {
    render(
      <PipelineBoard
        projects={[project({ organizationId: 'org_xyz', clinicName: 'Linked Clinic' })]}
      />,
    )
    // "Linked Clinic" appears in both the filter <option> and the card <a>.
    // Find the one inside an anchor.
    const matches = screen.getAllByText('Linked Clinic')
    const link = matches.map((el) => el.closest('a')).find((a) => a !== null)
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe('/ecommerce/customers/org_xyz')
  })

  it('renders "No clinic linked" when the project is unassigned', () => {
    render(
      <PipelineBoard
        projects={[project({ organizationId: null, clinicName: null })]}
      />,
    )
    expect(screen.getByText(/No clinic linked/i)).toBeInTheDocument()
  })

  it('renders the column total budget when projects have budgets', () => {
    render(
      <PipelineBoard
        projects={[
          project({ id: 'a', status: 'lead', budgetCents: 150_000 }),
          project({ id: 'b', status: 'lead', budgetCents: 100_000 }),
        ]}
      />,
    )
    // 150k + 100k = 250k = $2.5k (using formatMoneyShort which renders < $10k as plain $)
    expect(screen.getAllByText(/\$2,500/).length).toBeGreaterThan(0)
  })

  it('exposes a per-card stage select labeled with the project title', () => {
    render(<PipelineBoard projects={[project({ title: 'Site refresh', status: 'lead' })]} />)
    const select = screen.getByLabelText('Stage for Site refresh') as HTMLSelectElement
    expect(select.value).toBe('lead')
  })
})
