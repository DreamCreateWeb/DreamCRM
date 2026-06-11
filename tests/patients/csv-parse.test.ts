import { describe, it, expect } from 'vitest'
import { parseCsv, parseCsvTable } from '@/lib/csv-parse'

describe('parseCsv', () => {
  it('parses a simple comma-separated grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('name,note\n"Smith, Jane","hi, there"')).toEqual([
      ['name', 'note'],
      ['Smith, Jane', 'hi, there'],
    ])
  })

  it('handles escaped quotes ("" → ")', () => {
    expect(parseCsv('q\n"she said ""hi"""')).toEqual([
      ['q'],
      ['she said "hi"'],
    ])
  })

  it('handles embedded newlines inside quoted fields', () => {
    expect(parseCsv('addr\n"line 1\nline 2"')).toEqual([
      ['addr'],
      ['line 1\nline 2'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('handles a lone CR as a record break', () => {
    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips a leading UTF-8 BOM', () => {
    const withBom = '﻿email,phone\nx@y.com,555'
    expect(parseCsv(withBom)).toEqual([
      ['email', 'phone'],
      ['x@y.com', '555'],
    ])
  })

  it('drops fully-blank lines and a trailing newline', () => {
    expect(parseCsv('a\n\n1\n')).toEqual([['a'], ['1']])
  })

  it('preserves empty trailing cells', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
  })

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })

  it('does not throw on an unterminated quote (best-effort fold)', () => {
    expect(() => parseCsv('a\n"oops')).not.toThrow()
    expect(parseCsv('a\n"oops')).toEqual([['a'], ['oops']])
  })
})

describe('parseCsvTable', () => {
  it('splits header (trimmed) from data rows', () => {
    const { header, rows } = parseCsvTable('  First , Last \nJane,Doe')
    expect(header).toEqual(['First', 'Last'])
    expect(rows).toEqual([['Jane', 'Doe']])
  })

  it('returns empty shape for empty input', () => {
    expect(parseCsvTable('')).toEqual({ header: [], rows: [] })
  })

  it('returns header with no rows when only a header line exists', () => {
    expect(parseCsvTable('a,b,c')).toEqual({ header: ['a', 'b', 'c'], rows: [] })
  })
})
