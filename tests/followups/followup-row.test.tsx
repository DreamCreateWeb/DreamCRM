/**
 * FollowupRow — the shared board/record row (ML-18). Pins: the title IS the
 * kind's door; the tick opens "How did it go?" BEFORE anything is sent, and an
 * outcome (or Skip) completes; Snooze offers presets and a date; a visible
 * Remove exists (never hover-only); the kind table's doors are in-app paths.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FollowupRow } from '@/components/followups/followup-row'
import { FOLLOWUP_KINDS, FOLLOWUP_KIND_IDS, type PatientFollowupView } from '@/lib/types/followups'

const row: PatientFollowupView = {
  id: 'pfu_1',
  patientId: 'pat_1',
  patientName: 'Maya Ortiz',
  title: 'Call Maya about her balance',
  dueDate: null,
  assignedUserId: null,
  assigneeName: null,
  status: 'open',
  createdByName: null,
  completedAt: null,
  createdAt: new Date('2026-07-10T15:00:00Z'),
  kind: 'balance',
  snoozedUntil: null,
  outcome: null,
}

function renderRow(over: Partial<React.ComponentProps<typeof FollowupRow>> = {}) {
  return render(
    <ul>
      <FollowupRow f={row} onComplete={vi.fn()} onSnooze={vi.fn()} onRemove={vi.fn()} {...over} />
    </ul>,
  )
}

describe('FollowupRow', () => {
  it('makes the title the door for its kind', () => {
    renderRow()
    const link = screen.getByRole('link', { name: 'Call Maya about her balance' })
    expect(link.getAttribute('href')).toBe('/payments?patient=pat_1')
    expect(screen.getByRole('img', { name: 'Balance' })).toBeTruthy()
  })

  it('asks how it went before completing, then completes with the outcome', () => {
    const onComplete = vi.fn()
    renderRow({ onComplete })
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(onComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Booked a visit' }))
    expect(onComplete).toHaveBeenCalledWith('booked')
  })

  it('lets the outcome be skipped', () => {
    const onComplete = vi.fn()
    renderRow({ onComplete })
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(onComplete).toHaveBeenCalledWith(null)
  })

  it('snoozes by preset', () => {
    const onSnooze = vi.fn()
    renderRow({ onSnooze })
    fireEvent.click(screen.getByRole('button', { name: 'Snooze' }))
    fireEvent.click(screen.getByRole('button', { name: 'In 3 days' }))
    expect(onSnooze).toHaveBeenCalledWith({ preset: 'three_days' })
  })

  it('shows Remove as a visible button, not a hover-only mark', () => {
    const onRemove = vi.fn()
    renderRow({ onRemove })
    const btn = screen.getByRole('button', { name: /Remove follow-up/ })
    expect(btn.className).not.toMatch(/opacity-0|group-hover/)
    fireEvent.click(btn)
    expect(onRemove).toHaveBeenCalled()
  })

  it('every kind has an in-app door', () => {
    for (const k of FOLLOWUP_KIND_IDS) {
      expect(FOLLOWUP_KINDS[k].door('pat_9')).toMatch(/^\//)
    }
  })
})
