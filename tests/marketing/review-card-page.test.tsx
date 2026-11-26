import { afterEach, describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ReviewCardPage, { metadata } from '@/app/(marketing)/google-review-card/page'
import ReviewCardMaker from '@/app/(marketing)/google-review-card/review-card-maker'
import ReviewRequestGuide from '@/app/(marketing)/resources/dental-review-request-templates/page'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { REVIEW_LINK_HELP, REVIEW_RULES } from '@/lib/marketing/guide-sources'
import { publicPages } from '@/lib/marketing/public-pages'
import { FOOTER_COLUMNS, MARKETING, MARKETING_NAV, MARKETING_PUBLIC_PATHS, TRIAL } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import {
  REVIEW_CARD_BODY,
  REVIEW_CARD_FORMATS,
  REVIEW_CARD_HEADLINES,
  reviewCodeFileName,
} from '@/lib/review-card'

/**
 * THE REVIEW CARD MAKER (queue item 10) — a free tool on the marketing site.
 * A practice pastes the review link Google gives it and prints a counter sign
 * or handout cards with a QR code, in its own name.
 *
 * What it is held to:
 *
 * 1. IT RUNS IN THE BROWSER AND SAYS SO. No lookup, no server action, nothing
 *    sent. The page promises that in words, so the maker may never grow a
 *    network call (`tests/marketing/review-card.test.ts` holds the module it
 *    is built on free of server imports by being importable here at all).
 * 2. IT PRINTS A GOOGLE LINK AND NOTHING ELSE, and refuses in words.
 * 3. THE WORDING IS THE VETTED ONE — a choice among `REVIEW_CARD_HEADLINES`,
 *    never free text, so the tool cannot be used to print "5 stars for $10
 *    off" on our layout.
 * 4. EVERY LINE OF GOOGLE'S IS QUOTED, pinned, linked and dated, and the page
 *    says it is not Google's.
 */

const PATH = '/google-review-card'
const LINK = 'https://g.page/r/CabcDEF123/review'

/**
 * happy-dom has no `window.print`. The button calls the browser's own, so the
 * test gives the window one and takes it away again.
 */
const realPrint = Object.getOwnPropertyDescriptor(window, 'print')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (realPrint) Object.defineProperty(window, 'print', realPrint)
  else delete (window as { print?: unknown }).print
})

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('the maker', () => {
  it('starts with nothing to print: two fields, the vetted choices and the promise', () => {
    render(<ReviewCardMaker />)
    expect(screen.getByLabelText('Practice name')).toBeInTheDocument()
    expect(screen.getByLabelText('Your Google review link')).toBeInTheDocument()
    for (const h of REVIEW_CARD_HEADLINES) expect(screen.getByRole('radio', { name: h })).toBeInTheDocument()
    for (const f of REVIEW_CARD_FORMATS) expect(screen.getByRole('radio', { name: new RegExp(`^${f.label}`) })).toBeInTheDocument()
    // The first of each is chosen, so the first card a practice sees is whole.
    expect(screen.getByRole('radio', { name: REVIEW_CARD_HEADLINES[0] })).toBeChecked()
    expect(screen.getByRole('radio', { name: new RegExp(`^${REVIEW_CARD_FORMATS[0].label}`) })).toBeChecked()

    expect(screen.getByRole('button', { name: 'Print the card' })).toBeDisabled()
    expect(screen.queryByRole('img', { name: /QR code/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Download the QR code/ })).toBeNull()
    expect(screen.getByText(/This is made in your browser\. Nothing you type is sent, stored, or seen by us\./)).toBeInTheDocument()
  })

  it('there is no free-text headline: the card says one of the vetted lines or nothing', () => {
    render(<ReviewCardMaker />)
    const textboxes = screen.getAllByRole('textbox')
    expect(textboxes.map((t) => t.getAttribute('id'))).toEqual(['review-card-name', 'review-card-link'])
  })

  it('typing is not scolded mid-word: the message waits for a paste, or for leaving the field', () => {
    render(<ReviewCardMaker />)
    const field = screen.getByLabelText('Your Google review link')
    // Somebody typing "g.page/…" passes through "g", which is no link at all.
    type('Your Google review link', 'g')
    expect(field).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/does not look like a link/)).toBeNull()
    fireEvent.blur(field)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/does not look like a link/)).toBeInTheDocument()
    // Once it has spoken it keeps up with the field, and stops when the link is right.
    type('Your Google review link', LINK)
    expect(field).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/does not look like a link/)).toBeNull()
  })

  it('a pasted link is judged at once', () => {
    render(<ReviewCardMaker />)
    const field = screen.getByLabelText('Your Google review link')
    fireEvent.paste(field)
    type('Your Google review link', 'https://www.facebook.com/acme/reviews')
    expect(screen.getByText(/That link does not go to Google\./)).toBeInTheDocument()
  })

  it('a link that is not Google’s is refused in words, and nothing is drawn', async () => {
    render(<ReviewCardMaker />)
    type('Your Google review link', 'https://www.yelp.com/writeareview/biz/acme')
    const field = screen.getByLabelText('Your Google review link')
    fireEvent.blur(field)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    const message = screen.getByText(/That link does not go to Google\./)
    expect(field.getAttribute('aria-describedby')).toContain(message.id)
    // Said politely: it is read when the reader is ready, not over their typing.
    expect(message).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Print the card' })).toBeDisabled()
    // Give a wrongly drawn code the time it would need to appear.
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('img', { name: /QR code/ })).toBeNull()
  })

  it('an empty link is a hint, not an error', () => {
    render(<ReviewCardMaker />)
    const field = screen.getByLabelText('Your Google review link')
    expect(field).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/does not look like a link|does not go to Google/)).toBeNull()
  })

  it('a Google link draws the code, and the card is in the practice’s name', async () => {
    const print = vi.fn()
    Object.defineProperty(window, 'print', { value: print, configurable: true, writable: true })
    render(<ReviewCardMaker />)
    type('Practice name', '  Maple   Street Dental ')
    type('Your Google review link', LINK)

    const preview = screen.getByRole('group', { name: 'Your card' })
    const code = await within(preview).findByRole('img', { name: 'QR code for your Google review link' })
    expect(code.querySelector('svg')).toBeTruthy()
    expect(within(preview).getByText(REVIEW_CARD_HEADLINES[0])).toBeInTheDocument()
    expect(within(preview).getByText(REVIEW_CARD_BODY)).toBeInTheDocument()
    expect(within(preview).getByText('Maple Street Dental')).toBeInTheDocument()

    const button = screen.getByRole('button', { name: 'Print the card' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('the headline is a choice, and the card follows it', async () => {
    render(<ReviewCardMaker />)
    type('Your Google review link', LINK)
    const preview = screen.getByRole('group', { name: 'Your card' })
    await within(preview).findByRole('img', { name: /QR code/ })
    fireEvent.click(screen.getByRole('radio', { name: REVIEW_CARD_HEADLINES[1] }))
    expect(within(preview).getByText(REVIEW_CARD_HEADLINES[1])).toBeInTheDocument()
    expect(within(preview).queryByText(REVIEW_CARD_HEADLINES[0])).toBeNull()
  })

  it('a card with no name prints no empty line where the name would be', async () => {
    render(<ReviewCardMaker />)
    type('Your Google review link', LINK)
    const preview = screen.getByRole('group', { name: 'Your card' })
    await within(preview).findByRole('img', { name: /QR code/ })
    expect(preview.querySelector('[data-card-name]')).toBeNull()
  })

  it('the sheet that prints holds as many cards as the format says, and is not read out twice', async () => {
    const { container } = render(<ReviewCardMaker />)
    type('Practice name', 'Maple Street Dental')
    type('Your Google review link', LINK)
    await screen.findByRole('img', { name: /QR code/ })

    const sheet = container.querySelector('[data-print-sheet]')!
    expect(sheet).toBeTruthy()
    // On screen it is hidden; the preview is what a person reads.
    expect(sheet).toHaveAttribute('aria-hidden', 'true')
    await waitFor(() => expect(sheet.querySelectorAll('[data-print-card]')).toHaveLength(1))
    expect(sheet.getAttribute('data-format')).toBe('sign')

    fireEvent.click(screen.getByRole('radio', { name: /^Handout cards/ }))
    await waitFor(() => expect(sheet.querySelectorAll('[data-print-card]')).toHaveLength(4))
    expect(sheet.getAttribute('data-format')).toBe('handouts')
    for (const card of Array.from(sheet.querySelectorAll('[data-print-card]'))) {
      expect(card.textContent).toContain(REVIEW_CARD_BODY)
      expect(card.textContent).toContain('Maple Street Dental')
      expect(card.querySelector('svg')).toBeTruthy()
    }
  })

  it('the code can be saved as a file named for the practice', async () => {
    render(<ReviewCardMaker />)
    type('Practice name', 'Maple Street Dental')
    type('Your Google review link', LINK)
    const link = await screen.findByRole('link', { name: 'Download the QR code (SVG)' })
    expect(link).toHaveAttribute('download', reviewCodeFileName('Maple Street Dental', 'svg'))
    expect(link.getAttribute('href')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain('<svg')
  })

  it('taking the link away takes the code away', async () => {
    render(<ReviewCardMaker />)
    type('Your Google review link', LINK)
    await screen.findByRole('img', { name: /QR code/ })
    type('Your Google review link', '')
    await waitFor(() => expect(screen.queryByRole('img', { name: /QR code/ })).toBeNull())
    expect(screen.getByRole('button', { name: 'Print the card' })).toBeDisabled()
  })
})

describe('the page', () => {
  const renderPage = () => {
    const utils = render(<ReviewCardPage />)
    return { ...utils, text: utils.container.textContent!.replace(/\s+/g, ' ') }
  }

  it('is a public page of the site: listed once, in the menu and in the footer', () => {
    expect(MARKETING_PUBLIC_PATHS as readonly string[]).toContain(PATH)
    expect(publicPages([]).filter((p) => p.path === PATH)).toHaveLength(1)
    const resources = MARKETING_NAV.find((n) => n.label === 'Resources')!
    expect(resources.children!.map((c) => c.href)).toContain(PATH)
    expect(FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href))).toContain(PATH)
  })

  it('its head says what it is, for a dental office, inside what a result shows', () => {
    expect(String(metadata.title)).toMatch(/Google review card/)
    expect(String(metadata.title)).toMatch(/dental/i)
    expect(String(metadata.description).length).toBeLessThanOrEqual(160)
    expect(String(metadata.description)).toMatch(/your browser/)
    expect(metadata.alternates?.canonical).toMatch(new RegExp(`${PATH}$`))
  })

  it('carries the maker, and one h1', () => {
    const { container } = renderPage()
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(screen.getByLabelText('Your Google review link')).toBeInTheDocument()
  })

  it('every line of Google’s help page is pinned, on the page, linked and dated', () => {
    const { container, text } = renderPage()
    expect(REVIEW_LINK_HELP.says).toEqual({
      purpose:
        'To make it easier for customers to leave reviews on your Business Profile, you can create and share a link or QR code to request reviews.',
      profile: 'Go to your Business Profile',
      readReviews: 'Read Reviews',
      getMore: 'Get more reviews',
      copy: 'To copy the review link, select Copy',
      desktopOnly: 'Currently, reviews QR codes can only be generated on a computer browser, not on mobile devices.',
      display: 'Print and display the QR code in your store',
      incentives:
        'Offering incentives, like free or discounted goods or services, to customers in exchange for reviews is considered fake engagement and is strictly prohibited.',
    })
    for (const [name, words] of Object.entries(REVIEW_LINK_HELP.says)) {
      expect(text, `${name}: not on the page`).toContain(words)
    }
    expect(REVIEW_LINK_HELP.source.url).toBe('https://support.google.com/business/answer/16816815')
    expect(REVIEW_LINK_HELP.source.readOn).toBe('2026-11-26')
    const link = container.querySelector(`a[href="${REVIEW_LINK_HELP.source.url}"]`)
    expect(link, 'the help page is not linked').toBeTruthy()
    expect(link!.getAttribute('rel') ?? '').toContain('nofollow')
    expect(text).toContain(`Read ${formatCheckedOn(REVIEW_LINK_HELP.source.readOn)}`)
  })

  it('the two policy lines the card obeys are quoted from the policy, linked and dated', () => {
    const { container, text } = renderPage()
    expect(text).toContain(REVIEW_RULES.googlePolicy.says.gating)
    expect(text).toContain(REVIEW_RULES.googlePolicy.says.pressure)
    const link = container.querySelector(`a[href="${REVIEW_RULES.googlePolicy.source.url}"]`)
    expect(link, 'the policy is not linked').toBeTruthy()
    expect(link!.getAttribute('rel') ?? '').toContain('nofollow')
    expect(text).toContain(`Read ${formatCheckedOn(REVIEW_RULES.googlePolicy.source.readOn)}`)
    expect(text).toMatch(/This is not legal advice/)
  })

  it('says whose it is not, and what it does with what is typed', () => {
    const { text } = renderPage()
    expect(text).toMatch(/not affiliated with Google/)
    expect(text).toMatch(/Nothing you type (?:on this page )?is sent/)
    // The code holds the practice's link and nothing of ours.
    expect(text).toMatch(/does not pass through us/)
  })

  it('answers the questions as structured data, and the same ones on the page', () => {
    const { container } = renderPage()
    const blocks = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) =>
      JSON.parse(s.textContent!),
    )
    const faq = blocks.flat().find((b) => b['@type'] === 'FAQPage')
    expect(faq, 'no FAQPage block').toBeTruthy()
    const questions: string[] = faq.mainEntity.map((q: { name: string }) => q.name)
    expect(questions.length).toBeGreaterThanOrEqual(5)
    expect(new Set(questions).size).toBe(questions.length)
    for (const q of questions) expect(screen.getByText(q), q).toBeInTheDocument()
    for (const entry of faq.mainEntity) {
      expect(entry.acceptedAnswer.text.length, entry.name).toBeGreaterThan(30)
      // A quotation in an answer is one of the pinned ones.
      for (const quoted of entry.acceptedAnswer.text.match(/“[^”]+”/g) ?? []) {
        const inner = quoted.slice(1, -1)
        const pinned = [...Object.values(REVIEW_LINK_HELP.says), ...Object.values(REVIEW_RULES.googlePolicy.says)]
        expect(pinned, `${entry.name}: “${inner}” is quoted and pinned nowhere`).toContain(inner)
      }
    }
    expect(blocks.flat().some((b) => b['@type'] === 'BreadcrumbList')).toBe(true)
  })

  it('promises no texting, and closes on the trial’s own words and the guide', () => {
    const { container, text } = renderPage()
    // The one sentence about texts is the honest one.
    for (const m of text.match(/[^.]*\btext messages?\b[^.]*\./gi) ?? []) {
      expect(m, m).toMatch(/does not send text messages today/)
    }
    const signup = Array.from(container.querySelectorAll('a[href="/signup"]'))
    expect(signup.some((a) => a.textContent === TRIAL.cta)).toBe(true)
    expect(container.querySelector('a[href="/resources/dental-review-request-templates"]')).toBeTruthy()
  })

  it('prints the cards and only the cards', () => {
    const { container } = renderPage()
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n')
    expect(css).toMatch(/@media print/)
    expect(css).toMatch(/\[data-print-sheet\]/)
    // Everything that is not the sheet steps aside: the site chrome and the page's own sections.
    expect(css).toMatch(/header/)
    expect(css).toMatch(/footer/)
    expect(css).toMatch(/\.no-print/)
    expect(container.querySelectorAll('.no-print').length).toBeGreaterThanOrEqual(3)
    // The maker is NOT inside a hidden wrapper, or the sheet could never print.
    expect(container.querySelector('[data-print-sheet]')!.closest('.no-print')).toBeNull()
  })
})

