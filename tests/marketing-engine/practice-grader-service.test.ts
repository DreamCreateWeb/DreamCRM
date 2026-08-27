import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: {
  selectQueue: unknown[][]
  inserts: Record<string, unknown>[]
} = { selectQueue: [], inserts: [] }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          state.inserts.push(v)
        },
      }),
    },
    schema,
  }
})

const { placesMock, placesConfiguredMock, deliverMock, promoteMock, addGraderMock, findExistingMock } =
  vi.hoisted(() => ({
    placesMock: vi.fn(),
    placesConfiguredMock: vi.fn(() => true),
    deliverMock: vi.fn(async (_msg: { to: string; html: string }) => {}),
    promoteMock: vi.fn(async () => true),
    addGraderMock: vi.fn(async () => ({ id: 'pros_new' })),
    findExistingMock: vi.fn(
      async (): Promise<{ id: string; name: string; city: string | null; status: string } | null> => null,
    ),
  }))

vi.mock('@/lib/google-places', () => ({
  placesConfigured: placesConfiguredMock,
  findDentalPlace: placesMock,
}))
vi.mock('@/lib/email', () => ({
  deliver: deliverMock,
  authEmailShell: (o: { heading: string }) => `<html>${o.heading}</html>`,
}))
vi.mock('@/lib/services/prospect-intent', () => ({ promoteProspectByEmail: promoteMock }))
vi.mock('@/lib/services/prospecting', () => ({
  addGraderProspect: addGraderMock,
  findExistingProspect: findExistingMock,
}))

import { runPracticeGrade, getGradeByToken, normalizeWebsiteInput } from '@/lib/services/practice-grader'
import { gradeOnlinePresence } from '@/lib/practice-grade'

const HOMEPAGE = `<!doctype html><html><head>
  <title>Smile Bright Dental</title>
  <meta name="description" content="Family dentistry in Austin">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>Book online with us. <a href="https://booking.example.com">Book</a></body></html>`

function mockFetchOk() {
  const res = {
    ok: true,
    status: 200,
    url: 'https://www.smilebright.com/',
    body: null,
    text: async () => HOMEPAGE,
  }
  vi.stubGlobal('fetch', vi.fn(async () => res))
}

const PLACE = {
  placeId: 'place_1',
  displayName: 'Smile Bright Dental',
  formattedAddress: '100 Main St, Austin, TX 78701, USA',
  websiteUri: 'https://smilebright.com',
  ratingTenths: 48,
  reviewCount: 160,
  businessStatus: 'OPERATIONAL',
  googleMapsUri: 'https://maps.google.com/x',
}

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  vi.clearAllMocks()
  placesConfiguredMock.mockReturnValue(true)
  placesMock.mockResolvedValue(PLACE)
  promoteMock.mockResolvedValue(true)
  findExistingMock.mockResolvedValue(null)
  addGraderMock.mockResolvedValue({ id: 'pros_new' })
  mockFetchOk()
})

describe('normalizeWebsiteInput', () => {
  it('normalizes bare domains and rejects junk', () => {
    expect(normalizeWebsiteInput('smilebright.com')).toBe('https://smilebright.com/')
    expect(normalizeWebsiteInput('  https://x.dental/a ')).toBe('https://x.dental/a')
    expect(normalizeWebsiteInput('not a url')).toBeNull()
    expect(normalizeWebsiteInput('javascript:alert(1)')).toBeNull()
    expect(normalizeWebsiteInput('')).toBeNull()
    expect(normalizeWebsiteInput(null)).toBeNull()
  })
})

