/**
 * appointmentsToCsv — the pure agenda "call sheet" formatter. Pins the header,
 * the row mapping incl. patient phone/email from the contact map, the
 * clinic-timezone date + time rendering (a UTC instant shows in local
 * wall-clock), underscore-free type, and comma-escaping.
 */
import { describe, it, expect } from 'vitest'
import { appointmentsToCsv } from '@/lib/services/appointments'

type Row = Parameters<typeof appointmentsToCsv>[0][number]

function row(over: Partial<Row> = {}): Row {
  return {
    patientId: 'p1',
    patientName: 'Mia Hayes',
    startTime: new Date('2026-06-15T14:30:00Z'),
    type: 'root_canal',
    status: 'scheduled',
    providerName: 'Dr. Reyes',
    ...over,
  } as Row
}

describe('appointmentsToCsv', () => {
  it('renders date + time in the clinic timezone with contact + clean type', () => {
    const contacts = new Map([['p1', { phone: '555-1212', email: 'mia@example.com' }]])
    // 14:30 UTC is 10:30 AM in New York (EDT, summer).
    const csv = appointmentsToCsv([row()], contacts, 'America/New_York')
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('Date,Time,Patient,Phone,Email,Type,Status,Provider')
    expect(lines[1]).toBe('2026-06-15,10:30 AM,Mia Hayes,555-1212,mia@example.com,root canal,scheduled,Dr. Reyes')
  })

  it('uses the timezone offset (same instant, different wall-clock)', () => {
    const csv = appointmentsToCsv([row()], new Map(), 'America/Los_Angeles')
    // 14:30 UTC is 7:30 AM Pacific.
    expect(csv).toContain('7:30 AM')
  })

  it('blanks missing contact + quotes a comma in the name', () => {
    const csv = appointmentsToCsv(
      [row({ patientName: 'Lee, Sam', providerName: null })],
      new Map(),
      'America/New_York',
    )
    const line = csv.trimEnd().split('\r\n')[1]
    expect(line).toContain('"Lee, Sam"')
    // No phone/email/provider → empty cells; line ends with the trailing commas.
    expect(line.endsWith('root canal,scheduled,')).toBe(true)
    expect(line).toContain(',,') // empty phone+email run
  })
})