describe('what the page says the product does is what it does', () => {
  const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
  const pageText = () => render(<ReviewCardPage />).container.textContent!.replace(/\s+/g, ' ')
  /** A file's code with its comments taken out, so a comment cannot satisfy or trip a rule. */
  const codeOf = (path: string) =>
    source(path)
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join('\n')

  it('the close claims only what the review settings’ own defaults make true', () => {
    const text = pageText()
    const schema = source('lib/db/schema/clinic.ts')
    // "emails a review request when a visit is marked complete"
    expect(schema).toContain("autoSendEnabled: integer('auto_send_enabled').notNull().default(1)")
    expect(text).toMatch(/emails a review request when a visit is marked complete/)
    // "asks any one patient at most once a year"
    expect(schema).toContain("minDaysBetweenRequests: integer('min_days_between_requests').notNull().default(365)")
    expect(text).toMatch(/at most once a year/)
    // "Every patient is sent the same page: a button … and … a way to tell you privately"
    expect(schema).toContain("showPrivateFeedback: integer('show_private_feedback').notNull().default(1)")
    expect(schema).toContain("starGateEnabled: integer('star_gate_enabled').notNull().default(0)")
    expect(text).toMatch(/Every patient is sent the same page/)
  })

  it('the Share page the last answer names exists, prints this card, and gets its link where the answer says', () => {
    const text = pageText()
    expect(text).toContain(
      `Inside ${MARKETING.productName} the same card is on the Share page of the Website section, with your review link already in it once your Google listing is set up on the Reviews page.`,
    )
    // The page is there, and its review card is built from the shared wording.
    expect(existsSync(join(process.cwd(), 'app/(default)/website/share/page.tsx'))).toBe(true)
    const share = source('app/(default)/website/share/page.tsx')
    expect(share).toContain('buildShareCards(')
    expect(share).toContain("reviewPlatformUrl('google', reviewConfig)")
    expect(source('lib/share-cards.ts')).toContain('REVIEW_CARD_BODY')
    // And the listing's id is entered on the Reviews page, as the answer says.
    expect(existsSync(join(process.cwd(), 'app/(default)/growth/reviews/page.tsx'))).toBe(true)
    expect(source('app/(default)/growth/reviews/review-config-panel.tsx')).toContain('googlePlaceId')
    // "beside cards for online booking, your website and your patient portal"
    const builder = source('lib/share-cards.ts')
    for (const key of ["key: 'book'", "key: 'site'", "key: 'portal'"]) expect(builder).toContain(key)
  })

  it('quotes the price and the trial from the config', () => {
    const text = pageText()
    expect(text).toContain(`$${getQuotedPlan().price.toLocaleString('en-US')}/mo`)
    expect(text).toContain(`${TRIAL.days} days free`)
  })

  it('the maker makes no request and calls no server: its promise is checkable in its source', () => {
    const maker = codeOf('app/(marketing)/google-review-card/review-card-maker.tsx')
    for (const way of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'use server', 'runAction', './actions']) {
      expect(maker, `the maker reaches for ${way}`).not.toContain(way)
    }
    // The module it stands on is plain data and pure functions.
    expect(codeOf('lib/review-card.ts')).not.toMatch(/^import /m)
  })
})

describe('the review-request guide sends its reader here', () => {
  it('links the maker from the card on the counter, and that card is this wording', () => {
    const { container } = render(<ReviewRequestGuide />)
    expect(container.querySelector(`a[href="${PATH}"]`)).toBeTruthy()
    const card = Array.from(container.querySelectorAll('figure')).find((f) => /^Card ·/.test(f.querySelector('figcaption')?.textContent ?? ''))!
    expect(card.textContent).toContain(REVIEW_CARD_HEADLINES[0])
    expect(card.textContent).toContain(REVIEW_CARD_BODY)
  })
})
