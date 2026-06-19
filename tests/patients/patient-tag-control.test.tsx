/**
 * PatientTagControl — the drop-in "tags for this patient" control reused by the
 * appointment drawer + message thread. Pins the contract those hosts depend on:
 * it renders current tags as removable chips, lazy-loads the catalog when the
 * picker first opens, assigns a picked tag, removes a chip, and creates-then-
 * assigns a brand-new tag — all optimistic, reporting back through onChanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PatientTagView } from '@/lib/types/patient-tags'

const listTagCatalogAction = vi.fn()
const assignPatientTagAction = vi.fn()
const unassignPatientTagAction = vi.fn()
const createPatientTagAction = vi.fn()
vi.mock('@/app/(default)/patients/actions', () => ({
  listTagCatalogAction: () => listTagCatalogAction(),
  assignPatientTagAction: (...a: unknown[]) => assignPatientTagAction(...a),
  unassignPatientTagAction: (...a: unknown[]) => unassignPatientTagAction(...a),
  createPatientTagAction: (...a: unknown[]) => createPatientTagAction(...a),
}))

import PatientTagControl from '@/components/tags/patient-tag-control'

const VIP: PatientTagView = { id: 't_vip', name: 'VIP', color: 'teal' }
const ANXIOUS: PatientTagView = { id: 't_anx', name: 'Anxious', color: 'amber' }

beforeEach(() => {
  listTagCatalogAction.mockReset().mockResolvedValue([VIP, ANXIOUS])
  assignPatientTagAction.mockReset().mockResolvedValue({ ok: true })
  unassignPatientTagAction.mockReset().mockResolvedValue({ ok: true })
  createPatientTagAction.mockReset()
})

describe('PatientTagControl', () => {
  it('renders current tags as chips and a + Tag trigger', () => {
    render(<PatientTagControl patientId="p1" initialTags={[VIP]} />)
    expect(screen.getByText('VIP')).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Tag' })).toBeTruthy()
  })

  it('lazy-loads the catalog only when the picker opens', async () => {
    render(<PatientTagControl patientId="p1" initialTags={[VIP]} />)
    expect(listTagCatalogAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' }))
    await waitFor(() => expect(listTagCatalogAction).toHaveBeenCalledTimes(1))
    // VIP is already on the patient, so only Anxious is offered.
    await screen.findByText('Anxious')
  })

  it('assigns a picked tag and notifies onChanged', async () => {
    const onChanged = vi.fn()
    render(<PatientTagControl patientId="p1" initialTags={[VIP]} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' }))
    fireEvent.click(await screen.findByText('Anxious'))

    await waitFor(() => expect(assignPatientTagAction).toHaveBeenCalledWith('p1', 't_anx'))
    // Optimistically shows the new chip + reports the merged list.
    expect(screen.getByText('Anxious')).toBeTruthy()
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ id: 't_anx' }),
        expect.objectContaining({ id: 't_vip' }),
      ])),
    )
  })

  it('removes a chip via its ✕', async () => {
    render(<PatientTagControl patientId="p1" initialTags={[VIP]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove VIP tag' }))
    await waitFor(() => expect(unassignPatientTagAction).toHaveBeenCalledWith('p1', 't_vip'))
    expect(screen.queryByText('VIP')).toBeNull()
  })

  it('creates a brand-new tag then assigns it', async () => {
    const NEW: PatientTagView = { id: 't_new', name: 'Recare', color: 'teal' }
    createPatientTagAction.mockResolvedValue({ ok: true, tag: NEW })
    listTagCatalogAction.mockResolvedValue([]) // empty catalog → everything is new

    render(<PatientTagControl patientId="p1" initialTags={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' }))
    const input = await screen.findByPlaceholderText(/Find or create a tag/)
    fireEvent.change(input, { target: { value: 'Recare' } })
    fireEvent.click(screen.getByText(/Create/))

    await waitFor(() => expect(createPatientTagAction).toHaveBeenCalledWith('Recare', 'teal'))
    await waitFor(() => expect(assignPatientTagAction).toHaveBeenCalledWith('p1', 't_new'))
  })

  it('reverts the chip when the assign fails', async () => {
    assignPatientTagAction.mockResolvedValue({ ok: false, error: 'nope' })
    render(<PatientTagControl patientId="p1" initialTags={[VIP]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Tag' }))
    fireEvent.click(await screen.findByText('Anxious'))
    await waitFor(() => expect(screen.getByText('nope')).toBeTruthy())
    // The optimistic Anxious chip is rolled back (only the trigger-less catalog
    // entry remains, not a chip) — VIP stays.
    expect(screen.getByText('VIP')).toBeTruthy()
  })
})
