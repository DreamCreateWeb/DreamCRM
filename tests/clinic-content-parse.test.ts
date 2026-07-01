import { describe, it, expect } from 'vitest'
import {
  parseFaq,
  parseStringList,
  parseStaff,
  parseStats,
  parseServices,
  parseOfficePhotos,
  parseFinancingPartners,
  parseHours,
  clean,
} from '@/lib/clinic-content-parse'

describe('parseFaq', () => {
  it('returns null on undefined / empty / non-array / bad json', () => {
    expect(parseFaq(undefined)).toBeNull()
    expect(parseFaq('')).toBeNull()
    expect(parseFaq('{}')).toBeNull()
    expect(parseFaq('not json')).toBeNull()
    expect(parseFaq('[]')).toBeNull()
  })

  it('parses valid rows and preserves ids', () => {
    const out = parseFaq(
      JSON.stringify([
        { id: 'a', category: 'Insurance', question: 'Do you take Cigna?', answer: 'Yes.' },
      ]),
    )
    expect(out).toEqual([
      { id: 'a', category: 'Insurance', question: 'Do you take Cigna?', answer: 'Yes.' },
    ])
  })

  it('drops rows missing a question or answer', () => {
    const out = parseFaq(
      JSON.stringify([
        { category: 'Booking', question: 'Q only' },
        { category: 'Booking', answer: 'A only' },
        { category: 'Booking', question: 'Real?', answer: 'Yes' },
      ]),
    )
    expect(out).toHaveLength(1)
    expect(out![0].question).toBe('Real?')
  })

  it('defaults category when missing/blank, and generates an id', () => {
    const out = parseFaq(JSON.stringify([{ question: 'Q', answer: 'A' }]))
    expect(out).toHaveLength(1)
    expect(out![0].category).toBe('Your Visit')
    expect(typeof out![0].id).toBe('string')
    expect(out![0].id.length).toBeGreaterThan(0)
  })

  it('trims question + answer', () => {
    const out = parseFaq(JSON.stringify([{ category: 'Office', question: '  Q  ', answer: '  A  ' }]))
    expect(out![0].question).toBe('Q')
    expect(out![0].answer).toBe('A')
  })
})

describe('parseStringList', () => {
  it('splits on newline and comma, trims, drops empties', () => {
    expect(parseStringList('Aetna\nCigna, Delta Dental\n\n')).toEqual([
      'Aetna',
      'Cigna',
      'Delta Dental',
    ])
  })
  it('dedupes case-insensitively, keeping first casing', () => {
    expect(parseStringList('Aetna\naetna\nAETNA')).toEqual(['Aetna'])
  })
  it('returns null when empty', () => {
    expect(parseStringList('')).toBeNull()
    expect(parseStringList('   \n , ')).toBeNull()
    expect(parseStringList(undefined)).toBeNull()
  })
})

describe('parseStaff', () => {
  it('carries Checkpoint-3 humanizing fields through a save', () => {
    const out = parseStaff(
      JSON.stringify([
        {
          id: 's1',
          name: 'Dr. Jane Lee',
          title: 'Lead Dentist',
          bio: 'Bio',
          photoUrl: 'http://x/p.jpg',
          slug: 'jane-lee',
          credentials: 'DDS · 12 years',
          specialties: ['Cosmetic', ' Implants ', ''],
          funFact: 'Hikes on weekends',
          bookHref: 'http://x/book',
        },
      ]),
    )
    expect(out).toHaveLength(1)
    const s = out![0]
    expect(s.slug).toBe('jane-lee')
    expect(s.credentials).toBe('DDS · 12 years')
    expect(s.specialties).toEqual(['Cosmetic', 'Implants']) // trimmed + empties dropped
    expect(s.funFact).toBe('Hikes on weekends')
    expect(s.bookHref).toBe('http://x/book')
  })

  it('drops rows without a name and nulls empty specialties', () => {
    const out = parseStaff(
      JSON.stringify([
        { name: '', title: 'x' },
        { name: 'Maria', specialties: [] },
      ]),
    )
    expect(out).toHaveLength(1)
    expect(out![0].name).toBe('Maria')
    expect(out![0].specialties).toBeNull()
  })
})

