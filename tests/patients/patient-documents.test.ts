import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  patientRows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/db', () => {
  function chain(table?: string) {
    const ctx = { tbl: table }
    const o: Record<string, unknown> = {}
    o.from = (t: { __t?: string }) => { ctx.tbl = t?.__t; return o }
    o.where = () => o
    o.limit = () => Promise.resolve(ctx.tbl === 'patient' ? h.patientRows : [])
    o.values = (v: Record<string, unknown>) => { h.inserts.push(v); return Promise.resolve(undefined) }
    return o
  }
  return {
    db: { select: () => chain(), insert: (t: { __t?: string }) => chain(t?.__t) },
    schema: {
      patient: { __t: 'patient', id: 'id', organizationId: 'organizationId' },
      patientDocument: { __t: 'patientDocument' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
  desc: (x: unknown) => x,
  isNull: (x: unknown) => x,
}))

import {
  sniffPatientDocument,
  addPatientDocument,
} from '@/lib/services/patient-documents'
import { formatFileSize, isImageDocument } from '@/lib/types/patient-documents'

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals)
}
function ascii(s: string): Uint8Array {
  return new Uint8Array(s.split('').map((c) => c.charCodeAt(0)))
}

describe('sniffPatientDocument', () => {
  it('accepts a PDF (%PDF magic)', () => {
    expect(sniffPatientDocument(ascii('%PDF-1.7'))).toEqual({ ok: true, contentType: 'application/pdf' })
  })
  it('accepts JPEG / PNG / GIF / WebP', () => {
    expect(sniffPatientDocument(bytes(0xff, 0xd8, 0xff)).ok).toBe(true)
    expect(sniffPatientDocument(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({ ok: true, contentType: 'image/png' })
    expect(sniffPatientDocument(ascii('GIF89a'))).toEqual({ ok: true, contentType: 'image/gif' })
    const webp = new Uint8Array(12)
    webp.set(ascii('RIFF'), 0)
    webp.set(ascii('WEBP'), 8)
    expect(sniffPatientDocument(webp)).toEqual({ ok: true, contentType: 'image/webp' })
  })
  it('rejects SVG / markup (stored-XSS risk)', () => {
    const r = sniffPatientDocument(ascii('<svg xmlns="...">'))
    expect(r.ok).toBe(false)
  })
  it('rejects an unknown/binary blob', () => {
    const r = sniffPatientDocument(bytes(0x00, 0x01, 0x02, 0x03))
    expect(r.ok).toBe(false)
  })
})

describe('addPatientDocument', () => {
  beforeEach(() => {
    h.patientRows = []
    h.inserts = []
  })

  it('throws when the patient is not in the org', async () => {
    h.patientRows = [] // ownership check → not found
    await expect(
      addPatientDocument({
        organizationId: 'org_1',
        patientId: 'p_foreign',
        uploadedBy: 'u1',
        fileName: 'x.pdf',
        fileUrl: 'https://s3/x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 100,
      }),
    ).rejects.toThrow(/not found/i)
    expect(h.inserts).toHaveLength(0)
  })

  it('inserts + trims the label, returns the new row', async () => {
    h.patientRows = [{ id: 'p1' }]
    const row = await addPatientDocument({
      organizationId: 'org_1',
      patientId: 'p1',
      uploadedBy: 'u1',
      fileName: 'scan.pdf',
      fileUrl: 'https://s3/scan.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048.6,
      label: '  Insurance card  ',
    })
    expect(row.label).toBe('Insurance card')
    expect(row.sizeBytes).toBe(2049) // rounded
    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0].fileUrl).toBe('https://s3/scan.pdf')
  })
})

describe('document type helpers', () => {
  it('formatFileSize renders B / KB / MB', () => {
    expect(formatFileSize(0)).toBe('')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })
  it('isImageDocument distinguishes images from PDFs', () => {
    expect(isImageDocument('image/jpeg')).toBe(true)
    expect(isImageDocument('application/pdf')).toBe(false)
  })
})
