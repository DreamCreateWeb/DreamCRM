import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Demo-seeder persona anchoring — the "phantom 5★ review" regression.
 *
 * The demo org can contain REAL patients (the owner books through the public
 * widget to test flows). The self-heal used to select ALL org patients with no
 * ORDER BY and assign seeded artifacts by positional index, so a real patient
 * could land at persona index 7 and inherit Noah's Healthgrades review. Under
 * test: (1) getPersonaAlignedPatientIds matches by persona EMAIL and never
 * includes a non-persona patient; (2) cleanupMisattributedDemoArtifacts
 * removes seeder-minted rows from non-persona patients while leaving human
 * artifacts + persona rows alone.
 */

interface DeleteCall {
  table: string
}

const state: {
  selectQueue: unknown[][]
  deletes: DeleteCall[]
  updates: Array<{ table: string; set: unknown }>
} = { selectQueue: [], deletes: [], updates: [] }

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const tableName = (t: unknown) => {
    if (t === schema.patient) return 'patient'
    if (t === schema.reviewRequest) return 'review_request'
    if (t === schema.patientThread) return 'patient_thread'
    if (t === schema.patientMessage) return 'patient_message'
    if (t === schema.scheduledMessage) return 'scheduled_message'
    if (t === schema.campaigns) return 'campaigns'
    if (t === schema.campaignEvents) return 'campaign_events'
    if (t === schema.membership) return 'membership'
    if (t === schema.clinicProfile) return 'clinic_profile'
    return 'unknown'
  }
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      delete: (t: unknown) => {
        state.deletes.push({ table: tableName(t) })
        return { where: () => ({ then: (resolve: (v: unknown) => void) => resolve(undefined) }) }
      },
      update: (t: unknown) => ({
        set: (set: unknown) => {
          state.updates.push({ table: tableName(t), set })
          return { where: () => ({ then: (resolve: (v: unknown) => void) => resolve(undefined) }) }
        },
      }),
      insert: () => {
        throw new Error('persona-anchoring paths must not insert')
      },
    },
    schema,
  }
})

import {
  getPersonaAlignedPatientIds,
  cleanupMisattributedDemoArtifacts,
} from '@/lib/services/demo-clinic'

beforeEach(() => {
  state.selectQueue = []
  state.deletes = []
  state.updates = []
})

describe('getPersonaAlignedPatientIds', () => {
  it('aligns patients to persona indices by email, never positionally', async () => {
    // DB returns rows in an arbitrary order, including a REAL patient whose
    // email is not a persona address (the select is email-filtered in prod;
    // the real patient here proves matching is by email, not position).
    state.selectQueue.push([
      { id: 'pat_noah', email: 'noah.mitchell@example.com' }, // persona 7
      { id: 'pat_mia', email: 'MIA.HAYES@example.com' }, // persona 0 (case-insensitive)
    ])
    const ids = await getPersonaAlignedPatientIds('org_demo', new Date('2026-07-01T12:00:00Z'))
    expect(ids).toHaveLength(15)
    expect(ids[0]).toBe('pat_mia')
    expect(ids[7]).toBe('pat_noah')
    // Every persona with no matching patient stays null — never an arbitrary id.
    expect(ids.filter(Boolean)).toHaveLength(2)
    expect(ids).not.toContain('pat_real')
  })
})

describe('cleanupMisattributedDemoArtifacts', () => {
  it('returns after one select when every org patient is a persona', async () => {
    state.selectQueue.push([{ id: 'pat_mia' }, { id: 'pat_noah' }])
    await cleanupMisattributedDemoArtifacts('org_demo', ['pat_mia', null, 'pat_noah'])
    expect(state.deletes).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('sweeps seeded artifacts off non-persona patients, keeps real ones', async () => {
    // Org has one persona + one real patient (the stray).
    state.selectQueue.push([{ id: 'pat_mia' }, { id: 'pat_real' }])
    // Stray threads: one seeded (matches a seed body) + one real conversation.
    state.selectQueue.push([{ id: 'thr_seeded' }, { id: 'thr_real' }])
    state.selectQueue.push([
      { body: 'Hi Marcus, your filling appointment is coming up. We\'ll see you Tuesday at 10am.' },
    ]) // thr_seeded messages → seeded
    state.selectQueue.push([{ body: 'Hey, do you have parking nearby?' }]) // thr_real → kept
    // Seeded campaigns lookup.
    state.selectQueue.push([{ id: 10 }])
    // clinic_profile testimonials — one linked to the stray, one to a persona.
    state.selectQueue.push([
      {
        testimonials: [
          { patientId: 'pat_real', quote: 'seeded quote on the wrong person' },
          { patientId: 'pat_mia', quote: 'legit persona quote' },
          { quote: 'unlinked legacy quote' },
        ],
      },
    ])

    await cleanupMisattributedDemoArtifacts('org_demo', ['pat_mia'])

    const deleted = state.deletes.map((d) => d.table)
    // review_request (demo-token) + seeded thread's messages + the thread +
    // scheduled_message + campaign_events + membership.
    expect(deleted).toContain('review_request')
    expect(deleted).toContain('patient_message')
    expect(deleted).toContain('patient_thread')
    expect(deleted).toContain('scheduled_message')
    expect(deleted).toContain('campaign_events')
    expect(deleted).toContain('membership')
    // Exactly ONE thread (+ its messages) deleted — the real conversation survives.
    expect(deleted.filter((t) => t === 'patient_thread')).toHaveLength(1)
    expect(deleted.filter((t) => t === 'patient_message')).toHaveLength(1)
    // Testimonials rewritten without the stray-linked entry.
    expect(state.updates).toHaveLength(1)
    const written = (state.updates[0].set as { testimonials: Array<{ patientId?: string | null }> })
      .testimonials
    expect(written).toHaveLength(2)
    expect(written.some((t) => t.patientId === 'pat_real')).toBe(false)
  })
})
