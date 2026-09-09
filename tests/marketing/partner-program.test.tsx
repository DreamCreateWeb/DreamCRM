import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// House chain mock. submitPartnerApplication's select order: platform org →
// owner member → existing lead (by email) → [insert or update] → platform
// admins (for the courtesy alert).
const state: {
  selectQueue: unknown[][]
  inserts: unknown[]
  updates: unknown[]
} = { selectQueue: [], inserts: [], updates: [] }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: async (v: unknown) => void state.inserts.push(v) }),
      update: () => ({ set: (v: unknown) => ({ where: async () => void state.updates.push(v) }) }),
    },
    schema,
  }
})

const { deliverMock } = vi.hoisted(() => ({ deliverMock: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({
  deliver: deliverMock,
  authEmailShell: (o: { heading: string }) => `<html>${o.heading}</html>`,
}))

import { submitPartnerApplication, PARTNER_LEAD_SOURCE } from '@/lib/services/partner-applications'
import PartnerProgramPage from '@/app/(marketing)/partner-program/page'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  vi.clearAllMocks()
})

const PLATFORM = [{ id: 'org_platform' }]
const OWNER = [{ userId: 'user_owner' }]

describe('submitPartnerApplication', () => {
  it('files a fresh application as a lead in the platform pipeline + alerts an admin', async () => {
    state.selectQueue.push(PLATFORM, OWNER, [], [{ email: 'dustin@dreamcreateweb.com' }])
    const res = await submitPartnerApplication({
      name: 'Casey Consultant',
      email: 'Casey@CoachingCo.com',
      company: 'CoachingCo',
      message: 'I coach 30 practices in Texas',
    })
    expect(res.ok).toBe(true)
    expect(state.inserts[0]).toMatchObject({
      organizationId: 'org_platform',
      ownerId: 'user_owner',
      name: 'Casey Consultant',
      email: 'casey@coachingco.com', // normalized
      pipelineStage: 'new',
      leadSource: PARTNER_LEAD_SOURCE,
    })
    expect(String((state.inserts[0] as { notes: string }).notes)).toContain('CoachingCo')
    expect(deliverMock).toHaveBeenCalledOnce()
  })

  it('a re-apply refreshes the existing row instead of minting a duplicate', async () => {
    state.selectQueue.push(PLATFORM, OWNER, [{ id: 7, notes: 'old notes' }], [])
    const res = await submitPartnerApplication({ name: 'Casey', email: 'casey@coachingco.com', message: 'now 40 practices' })
    expect(res.ok).toBe(true)
    expect(state.inserts).toHaveLength(0)
    expect(String((state.updates[0] as { notes: string }).notes)).toContain('old notes')
    expect(String((state.updates[0] as { notes: string }).notes)).toContain('40 practices')
  })

  it('junk input is refused before any lookup', async () => {
    expect((await submitPartnerApplication({ name: '', email: 'x@y.com' })).ok).toBe(false)
    expect((await submitPartnerApplication({ name: 'A', email: 'not-an-email' })).ok).toBe(false)
    expect(state.inserts).toHaveLength(0)
  })

  it('a mail hiccup never fails the applicant — the pipeline row is the record', async () => {
    state.selectQueue.push(PLATFORM, OWNER, [], [{ email: 'dustin@dreamcreateweb.com' }])
    deliverMock.mockRejectedValueOnce(new Error('smtp down'))
    const res = await submitPartnerApplication({ name: 'Casey', email: 'casey@coachingco.com' })
    expect(res.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
  })
})

describe('the /partner-program page', () => {
  it('pitches the REAL terms and renders the application form', () => {
    render(<PartnerProgramPage />)
    // The numbers on the page are the schema's defaults: 10%, $25 floor.
    expect(screen.getAllByText(/10% of every payment/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/\$25/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/recurring, month after month/i)).toBeInTheDocument()
    expect(screen.getByText('Apply to the partner program')).toBeInTheDocument()
    // The FAQ's exact-terms hedge — rates are per-agreement, never promised.
    expect(screen.getByText(/written into your partner agreement/i)).toBeInTheDocument()
  })

  it('/partner-program is a public marketing path', () => {
    expect(MARKETING_PUBLIC_PATHS).toContain('/partner-program')
  })
})
