/**
 * /intake-forms/submissions — the cross-template submissions index (the
 * "Completed · 8 weeks" heartbeat's destination). Proves: rows render the
 * patient link (matched fills) or the submitter fallback (anonymous), the
 * template link, and a CLINIC-tz timestamp that deep-links to the
 * submission viewer; empty state when nothing has been filled; non-clinic
 * tenants bounce home.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

let ctx: Record<string, unknown>
const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`)
})

vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  redirect: (to: string) => redirectMock(to),
}))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ctx),
}))
// Pin the clinic tz so the wall-clock assertion is deterministic — the
// server runs UTC and the page must NOT render UTC times.
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

const { listRecentSubmissionsMock } = vi.hoisted(() => ({
  listRecentSubmissionsMock: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@/lib/services/forms', () => ({
  listRecentSubmissions: listRecentSubmissionsMock,
}))

import RecentSubmissionsPage from '@/app/(default)/intake-forms/submissions/page'

beforeEach(() => {
  redirectMock.mockClear()
  listRecentSubmissionsMock.mockReset()
  listRecentSubmissionsMock.mockResolvedValue([])
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationName: 'Dream Dental',
  }
})

describe('RecentSubmissionsPage', () => {
  it('renders rows with patient/template links + clinic-tz timestamps linking to the viewer', async () => {
    listRecentSubmissionsMock.mockResolvedValue([
      {
        id: 'sub_1',
        // 3:00 PM UTC = 10:00 AM Chicago (CDT) — a UTC render would say 3:00 PM.
        submittedAt: new Date('2026-07-18T15:00:00Z'),
        templateId: 'tmpl_1',
        templateTitle: 'New Patient Intake',
        patientId: 'pat_1',
        patientName: 'Jane Doe',
        submitterName: 'Jane Doe',
        submitterEmail: 'jane@example.com',
      },
      {
        id: 'sub_2',
        submittedAt: new Date('2026-07-17T15:00:00Z'),
        templateId: 'tmpl_2',
        templateTitle: 'Records Release',
        patientId: null,
        patientName: null,
        submitterName: null,
        submitterEmail: 'visitor@example.com',
      },
    ])
    const { container } = render(await RecentSubmissionsPage())
    expect(listRecentSubmissionsMock).toHaveBeenCalledWith('org_1')

    // Matched fill: patient name links to the patient record.
    const patientLink = screen.getByText('Jane Doe').closest('a')
    expect(patientLink?.getAttribute('href')).toBe('/patients/pat_1')
    // Template title links to the form builder.
    const tmplLink = screen.getByText('New Patient Intake').closest('a')
    expect(tmplLink?.getAttribute('href')).toBe('/intake-forms/tmpl_1')
    // Clinic wall-clock, not UTC — and the timestamp opens the submission.
    const tsLink = screen.getByText('Sat, Jul 18, 10:00 AM').closest('a')
    expect(tsLink?.getAttribute('href')).toBe('/intake-forms/submissions/sub_1')

    // Anonymous fill: submitter email as plain text (no patient link).
    const anon = screen.getByText('visitor@example.com')
    expect(anon.closest('a')).toBeNull()

    // Orientation: the eyebrow links back to the module home.
    expect(container.querySelector('a[href="/intake-forms"]')).toBeTruthy()
    cleanup()
  })

  it('shows the empty state when no forms have been submitted', async () => {
    render(await RecentSubmissionsPage())
    expect(screen.getByText('No submissions yet')).toBeTruthy()
    cleanup()
  })

  it('non-clinic tenants bounce home', async () => {
    ctx = { ...ctx, tenantType: 'platform' }
    await expect(RecentSubmissionsPage()).rejects.toThrow('REDIRECT:/')
    cleanup()
  })
})
