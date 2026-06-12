/**
 * Pure schema.org JSON-LD builders (lib/clinic-site-jsonld.ts) wired into the
 * services / about / team / blog / insurance / shop / dental-plans pages.
 * They must emit valid shapes, honor positions, and NEVER fabricate data
 * (no price when none given, honest availability, optional fields omitted).
 */
import { describe, it, expect } from 'vitest'
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  servicesItemListJsonLd,
  personJsonLd,
  teamItemListJsonLd,
  aboutOrganizationJsonLd,
  productJsonLd,
  blogIndexJsonLd,
  dentalPlansJsonLd,
} from '@/lib/clinic-site-jsonld'

const CLINIC = { name: 'Acme Dental', url: 'https://acme.example' }

describe('breadcrumbJsonLd', () => {
  it('builds a 1-based BreadcrumbList; last crumb may omit item', () => {
    const ld = breadcrumbJsonLd([
      { name: 'Home', url: 'https://acme.example' },
      { name: 'Services', url: 'https://acme.example/services' },
      { name: 'Whitening' },
    ])
    expect(ld['@type']).toBe('BreadcrumbList')
    const items = ld.itemListElement as Array<Record<string, unknown>>
    expect(items).toHaveLength(3)
    expect(items[0].position).toBe(1)
    expect(items[2].position).toBe(3)
    expect(items[0].item).toBe('https://acme.example')
    expect('item' in items[2]).toBe(false) // current page has no link
  })
})

describe('faqPageJsonLd', () => {
  it('emits a FAQPage for valid Q&A', () => {
    const ld = faqPageJsonLd([
      { question: 'Do you take my insurance?', answer: 'Send us your plan and we will check.' },
    ])
    expect(ld?.['@type']).toBe('FAQPage')
    const q = (ld!.mainEntity as Array<Record<string, unknown>>)[0]
    expect(q['@type']).toBe('Question')
    expect((q.acceptedAnswer as Record<string, unknown>).text).toContain('check')
  })

  it('skips entries missing a question or answer, returns null when none valid', () => {
    expect(faqPageJsonLd([{ question: '', answer: 'x' }, { question: 'y', answer: '' }])).toBeNull()
    const ld = faqPageJsonLd([{ question: 'a', answer: 'b' }, { question: ' ', answer: ' ' }])
    expect((ld!.mainEntity as unknown[]).length).toBe(1)
  })
})

describe('servicesItemListJsonLd', () => {
  it('maps services to positioned MedicalProcedure items with the clinic as provider', () => {
    const ld = servicesItemListJsonLd(
      [
        { name: 'Cleaning', description: 'Routine hygiene.', url: 'https://acme.example/services/cleaning' },
        { name: 'Whitening', description: null, url: 'https://acme.example/services/whitening' },
      ],
      CLINIC.name,
      CLINIC.url,
    )
    expect(ld['@type']).toBe('ItemList')
    const items = ld.itemListElement as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    const proc = items[0].item as Record<string, unknown>
    expect(proc['@type']).toBe('MedicalProcedure')
    expect((proc.provider as Record<string, unknown>).name).toBe('Acme Dental')
    // Description omitted when null.
    expect('description' in (items[1].item as Record<string, unknown>)).toBe(false)
  })
})

describe('personJsonLd', () => {
  it('builds a Person worksFor Dentist with url + mainEntityOfPage', () => {
    const ld = personJsonLd(
      { name: 'Dr. Jordan Reyes', url: 'https://acme.example/team/jordan-reyes', jobTitle: 'DDS', description: 'Lead dentist.', image: 'https://img/x.jpg' },
      CLINIC,
      'https://acme.example/team/jordan-reyes',
    )
    expect(ld['@type']).toBe('Person')
    expect(ld.url).toBe('https://acme.example/team/jordan-reyes')
    expect(ld.mainEntityOfPage).toBe('https://acme.example/team/jordan-reyes')
    expect((ld.worksFor as Record<string, unknown>)['@type']).toBe('Dentist')
  })

  it('omits optional fields when absent', () => {
    const ld = personJsonLd({ name: 'Casey' }, CLINIC)
    expect('url' in ld).toBe(false)
    expect('jobTitle' in ld).toBe(false)
    expect('mainEntityOfPage' in ld).toBe(false)
  })
})

