import { describe, it, expect, vi, beforeEach } from 'vitest'

interface InsertCall {
  table: string
  values: unknown
}

interface UpdateCall {
  set: unknown
}

const state: {
  selectQueue: unknown[][]
  inserts: InsertCall[]
  updates: UpdateCall[]
} = { selectQueue: [], inserts: [], updates: [] }

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const tableName = (t: unknown) => {
    if (t === schema.organization) return 'organization'
    if (t === schema.clinicProfile) return 'clinic_profile'
    if (t === schema.clinicLocation) return 'clinic_location'
    if (t === schema.patient) return 'patient'
    if (t === schema.appointment) return 'appointment'
    if (t === schema.tasks) return 'tasks'
    if (t === schema.customers) return 'customers'
    if (t === schema.products) return 'products'
    if (t === schema.orders) return 'orders'
    if (t === schema.invoices) return 'invoices'
    if (t === schema.formTemplate) return 'form_template'
    if (t === schema.formSubmission) return 'form_submission'
    if (t === schema.patientNote) return 'patient_note'
    if (t === schema.clinicProvider) return 'clinic_provider'
    if (t === schema.appointmentReminderLog) return 'appointment_reminder_log'
    if (t === schema.lead) return 'lead'
    return 'unknown'
  }
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    // count-style queries skip .limit(); they're awaited directly off .where().
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: (vals: unknown) => {
          state.inserts.push({ table: tableName(t), values: vals })
          return {
            returning: async () => {
              const rows = Array.isArray(vals) ? vals : [vals]
              return rows.map((r, i) => ({ id: i + 1, ...(r as object) }))
            },
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          }
        },
      }),
      update: () => ({
        set: (set: unknown) => ({
          where: async () => {
            state.updates.push({ set })
          },
        }),
      }),
    },
    schema,
  }
})

import { createDemoClinic } from '@/lib/services/demo-clinic'

function tableCounts(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const call of state.inserts) {
    const count = Array.isArray(call.values) ? call.values.length : 1
    out[call.table] = (out[call.table] ?? 0) + count
  }
  return out
}

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  state.updates.length = 0
})

