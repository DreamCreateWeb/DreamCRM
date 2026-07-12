import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Server-action plan gates: a below-tier clinic must NOT be able to fire a
 * premium module's action even by deep-linking the page. We mock requireTenant
 * to drive the tier, and stub the underlying services so we can assert they're
 * only reached when the gate passes.
 */
type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  planTier: 'basic' | 'pro' | 'premium'
  organizationId: string
  userId: string
  organizationName: string
}
let tenantCtx: Ctx | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { createJob, connectOpenDental, runImport } = vi.hoisted(() => ({
  createJob: vi.fn().mockResolvedValue({ id: 'job_1' }),
  connectOpenDental: vi.fn().mockResolvedValue({ practiceTitle: 'Acme' }),
  runImport: vi.fn().mockResolvedValue({ status: 'success' }),
}))
vi.mock('@/lib/services/careers', () => ({
  createJob,
  updateJob: vi.fn(),
  setJobStatus: vi.fn(),
  deleteJob: vi.fn(),
  setApplicationStatus: vi.fn(),
  updateApplicationNotes: vi.fn(),
}))

vi.mock('@/lib/services/pms', () => ({
  connectOpenDental,
  disconnectPms: vi.fn(),
  runImport,
  setAutoSync: vi.fn(),
  setSyncDirection: vi.fn(),
}))

import { createJobAction } from '@/app/(default)/website/careers/actions'
import { connectOpenDentalAction, syncNowAction } from '@/app/(default)/integrations/actions'

beforeEach(() => {
  createJob.mockClear()
  connectOpenDental.mockClear()
  runImport.mockClear()
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'premium',
    organizationId: 'org_1',
    userId: 'u1',
    organizationName: 'Acme Dental',
  }
})

function jobForm(): FormData {
  const fd = new FormData()
  fd.set('title', 'Dental Hygienist')
  fd.set('role', 'hygienist')
  fd.set('employmentType', 'full_time')
  fd.set('description', 'Join us')
  fd.set('status', 'draft')
  return fd
}

describe('careers action — premium gate', () => {
  it('runs createJob for a premium clinic', async () => {
    await createJobAction(jobForm()) // redirect is mocked to a no-op
    expect(createJob).toHaveBeenCalledTimes(1)
  })

  it('rejects a basic clinic before touching createJob', async () => {
    tenantCtx!.planTier = 'basic'
    await expect(createJobAction(jobForm())).rejects.toThrow(/Premium plan/i)
    expect(createJob).not.toHaveBeenCalled()
  })

  it('rejects a pro clinic (careers is premium)', async () => {
    tenantCtx!.planTier = 'pro'
    await expect(createJobAction(jobForm())).rejects.toThrow(/Premium plan/i)
    expect(createJob).not.toHaveBeenCalled()
  })
})

describe('integrations action — premium gate', () => {
  it('runs connectOpenDental for a premium clinic', async () => {
    const fd = new FormData()
    fd.set('customerKey', 'KEY123')
    const res = await connectOpenDentalAction(fd)
    expect(res.ok).toBe(true)
    expect(connectOpenDental).toHaveBeenCalledTimes(1)
  })

  it('rejects a basic clinic before touching the PMS service (sync now)', async () => {
    tenantCtx!.planTier = 'basic'
    await expect(syncNowAction()).rejects.toThrow(/Premium plan/i)
    expect(runImport).not.toHaveBeenCalled()
  })

  it('rejects a pro clinic from connecting', async () => {
    tenantCtx!.planTier = 'pro'
    const fd = new FormData()
    fd.set('customerKey', 'KEY123')
    await expect(connectOpenDentalAction(fd)).rejects.toThrow(/Premium plan/i)
    expect(connectOpenDental).not.toHaveBeenCalled()
  })
})