describe('teamItemListJsonLd', () => {
  it('lists positioned Person items', () => {
    const ld = teamItemListJsonLd(
      [{ name: 'A', url: 'https://acme.example/team/a' }, { name: 'B' }],
      CLINIC,
    )
    const items = ld.itemListElement as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect((items[0].item as Record<string, unknown>)['@type']).toBe('Person')
    expect(items[1].position).toBe(2)
  })
})

describe('aboutOrganizationJsonLd', () => {
  it('builds a Dentist node enumerating staff as employee Person nodes', () => {
    const ld = aboutOrganizationJsonLd(
      { name: CLINIC.name, url: CLINIC.url, description: 'Warm care.', logo: 'https://img/logo.png' },
      [{ name: 'Dr. Reyes', jobTitle: 'DDS', url: 'https://acme.example/team/reyes' }],
    )
    expect(ld['@type']).toBe('Dentist')
    expect(ld.logo).toBe('https://img/logo.png')
    const emp = (ld.employee as Array<Record<string, unknown>>)[0]
    expect(emp.name).toBe('Dr. Reyes')
    expect(emp.url).toBe('https://acme.example/team/reyes')
  })

  it('omits employee when there are no members', () => {
    const ld = aboutOrganizationJsonLd({ name: CLINIC.name, url: CLINIC.url }, [])
    expect('employee' in ld).toBe(false)
  })
})

describe('productJsonLd', () => {
  it('emits Product + Offer with real price + InStock availability', () => {
    const ld = productJsonLd({
      name: 'Whitening Kit',
      description: 'Pro-grade.',
      image: 'https://img/kit.jpg',
      url: 'https://acme.example/shop/whitening-kit',
      priceCents: 4999,
      inStock: true,
      clinicName: CLINIC.name,
    })
    expect(ld['@type']).toBe('Product')
    const offer = ld.offers as Record<string, unknown>
    expect(offer.price).toBe('49.99')
    expect(offer.availability).toBe('https://schema.org/InStock')
  })

  it('marks OutOfStock honestly', () => {
    const ld = productJsonLd({ name: 'X', url: 'u', priceCents: 100, inStock: false, clinicName: 'C' })
    expect((ld.offers as Record<string, unknown>).availability).toBe('https://schema.org/OutOfStock')
  })

  it('omits offers entirely when there is no price (never fabricates 0.00)', () => {
    const ld = productJsonLd({ name: 'X', url: 'u', priceCents: null, inStock: true, clinicName: 'C' })
    expect('offers' in ld).toBe(false)
  })
})

describe('blogIndexJsonLd', () => {
  it('builds a Blog with BlogPosting stubs', () => {
    const ld = blogIndexJsonLd({
      name: 'Acme blog',
      url: 'https://acme.example/blog',
      clinicName: CLINIC.name,
      posts: [{ title: 'Flossing 101', url: 'https://acme.example/blog/flossing', datePublished: '2026-01-01T00:00:00.000Z', description: 'How to floss.' }],
    })
    expect(ld['@type']).toBe('Blog')
    const post = (ld.blogPost as Array<Record<string, unknown>>)[0]
    expect(post['@type']).toBe('BlogPosting')
    expect(post.datePublished).toContain('2026')
  })
})

describe('dentalPlansJsonLd', () => {
  it('maps membership plans to recurring Offers; "annual" → YEAR billing unit', () => {
    const ld = dentalPlansJsonLd({
      url: 'https://acme.example/dental-plans',
      clinicName: CLINIC.name,
      plans: [
        { name: 'Smile Club', priceCents: 39900, billingInterval: 'annual', description: 'Yearly.' },
        { name: 'Monthly', priceCents: 3900, billingInterval: 'monthly', description: null },
      ],
    })
    const items = ld.itemListElement as Array<Record<string, unknown>>
    const yearly = items[0].item as Record<string, unknown>
    const monthly = items[1].item as Record<string, unknown>
    expect(yearly['@type']).toBe('Offer')
    expect(yearly.price).toBe('399.00')
    expect((yearly.priceSpecification as Record<string, unknown>).unitText).toBe('YEAR')
    expect((monthly.priceSpecification as Record<string, unknown>).unitText).toBe('MONTH')
  })
})
