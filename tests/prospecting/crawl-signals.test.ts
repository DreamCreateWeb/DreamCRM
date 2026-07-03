import { describe, it, expect } from 'vitest'

/**
 * Pure crawl-signal extraction — the regex layer that turns a homepage into
 * scoring inputs: viewport/SSL/copyright, booking markers, social links,
 * builder fingerprints, and mailto discovery (never guessed addresses).
 */

import { extractCrawlSignals, extractEmails, findContactPath } from '@/lib/prospect-signals'

const FETCHED = new Date('2026-07-03T12:00:00Z')

function page(html: string, finalUrl = 'https://smiledental.com') {
  return extractCrawlSignals({ html, finalUrl, bytes: html.length, fetchedAt: FETCHED })
}

describe('extractCrawlSignals', () => {
  it('reads the classic healthy-site signals', () => {
    const s = page(`<!doctype html><html><head>
      <title>Smile Dental — Atlanta Dentist</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="description" content="Family dentistry in Atlanta.">
      </head><body>
      <a href="https://www.facebook.com/smiledental">FB</a>
      <a href="https://instagram.com/smiledental">IG</a>
      <a href="https://booking.nexhealth.com/smile">Book online</a>
      <footer>© 2019–2026 Smile Dental</footer>
      </body></html>`)
    expect(s).toMatchObject({
      ssl: true,
      mobileViewport: true,
      copyrightYear: 2026,
      titleTag: 'Smile Dental — Atlanta Dentist',
      metaDescription: 'Family dentistry in Atlanta.',
      bookingWidget: true,
      builder: null,
    })
    expect(s.socialLinks.facebook).toContain('facebook.com/smiledental')
    expect(s.socialLinks.instagram).toContain('instagram.com/smiledental')
    expect(s.socialLinks.tiktok).toBeUndefined()
  })

  it('flags the classic neglected-site tells', () => {
    const s = page(
      `<html><head><title>Dr Smith DDS</title></head>
       <body>Copyright 2018. <img src="https://static.wixstatic.com/x.png"></body></html>`,
      'http://drsmithdds.com',
    )
    expect(s.ssl).toBe(false)
    expect(s.mobileViewport).toBe(false)
    expect(s.copyrightYear).toBe(2018)
    expect(s.metaDescription).toBeNull()
    expect(s.bookingWidget).toBe(false)
    expect(s.builder).toBe('wix')
  })

  it('detects builders by fingerprint priority', () => {
    expect(page('<html><body><link href="https://assets.squarespace-cdn.com/a.css"></body></html>').builder).toBe('squarespace')
    expect(page('<html><body><script src="/wp-content/themes/dental/app.js"></script></body></html>').builder).toBe('wordpress')
    expect(page('<html><body><img src="https://img.wsimg.com/x.jpg"></body></html>').builder).toBe('godaddy')
  })
})

describe('extractEmails', () => {
  it('collects real mailtos, lowercased + deduped, and skips junk', () => {
    const emails = extractEmails(`
      <a href="mailto:Info@SmileDental.com">email us</a>
      <a href="mailto:info@smiledental.com?subject=Hi">again</a>
      <a href="mailto:test@example.com">junk</a>
      <a href="mailto:not-an-email">junk</a>`)
    expect(emails).toEqual(['info@smiledental.com'])
  })
})

describe('findContactPath', () => {
  it('finds a same-site contact link (email-discovery hop)', () => {
    expect(findContactPath('<a href="/contact-us/">Contact</a>')).toBe('/contact-us/')
    expect(findContactPath('<a href="https://other.com/contact">x</a>')).toBeNull()
    expect(findContactPath('<a href="/about">About</a>')).toBeNull()
  })
})
