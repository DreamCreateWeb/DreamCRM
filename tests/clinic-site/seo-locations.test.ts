import { describe, it, expect } from 'vitest'
import { clinicJsonLd } from '@/lib/services/clinic-site'
import { siteOffices } from '@/lib/site-offices'
import { FIXTURES } from '../fixtures/clinic-site-fixtures'

const loc = (over: Record<string, unknown>) =>
  ({
    id: 'l1', organizationId: 'org_fixture', name: 'Main', addressLine1: '1 Main St', addressLine2: null, city: 'Austin',
    state: 'TX', postalCode: '78701', phone: null, isPrimary: 0, createdAt: new Date('2026-01-01'), ...over,
  }) as ReturnType<typeof FIXTURES.rich>['locations'][number]

describe('LocalBusiness JSON-LD lists every office', () => {
  it('adds a Place per extra location, none for a one-office practice', () => {
    const one = FIXTURES.rich()
    expect(clinicJsonLd(one).location).toBeUndefined()
    const data = FIXTURES.rich()
    const main = loc({ id: 'a', isPrimary: 1 })
    data.primaryLocation = main
    data.locations = [main, loc({ id: 'b', name: 'Lakeway', addressLine1: '9 Lake Rd', city: 'Lakeway' })]
    const places = clinicJsonLd(data).location as Array<Record<string, any>>
    expect(places).toHaveLength(1)
    expect(places[0].name).toBe('Lakeway')
    expect(places[0].address.streetAddress).toBe('9 Lake Rd')
    expect(siteOffices(data).map((o) => o.line1)).toEqual(['1 Main St', '9 Lake Rd'])
  })

  it('GBP-synced hours win in openingHoursSpecification', () => {
    const data = FIXTURES.rich()
    data.profile.gbpListing = { hours: [{ day: 'wed', open: '10:00', close: '14:00' }], title: 'x' }
    const spec = clinicJsonLd(data).openingHoursSpecification as Array<Record<string, string>>
    expect(spec).toEqual([{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Wednesday', opens: '10:00', closes: '14:00' }])
  })
})
