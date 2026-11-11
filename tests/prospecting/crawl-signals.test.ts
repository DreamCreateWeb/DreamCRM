import { describe, it, expect } from 'vitest'

/**
 * Pure crawl-signal extraction — the regex layer that turns a homepage into
 * scoring inputs: viewport/SSL/copyright, booking markers, social links,
 * builder fingerprints, and mailto discovery (never guessed addresses).
 */

import {
  extractCrawlSignals,
  extractEmails,
  extractTextEmails,
  extractSiteEmails,
  findContactPath,
  findTeamPaths,
  detectStack,
  stackCorpus,
  stackHosts,
} from '@/lib/prospect-signals'

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

describe('brand capture', () => {
  it('captures theme-color (normalized), the apple-touch-icon, and og:site_name', () => {
    const s = page(`<html><head>
      <meta name="theme-color" content="#1D4ED8">
      <meta property="og:site_name" content="Smile Dental">
      <meta property="og:image" content="/photos/team.jpg">
      <link rel="icon" href="/favicon.ico">
      <link rel="apple-touch-icon" href="/apple-touch-icon.png">
      </head><body></body></html>`)
    expect(s.themeColor).toBe('#1d4ed8')
    // Precedence: apple-touch-icon beats favicon beats og:image; relative
    // hrefs absolutize against the crawled URL.
    expect(s.iconUrl).toBe('https://smiledental.com/apple-touch-icon.png')
    expect(s.siteName).toBe('Smile Dental')
  })

  it('normalizes 3-digit hex and rejects non-hex theme-colors', () => {
    expect(page('<html><head><meta name="theme-color" content="#abc"></head></html>').themeColor).toBe('#aabbcc')
    expect(page('<html><head><meta name="theme-color" content="rebeccapurple"></head></html>').themeColor).toBeNull()
    expect(page('<html><head></head></html>').themeColor).toBeNull()
  })

  it('falls through icon precedence and drops http-only icons', () => {
    const favicon = page('<html><head><link rel="shortcut icon" href="https://cdn.smiledental.com/fav.png"></head></html>')
    expect(favicon.iconUrl).toBe('https://cdn.smiledental.com/fav.png')
    const og = page('<html><head><meta property="og:image" content="https://smiledental.com/og.jpg"></head></html>')
    expect(og.iconUrl).toBe('https://smiledental.com/og.jpg')
    // Crawled over http → relative icon resolves to http → rejected.
    const insecure = extractCrawlSignals({
      html: '<html><head><link rel="icon" href="/fav.ico"></head></html>',
      finalUrl: 'http://drsmithdds.com',
      bytes: 100,
      fetchedAt: FETCHED,
    })
    expect(insecure.iconUrl).toBeNull()
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

describe('extractTextEmails', () => {
  it('finds addresses printed as plain text, not just mailto links', () => {
    const emails = extractTextEmails('<footer>Reach us at Office@SmileDental.com or drjane@smiledental.com</footer>')
    expect(emails).toContain('office@smiledental.com')
    expect(emails).toContain('drjane@smiledental.com')
  })
  it('rejects mis-parsed asset references and junk', () => {
    expect(extractTextEmails('<img src="logo@2x.png"> hero@image.svg noreply@x.com')).toEqual([])
    expect(extractTextEmails('you@example.com is a placeholder')).toEqual([])
  })
})

describe('extractSiteEmails', () => {
  it('unions mailto + text addresses, deduped and junk-filtered', () => {
    const emails = extractSiteEmails(`
      <a href="mailto:info@smiledental.com">email</a>
      <p>Dr. Jane: drjane@smiledental.com</p>
      <img src="sprite@2x.png">
      <a href="mailto:test@example.com">junk</a>`)
    expect(emails.sort()).toEqual(['drjane@smiledental.com', 'info@smiledental.com'])
  })
})

describe('findTeamPaths', () => {
  it('surfaces meet-the-team / about paths (where a dentist’s email lives)', () => {
    const html = `
      <a href="/our-team">Team</a>
      <a href="/about-us">About</a>
      <a href="/meet-the-doctor">Doctor</a>
      <a href="/contact">Contact</a>
      <a href="/services">Services</a>`
    const paths = findTeamPaths(html, 2)
    expect(paths).toEqual(['/our-team', '/about-us'])
    expect(paths).not.toContain('/contact') // contact is a separate hop
    expect(paths).not.toContain('/services')
  })
})

// ── P-04: the builder vendors and the competitor stack ──────────────────────

describe('builders (P-04): the dental template vendors, before WordPress', () => {
  it('ProSites, PBHS, Officite and TNT Dental by fingerprint', () => {
    expect(page('<html><body><script src="https://cdn.prosites.com/x.js"></script></body></html>').builder).toBe('prosites')
    expect(page('<html><body><link href="https://www.pbhs.com/css/a.css"></body></html>').builder).toBe('pbhs')
    expect(page('<html><body><img src="https://assets.officite.com/l.png"></body></html>').builder).toBe('officite')
    expect(page('<html><body><a href="https://www.tntdental.com">site by TNT Dental</a></body></html>').builder).toBe('tntdental')
  })
  it('a ProSites site built on WordPress reads as ProSites', () => {
    expect(page('<html><body><script src="/wp-content/themes/prosites-pro/app.js"></script></body></html>').builder).toBe('prosites')
  })
})

describe('the competitor stack (P-04) — HOSTS only: script src, link href, iframe src, URLs inside inline scripts; never page copy (I.2)', () => {
  it('fingerprints booking widgets and review engines by their hosts', () => {
    const s = page(`<html><head>
      <script src="https://widget.nexhealth.com/book.js"></script>
      <iframe src="https://birdeye.com/widget/123"></iframe>
      <script src="//www.getweave.com/widget/x.js"></script>
      <link rel="stylesheet" href="https://cdn.podium.com/widget.css">
      <script>window.__cfg = { api: "https://api.yapiapp.com/v1" }</script>
    </head><body><iframe src="https://smile.janeapp.com/book"></iframe></body></html>`)
    expect(s.stack).toEqual(['NexHealth', 'Weave', 'Birdeye', 'Podium', 'Yapi', 'Jane'])
  })
  it('a vendor named in the copy, in JSON-LD, in a hydration payload or in an article link is not an install; a look-alike host is not Weave or LocalMed; a clean page is an empty list', () => {
    expect(page('<html><body><p>We love Weave and Birdeye, and we book with NexHealth.</p></body></html>').stack).toEqual([])
    expect(page('<html><head><script type="application/ld+json">{"@type":"Dentist","description":"we moved off NexHealth and Solutionreach"}</script></head></html>').stack).toEqual([])
    expect(page('<html><head><script id="__NEXT_DATA__" type="application/json">{"props":{"blog":"Why we left NexHealth for the phone"}}</script></head></html>').stack).toEqual([])
    expect(page('<html><body><article><a href="https://www.revenuewell.com">RevenueWell</a> is who we used to use.</article></body></html>').stack).toEqual([])
    expect(page('<html><body><script src="https://interweave.com/a.js"></script><script src="https://cdn.localmedia.com/x.js"></script><img src="https://localmedical.org/l.png"></body></html>').stack).toEqual([])
    expect(page('<html><body><p>Hi</p></body></html>').stack).toEqual([])
    expect(detectStack('')).toEqual([])
    // A real LocalMed host still reads.
    expect(page('<html><head><script src="https://www.localmed.com/widget.js"></script></head></html>').stack).toEqual(['LocalMed'])
  })
  it('the corpus is hosts: one a line, from the tags that load code or frames and from URLs inside inline scripts — nothing from the copy', () => {
    const html = '<html><body><p>Solutionreach rocks</p><script>var a = "smilereminder"; fetch("https://app.smilereminder.com/x")</script><iframe src="https://x.com/embed"></iframe><a href="https://ignored.example/page">no</a></body></html>'
    // The tags that load code or frames first, then the URLs inside inline scripts.
    expect(stackHosts(html)).toEqual(['x.com', 'app.smilereminder.com'])
    const corpus = stackCorpus(html)
    expect(corpus).toBe('x.com\napp.smilereminder.com')
    expect(corpus).not.toContain('Solutionreach rocks')
    expect(corpus).not.toContain('ignored.example')
    expect(detectStack(html)).toEqual(['Solutionreach'])
  })
})