describe('runPracticeGrade', () => {
  const INPUT = {
    practiceName: 'Smile Bright Dental',
    email: 'Dr@SmileBright.com',
    city: 'Austin',
    state: 'tx',
    websiteUrl: 'smilebright.com',
  }

  it('grades, persists a tokenized row, mints a grader prospect, and emails the link', async () => {
    state.selectQueue.push([]) // no prospect by email
    const res = await runPracticeGrade(INPUT)
    expect(res.ok).toBe(true)
    const row = state.inserts[0]
    expect(row).toMatchObject({
      email: 'dr@smilebright.com',
      practiceName: 'Smile Bright Dental',
      state: 'TX',
      placeId: 'place_1',
      prospectId: 'pros_new',
    })
    expect(String(row.token)).toMatch(/^[a-f0-9]{32}$/)
    const result = row.result as { letter: string | null; axes: Record<string, { score: number | null }> }
    expect(result.letter).not.toBeNull()
    expect(result.axes.listing.score).toBeGreaterThan(80)
    expect(addGraderMock).toHaveBeenCalledOnce()
    expect(promoteMock).not.toHaveBeenCalled()
    expect(deliverMock).toHaveBeenCalledOnce()
    const mail = deliverMock.mock.calls[0][0] as { to: string; html: string }
    expect(mail.to).toBe('dr@smilebright.com')
  })

  it('promotes an existing prospect by email instead of minting one', async () => {
    state.selectQueue.push([{ id: 'pros_existing' }])
    const res = await runPracticeGrade(INPUT)
    expect(res.ok).toBe(true)
    expect(promoteMock).toHaveBeenCalledWith('dr@smilebright.com', 'grader_run')
    expect(addGraderMock).not.toHaveBeenCalled()
    expect(state.inserts[0]).toMatchObject({ prospectId: 'pros_existing' })
  })

  it('links a name+state pipeline match without a promotion and without minting', async () => {
    state.selectQueue.push([]) // no email match
    findExistingMock.mockResolvedValue({ id: 'pros_named', name: 'Smile Bright Dental', city: 'Austin', status: 'contacted' })
    await runPracticeGrade(INPUT)
    expect(promoteMock).not.toHaveBeenCalled()
    expect(addGraderMock).not.toHaveBeenCalled()
    expect(state.inserts[0]).toMatchObject({ prospectId: 'pros_named' })
  })

  it('rejects a wrong-state Places candidate — the stranger guard at the service layer', async () => {
    // The Ward, AR incident: the lookup returns a real practice elsewhere.
    placesMock.mockResolvedValue({
      ...PLACE,
      placeId: 'place_stranger',
      displayName: 'Dream Dental',
      formattedAddress: '4801 Frankford Rd, Dallas, TX 75287, USA',
      websiteUri: 'https://dreamdentaltx.com',
      ratingTenths: 49,
      reviewCount: 385,
    })
    state.selectQueue.push([])
    const res = await runPracticeGrade({ ...INPUT, practiceName: 'Dream Dental', city: 'Ward', state: 'AR', websiteUrl: 'dreamcreateweb.com' })
    expect(res.ok).toBe(true)
    const row = state.inserts[0]
    // The stranger's placeId is NOT stored; the Google axes grade unknown
    // with the rejection disclosed.
    expect(row.placeId).toBeNull()
    const result = row.result as {
      axes: Record<string, { score: number | null; findings: { text: string }[] }>
    }
    expect(result.axes.listing.score).toBeNull()
    expect(result.axes.reviews.score).toBeNull()
    expect(result.axes.listing.findings.map((x) => x.text).join(' ')).toContain('similar-sounding practice')
  })

  it('rejects an undeliverable email before doing any work', async () => {
    const res = await runPracticeGrade({ ...INPUT, email: 'nope' })
    expect(res.ok).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(state.inserts).toHaveLength(0)
  })

  it('still grades when the site is unreachable and Places is unconfigured — axes stay honest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    placesConfiguredMock.mockReturnValue(false)
    state.selectQueue.push([])
    const res = await runPracticeGrade(INPUT)
    expect(res.ok).toBe(true)
    const result = state.inserts[0].result as ReturnType<typeof gradeOnlinePresence>
    expect(result.axes.website.score).toBeNull()
    expect(result.axes.listing.score).toBeNull()
    expect(result.axes.reviews.score).toBeNull()
    expect(result.overall).toBeNull()
    expect(placesMock).not.toHaveBeenCalled()
  })

  it('a failed email never fails the run — the on-screen report is the product', async () => {
    state.selectQueue.push([])
    deliverMock.mockRejectedValueOnce(new Error('smtp down'))
    const res = await runPracticeGrade(INPUT)
    expect(res.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
  })

  it('a failed Hunter hook never fails the run', async () => {
    state.selectQueue.push([])
    addGraderMock.mockRejectedValueOnce(new Error('db hiccup'))
    const res = await runPracticeGrade(INPUT)
    expect(res.ok).toBe(true)
    expect(state.inserts[0]).toMatchObject({ prospectId: null })
  })
})

describe('getGradeByToken', () => {
  it('rejects malformed tokens without touching the DB', async () => {
    expect(await getGradeByToken('short')).toBeNull()
    expect(await getGradeByToken('Z'.repeat(32))).toBeNull()
    expect(state.selectQueue).toHaveLength(0)
  })
  it('returns a parsed view for a stored grade, and null for garbage rows', async () => {
    const grade = gradeOnlinePresence({
      enteredUrl: null,
      signals: null,
      verdict: null,
      place: null,
      placesChecked: false,
    })
    state.selectQueue.push([
      { practiceName: 'X Dental', city: null, state: null, websiteUrl: null, result: grade, createdAt: new Date() },
    ])
    const view = await getGradeByToken('a'.repeat(32))
    expect(view?.practiceName).toBe('X Dental')
    state.selectQueue.push([{ practiceName: 'Y', city: null, state: null, websiteUrl: null, result: { junk: 1 }, createdAt: new Date() }])
    expect(await getGradeByToken('b'.repeat(32))).toBeNull()
  })
})