describe('parseStats', () => {
  it('preserves the review_count dynamic flag, nulls anything else', () => {
    const out = parseStats(
      JSON.stringify([
        { value: '8000', label: 'reviews', dynamic: 'review_count' },
        { value: 'Same-week', label: 'appointments', dynamic: 'bogus' },
      ]),
    )
    expect(out![0].dynamic).toBe('review_count')
    expect(out![1].dynamic).toBeNull()
  })
  it('drops rows with neither value nor label', () => {
    const out = parseStats(JSON.stringify([{ value: '', label: '' }, { value: 'X', label: '' }]))
    expect(out).toHaveLength(1)
  })
})

describe('parseServices', () => {
  it('preserves library link + overrides + customization', () => {
    const out = parseServices(
      JSON.stringify([
        {
          id: 'svc1',
          name: 'Teeth Whitening',
          librarySlug: 'teeth-whitening',
          category: 'core',
          photoUrl: ' http://x/p.jpg ',
          offer: ' 20% off ',
          customized: { heroBullets: ['a'], body: 'b', processSteps: [], faq: [], generatedAt: 'now', modelId: 'm' },
        },
      ]),
    )
    const s = out![0]
    expect(s.librarySlug).toBe('teeth-whitening')
    expect(s.category).toBe('core')
    expect(s.photoUrl).toBe('http://x/p.jpg')
    expect(s.offer).toBe('20% off')
    expect(s.customized).toBeTruthy()
  })
  it('drops invalid category to null and requires a name', () => {
    const out = parseServices(
      JSON.stringify([
        { name: '', librarySlug: 'x' },
        { name: 'Cleanings', category: 'weird' },
      ]),
    )
    expect(out).toHaveLength(1)
    expect(out![0].category).toBeNull()
  })
})

describe('parseOfficePhotos + parseFinancingPartners', () => {
  it('office photos require a url', () => {
    const out = parseOfficePhotos(JSON.stringify([{ alt: 'x' }, { url: 'http://x/1.jpg', caption: 'Lobby' }]))
    expect(out).toHaveLength(1)
    expect(out![0].caption).toBe('Lobby')
  })
  it('financing partners require a name and null when empty', () => {
    expect(parseFinancingPartners(JSON.stringify([{ description: 'x' }]))).toBeNull()
    const out = parseFinancingPartners(JSON.stringify([{ name: 'CareCredit', applyUrl: ' http://cc ' }]))
    expect(out![0].name).toBe('CareCredit')
    expect(out![0].applyUrl).toBe('http://cc')
  })
})

describe('parseHours', () => {
  function fd(entries: Record<string, string>) {
    const f = new FormData()
    for (const [k, v] of Object.entries(entries)) f.set(k, v)
    return f
  }
  it('parses open/close + closed, nulls when untouched', () => {
    expect(parseHours(fd({}))).toBeNull()
    const out = parseHours(
      fd({ 'hours[mon].open': '09:00', 'hours[mon].close': '17:00', 'hours[sun].closed': 'on' }),
    )!
    expect(out.mon).toEqual({ open: '09:00', close: '17:00' })
    expect(out.sun).toEqual({ closed: true })
  })
  it('throws on a malformed time', () => {
    expect(() => parseHours(fd({ 'hours[mon].open': '9am' }))).toThrow(/Invalid open time/i)
  })
})

describe('clean', () => {
  it('trims and falls back', () => {
    const f = new FormData()
    f.set('a', '  hi  ')
    expect(clean('a', f)).toBe('hi')
    expect(clean('missing', f)).toBeNull()
    expect(clean('missing', f, 'US')).toBe('US')
  })
})
