import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The new Overview series are bucketed with clinic-day boundaries (the way
// bookingsPerDay14 is) — never `new Date()` day arithmetic or UTC slices.
const src = readFileSync(resolve(__dirname, '../../lib/services/clinic-overview.ts'), 'utf8')

describe('clinic-overview series are clinic-tz bucketed', () => {
  it('one shared bucketer over clinicDayStart serves every new series', () => {
    expect(src).toContain('const bucketByClinicDay')
    const bucketer = src.slice(src.indexOf('const bucketByClinicDay'), src.indexOf('const newPatientsPerDay30'))
    expect(bucketer).toContain('clinicDayStart(now, timeZone,')
    expect(bucketer).not.toMatch(/new Date\(|toISOString|getUTC/)
    for (const s of ['newPatientsPerDay30', 'upcomingPerDay7', 'intakeSubmissionsPerDay14']) {
      expect(src).toMatch(new RegExp(`const ${s} = bucketByClinicDay`))
    }
  })

  it('every new series query is tenant-scoped', () => {
    const block = src.slice(src.indexOf('// New-patient pulse'), src.indexOf('const dayFmt'))
    expect((block.match(/\.organizationId, organizationId/g) ?? []).length).toBe(3)
  })
})