describe('createDemoClinic', () => {
  it('returns existing clinic without inserting when slug already exists (idempotent)', async () => {
    state.selectQueue.push([
      { id: 'org_existing', name: 'Acme Dental Demo', slug: 'acme-dental-demo' },
    ])
    // Self-heal reads the profile to decide what to backfill — already-current here.
    state.selectQueue.push([
      {
        brandColor: '#9CAF9F',
        stats: [{ id: 's', value: 'X', label: 'y' }],
        testimonials: [{ id: 't', quote: 'q', authorName: 'a' }],
        officePhotos: [{ id: 'o', url: 'u' }],
      },
    ])
    // Default intake form already seeded — seedDefaultIntakeForm bails out.
    state.selectQueue.push([{ id: 'form_existing' }])
    // Self-heal of patient_note + form_submission: existing patients query,
    // then "any notes?" and "any submissions?" both return present so we skip.
    state.selectQueue.push([
      { id: 'pat_1', email: 'a@x.com', firstName: 'A', lastName: 'X' },
      { id: 'pat_2', email: 'b@x.com', firstName: 'B', lastName: 'X' },
      { id: 'pat_3', email: 'c@x.com', firstName: 'C', lastName: 'X' },
    ])
    state.selectQueue.push([{ id: 'pnote_existing' }]) // notes already present
    state.selectQueue.push([{ id: 'sub_existing' }]) // submissions already present
    // Appointments-module self-heal: provider present, reminder log present
    state.selectQueue.push([{ id: 'prov_existing' }])
    state.selectQueue.push([{ id: 'rem_existing' }])
    // Leads self-heal: all 6 curated leads already present → nothing to top up
    state.selectQueue.push([
      { name: 'Olivia Chen' },
      { name: 'Daniel Park' },
      { name: 'Rachel Williams' },
      { name: 'Marcus Johnson' },
      { name: 'Emma Lopez' },
      { name: 'aaaaa zzzzzz' },
    ])
    // Emma Lopez patient lookup (for convert pointer)
    state.selectQueue.push([{ id: 'pat_emma' }])
    state.selectQueue.push([{ id: 'pat_1' }, { id: 'pat_2' }, { id: 'pat_3' }])
    state.selectQueue.push([{ id: 'appt_1' }])

    const out = await createDemoClinic()

    expect(out.created).toBe(false)
    expect(out.organizationId).toBe('org_existing')
    expect(out.patientCount).toBe(3)
    expect(out.appointmentCount).toBe(1)
    expect(state.inserts).toHaveLength(0)
  })

  it('self-heals stats / testimonials / officePhotos when the existing demo has nulls', async () => {
    state.selectQueue.push([
      { id: 'org_existing', name: 'Acme Dental Demo', slug: 'acme-dental-demo' },
    ])
    state.selectQueue.push([
      { brandColor: '#9CAF9F', stats: null, testimonials: null, officePhotos: null },
    ])
    state.selectQueue.push([{ id: 'form_existing' }]) // form template lookup
    state.selectQueue.push([]) // existing patients for self-heal (none → skip notes + submissions)
    // Appointments self-heal: provider present, reminder present → skip
    state.selectQueue.push([{ id: 'prov_existing' }])
    state.selectQueue.push([{ id: 'rem_existing' }])
    // Leads self-heal: all 6 already present → no-op
    state.selectQueue.push([
      { name: 'Olivia Chen' },
      { name: 'Daniel Park' },
      { name: 'Rachel Williams' },
      { name: 'Marcus Johnson' },
      { name: 'Emma Lopez' },
      { name: 'aaaaa zzzzzz' },
    ])
    state.selectQueue.push([{ id: 'pat_emma' }]) // Emma patient lookup
    state.selectQueue.push([]) // patients count
    state.selectQueue.push([]) // appointments count

    // Capture the update call by hooking the mock — we already track via state.updates
    state.updates.length = 0
    await createDemoClinic()
    // Self-heal triggers 2 updates: clinicProfile patch (stats/testimonials/officePhotos)
    // + appointment.source backfill ("set source='manual' where source is null").
    expect(state.updates).toHaveLength(2)
    const patch = state.updates[0].set as {
      stats?: unknown
      testimonials?: unknown
      officePhotos?: unknown
      brandColor?: unknown
    }
    expect(patch.stats).toBeDefined()
    expect(patch.testimonials).toBeDefined()
    expect(patch.officePhotos).toBeDefined()
    expect(patch.brandColor).toBeUndefined() // already current
    // Second update is the appointment.source backfill.
    expect((state.updates[1].set as { source?: string }).source).toBe('manual')
  })

  it('self-heal seeds patient_note + form_submission when missing', async () => {
    state.selectQueue.push([
      { id: 'org_existing', name: 'Acme Dental Demo', slug: 'acme-dental-demo' },
    ])
    state.selectQueue.push([
      {
        brandColor: '#9CAF9F',
        stats: [{ id: 's', value: 'X', label: 'y' }],
        testimonials: [{ id: 't', quote: 'q' }],
        officePhotos: [{ id: 'o', url: 'u' }],
      },
    ])
    state.selectQueue.push([{ id: 'form_existing' }]) // seedDefaultIntakeForm bails
    // Self-heal: 3 existing patients
    state.selectQueue.push([
      { id: 'pat_a', email: 'a@x.com', firstName: 'Mia', lastName: 'Hayes' },
      { id: 'pat_b', email: 'b@x.com', firstName: 'Aiden', lastName: 'Kim' },
      { id: 'pat_c', email: 'c@x.com', firstName: 'Noah', lastName: 'Mitchell' },
    ])
    state.selectQueue.push([]) // no patient_note rows yet
    state.selectQueue.push([]) // no form_submission rows yet
    state.selectQueue.push([{ id: 'tmpl_1' }]) // form template lookup for submission self-heal
    // Appointments self-heal: provider absent + reminder absent → seeds
    state.selectQueue.push([]) // no clinic_provider yet
    state.selectQueue.push([]) // no reminder log yet
    state.selectQueue.push([{ id: 'appt_future_a' }]) // future appointment lookup for reminder
    // Leads self-heal: no leads yet → tops up to all 6
    state.selectQueue.push([]) // existingLeads (none)
    state.selectQueue.push([{ id: 'pat_emma' }]) // Emma patient lookup for convert pointer
    state.selectQueue.push([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]) // patient count
    state.selectQueue.push([{ id: 'a1' }]) // appointment count

    await createDemoClinic()
    const counts = tableCounts()
    expect(counts.patient_note).toBe(3)
    expect(counts.form_submission).toBe(3)
    expect(counts.clinic_provider).toBe(2)
    expect(counts.appointment_reminder_log).toBe(1)
    // Leads self-heal: all 6 curated leads inserted (top-up from zero) so
    // legacy demos showcase the full /leads view + every lifecycle state.
    expect(counts.lead).toBe(6)
    // Provider-backfill self-heal: two appointment updates fire — one to
    // attach cleanings to the hygienist + one for everything else to the
    // dentist.
    const providerBackfills = state.updates.filter(
      (u) => (u.set as { providerId?: string }).providerId,
    )
    expect(providerBackfills).toHaveLength(2)
  })

  it('seeds the full clinic when none exists', async () => {
    state.selectQueue.push([]) // no existing org
    state.selectQueue.push([]) // no existing default intake form
    state.selectQueue.push([{ id: 'tmpl_seed' }]) // form template lookup before submissions

    const out = await createDemoClinic()

    expect(out.created).toBe(true)
    expect(out.organizationId).toMatch(/^org_/)
    expect(out.organizationSlug).toBe('acme-dental-demo')
    expect(out.patientCount).toBe(15)
    // 8 past + 9 future (incl. phantom cancelled "from" row for Mia's reschedule
    // + Aiden's lapsed-rebooking + Emma's just-booked)
    expect(out.appointmentCount).toBe(17)

    const counts = tableCounts()
    expect(counts.organization).toBe(1)
    expect(counts.clinic_profile).toBe(1)
    expect(counts.clinic_location).toBe(1)
    expect(counts.patient).toBe(15)
    expect(counts.appointment).toBe(17)
    expect(counts.clinic_provider).toBe(2)
    expect(counts.appointment_reminder_log).toBe(4)
    expect(counts.tasks).toBe(3)
    expect(counts.customers).toBe(10)
    expect(counts.products).toBe(4)
    expect(counts.form_template).toBe(1)
    expect(counts.orders).toBe(5)
    expect(counts.invoices).toBe(6)
    expect(counts.form_submission).toBe(5)
    expect(counts.patient_note).toBe(5)
    // 6 curated leads: 3 new (fresh / aging / stale), 1 contacted, 1 converted
    // (linked to Emma Lopez, persona 6), 1 archived (spam example).
    expect(counts.lead).toBe(6)
  })

  it('seeded org has type=clinic and a premium plan tier', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([]) // form lookup
    state.selectQueue.push([{ id: 'tmpl' }]) // submission seeding lookup (before appts)
    await createDemoClinic()
    const orgInsert = state.inserts.find((i) => i.table === 'organization')!
    expect((orgInsert.values as { type: string }).type).toBe('clinic')
    const profileInsert = state.inserts.find((i) => i.table === 'clinic_profile')!
    expect((profileInsert.values as { planTier: string }).planTier).toBe('premium')
    expect((profileInsert.values as { subscriptionStatus: string }).subscriptionStatus).toBe('active')
  })

  it('every patient row carries the new orgId', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([]) // form lookup
    state.selectQueue.push([{ id: 'tmpl' }])
    const out = await createDemoClinic()
    const patientInserts = state.inserts.filter((i) => i.table === 'patient')
    expect(patientInserts).toHaveLength(15)
    for (const p of patientInserts) {
      expect((p.values as { organizationId: string }).organizationId).toBe(out.organizationId)
    }
  })

  it('appointments split into past + future buckets', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([]) // form lookup
    state.selectQueue.push([{ id: 'tmpl' }])
    await createDemoClinic()
    const apptInserts = state.inserts.filter((i) => i.table === 'appointment')
    expect(apptInserts).toHaveLength(17)
    const past = apptInserts.filter(
      (i) => (i.values as { startTime: Date }).startTime.getTime() < Date.now(),
    )
    const future = apptInserts.filter(
      (i) => (i.values as { startTime: Date }).startTime.getTime() > Date.now(),
    )
    expect(past.length).toBe(8)
    expect(future.length).toBe(9)
  })

  it('seeds clinic_provider rows and attaches providerId to each appointment', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    state.selectQueue.push([{ id: 'tmpl' }])
    await createDemoClinic()
    const providerInserts = state.inserts
      .filter((i) => i.table === 'clinic_provider')
      .flatMap((i) => (Array.isArray(i.values) ? i.values : [i.values])) as Array<{ displayName: string; role: string }>
    expect(providerInserts).toHaveLength(2)
    expect(providerInserts.find((p) => p.role === 'dentist')).toBeDefined()
    expect(providerInserts.find((p) => p.role === 'hygienist')).toBeDefined()
    const apptInserts = state.inserts.filter((i) => i.table === 'appointment')
    for (const a of apptInserts) {
      expect((a.values as { providerId?: string | null }).providerId).toBeTruthy()
    }
  })

  it('seeds reminder log entries against future appointments', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    state.selectQueue.push([{ id: 'tmpl' }])
    await createDemoClinic()
    const reminderInserts = state.inserts.filter((i) => i.table === 'appointment_reminder_log')
    expect(reminderInserts).toHaveLength(4)
    // At least one reminder has a reply attached (Sophia's confirmation)
    const hasReply = reminderInserts.some(
      (r) => (r.values as { repliedAt?: Date | null }).repliedAt,
    )
    expect(hasReply).toBe(true)
  })

  it('seeds a rescheduled appointment that points back at its phantom "from" row', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    state.selectQueue.push([{ id: 'tmpl' }])
    await createDemoClinic()
    const apptInserts = state.inserts
      .filter((i) => i.table === 'appointment')
      .flatMap((i) => (Array.isArray(i.values) ? i.values : [i.values])) as Array<{
        id: string
        rescheduledFromAppointmentId?: string | null
        status: string
      }>
    const rescheduled = apptInserts.find((a) => a.rescheduledFromAppointmentId)
    expect(rescheduled).toBeDefined()
    // The "from" row must also exist + be cancelled.
    const fromRow = apptInserts.find((a) => a.id === rescheduled!.rescheduledFromAppointmentId)
    expect(fromRow).toBeDefined()
    expect(fromRow!.status).toBe('cancelled')
  })

  it('every customers row that has a patientId points at one of the seeded patients', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    state.selectQueue.push([{ id: 'tmpl' }])
    await createDemoClinic()
    const customerInserts = state.inserts
      .filter((i) => i.table === 'customers')
      .flatMap((i) => (Array.isArray(i.values) ? i.values : [i.values])) as Array<{
        patientId?: string
      }>
    const linked = customerInserts.filter((c) => c.patientId)
    // 4 personas are linked to a customers row per the seeder
    expect(linked.length).toBe(4)
    const patientInserts = state.inserts.filter((i) => i.table === 'patient')
    const patientIds = patientInserts.map((p) => (p.values as { id: string }).id)
    for (const c of linked) {
      expect(patientIds).toContain(c.patientId)
    }
  })

  it('seeds patient notes and form submissions on the patients module v1 path', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    state.selectQueue.push([{ id: 'tmpl' }])
    await createDemoClinic()
    const noteInserts = state.inserts.filter((i) => i.table === 'patient_note')
    const subInserts = state.inserts.filter((i) => i.table === 'form_submission')
    expect(noteInserts).toHaveLength(5)
    expect(subInserts).toHaveLength(5)
  })

  it('seeds all 6 curated leads with Emma-Lopez convert pointer on the new-clinic path', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    state.selectQueue.push([{ id: 'tmpl' }])
    await createDemoClinic()
    const leadInserts = state.inserts.filter((i) => i.table === 'lead')
    expect(leadInserts).toHaveLength(6)
    const names = leadInserts.map((i) => (i.values as { name: string }).name)
    expect(names).toEqual(
      expect.arrayContaining(['Olivia Chen', 'Daniel Park', 'Rachel Williams', 'Marcus Johnson', 'Emma Lopez', 'aaaaa zzzzzz']),
    )
    // The converted Emma Lopez lead points back at her seeded patient row.
    const emmaLead = leadInserts.find((i) => (i.values as { name: string }).name === 'Emma Lopez')!
    expect((emmaLead.values as { status: string }).status).toBe('converted')
    expect((emmaLead.values as { convertedToPatientId: string | null }).convertedToPatientId).toBeTruthy()
  })

  it('self-heal lead pump is additive — tops up to 6 when some are already present', async () => {
    // Existing demo: 3 leads already seeded under the old (sparse) self-heal.
    // New self-heal should only insert the 3 missing ones, not duplicate.
    state.selectQueue.push([
      { id: 'org_existing', name: 'Acme Dental Demo', slug: 'acme-dental-demo' },
    ])
    state.selectQueue.push([
      {
        brandColor: '#9CAF9F',
        stats: [{ id: 's', value: 'X', label: 'y' }],
        testimonials: [{ id: 't', quote: 'q' }],
        officePhotos: [{ id: 'o', url: 'u' }],
      },
    ])
    state.selectQueue.push([{ id: 'form_existing' }])
    state.selectQueue.push([]) // existing patients (none) → notes/submissions skipped
    state.selectQueue.push([{ id: 'prov_existing' }]) // provider present → skip
    state.selectQueue.push([{ id: 'rem_existing' }]) // reminder present → skip
    // Leads: 3 of the 6 already exist (Olivia, Daniel, spam test from the
    // prior self-heal). Top-up should add 3 more (Rachel, Marcus, Emma).
    state.selectQueue.push([
      { name: 'Olivia Chen' },
      { name: 'Daniel Park' },
      { name: 'aaaaa zzzzzz' },
    ])
    state.selectQueue.push([{ id: 'pat_emma' }]) // Emma patient lookup
    state.selectQueue.push([]) // patient count
    state.selectQueue.push([]) // appointment count

    await createDemoClinic()
    const leadInserts = state.inserts.filter((i) => i.table === 'lead')
    expect(leadInserts).toHaveLength(3)
    const names = leadInserts.map((i) => (i.values as { name: string }).name)
    expect(names).toEqual(expect.arrayContaining(['Rachel Williams', 'Marcus Johnson', 'Emma Lopez']))
    // Inserted Emma still points at the looked-up patient row.
    const emmaLead = leadInserts.find((i) => (i.values as { name: string }).name === 'Emma Lopez')!
    expect((emmaLead.values as { convertedToPatientId: string | null }).convertedToPatientId).toBe('pat_emma')
  })

  it('self-heal lead pump leaves Emma convert pointer null when Emma patient is missing', async () => {
    // Legacy demo without the Emma persona (predates seed expansion) →
    // Emma lookup returns []. Lead still seeds, just with null pointer.
    state.selectQueue.push([
      { id: 'org_existing', name: 'Acme Dental Demo', slug: 'acme-dental-demo' },
    ])
    state.selectQueue.push([
      {
        brandColor: '#9CAF9F',
        stats: [{ id: 's', value: 'X', label: 'y' }],
        testimonials: [{ id: 't', quote: 'q' }],
        officePhotos: [{ id: 'o', url: 'u' }],
      },
    ])
    state.selectQueue.push([{ id: 'form_existing' }])
    state.selectQueue.push([])
    state.selectQueue.push([{ id: 'prov_existing' }])
    state.selectQueue.push([{ id: 'rem_existing' }])
    state.selectQueue.push([]) // existingLeads (none)
    state.selectQueue.push([]) // Emma patient lookup — NOT FOUND
    state.selectQueue.push([])
    state.selectQueue.push([])

    await createDemoClinic()
    const leadInserts = state.inserts.filter((i) => i.table === 'lead')
    expect(leadInserts).toHaveLength(6)
    const emmaLead = leadInserts.find((i) => (i.values as { name: string }).name === 'Emma Lopez')!
    // Status still 'converted' but pointer is null since Emma patient
    // doesn't exist on this org.
    expect((emmaLead.values as { status: string }).status).toBe('converted')
    expect((emmaLead.values as { convertedToPatientId: string | null }).convertedToPatientId).toBeNull()
  })
})
