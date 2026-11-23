import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * THE PRIVACY POLICY AND THE TERMS OF SERVICE.
 *
 * Published 2026-11-23 at the owner's direction — a paid-search campaign
 * cannot launch without them, and a trial that bills a card when it ends
 * needs its terms written somewhere a customer can point to. They are DATA
 * (`lib/marketing/legal.ts`), which is what makes the rules below checkable.
 *
 * WHAT IS HELD, each because it is a way a legal page goes wrong quietly:
 *
 *  1. NO COMPLIANCE CLAIM (docs/COMPLIANCE.md). The product makes none
 *     anywhere; a policy page is the worst place to start. The vocabulary is
 *     held at zero over every sentence of both documents.
 *  2. THE FIGURES ARE RESOLVED. The trial's length, the two prices and the
 *     cookie lifetimes are the constants the product runs on, so the Terms
 *     cannot promise a trial the checkout does not give.
 *  3. THE TERMS MATCH THE TRIAL AS BUILT: card required, nothing charged
 *     during it, charged when it ends, cancel before then and pay nothing,
 *     reminded first.
 *  4. EVERY COMPANY THE PRODUCT SENDS INFORMATION TO IS NAMED, from one list.
 *  5. THE PAGES ARE REACHABLE: public routes, linked from the footer of every
 *     marketing page, from the signup form and from the card step.
 *
 * What this file CANNOT hold is whether the documents are legally sufficient.
 * Nobody qualified has read them; the header of `lib/marketing/legal.ts` says
 * which clauses most need it.
 */

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import {
  LEGAL_DOCS,
  LEGAL_UPDATED,
  OPERATOR,
  PRIVACY_POLICY,
  SERVICE_PROVIDERS,
  TERMS_OF_SERVICE,
  formatLegalDate,
  type LegalDoc,
} from '@/lib/marketing/legal'
import { LegalPage } from '@/app/(marketing)/legal-page'
import { MarketingFooter } from '@/components/marketing/ui'
import { LEGAL_LINKS, MARKETING_PUBLIC_PATHS, TRIAL, usd } from '@/lib/marketing/site'
import { ATTRIBUTION_COOKIE, ATTRIBUTION_COOKIE_MAX_AGE_SECONDS } from '@/lib/marketing-attribution'
import { getQuotedPlan } from '@/lib/stripe-config'
import { TRIAL_DAYS } from '@/lib/trial'

const ROOT = resolve(__dirname, '../..')

/** Every sentence a reader of the document sees. */
function sentences(doc: LegalDoc): string[] {
  return [
    doc.title,
    doc.summary,
    ...doc.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? []), ...(s.after ?? [])]),
  ]
}
const text = (doc: LegalDoc) => sentences(doc).join('\n')

describe('rule 1 — neither document makes a compliance claim', () => {
  const CLAIM =
    /hipaa|\bcompliant\b|\bcompliance\b|\bcertified\b|\bcertification\b|soc ?2|bank[- ]level|military[- ]grade|secure patient data|\bguarantee/i

  for (const doc of LEGAL_DOCS) {
    it(`${doc.title}: none of the words that would read as one`, () => {
      for (const s of sentences(doc)) expect(s, s).not.toMatch(CLAIM)
    })
  }

  it('the matcher sees the phrases it exists for', () => {
    for (const bad of ['HIPAA compliant', 'we are SOC 2 certified', 'bank-level security', 'we guarantee', 'secure patient data']) {
      expect(CLAIM.test(bad), bad).toBe(true)
    }
    // …and not the plain facts the policy does state.
    for (const ok of ['Connections to the service are encrypted (HTTPS), and the database is encrypted at rest.', 'the health-privacy and other laws that apply to your practice']) {
      expect(CLAIM.test(ok), ok).toBe(false)
    }
  })

  it('the Terms say whose duty the health-privacy laws are, and state that they claim nothing', () => {
    const t = text(TERMS_OF_SERVICE)
    expect(t).toMatch(/You are responsible for .* meeting the health-privacy and other laws that apply to your practice/)
    expect(t).toContain('These terms do not state that using the service satisfies any particular legal or regulatory requirement')
  })

  it('neither document promises texting, which is not live', () => {
    for (const doc of LEGAL_DOCS) expect(text(doc)).not.toMatch(/\bsms\b|text[- ]messag|\btexting\b|\btext your\b/i)
  })
})

describe('rules 2 and 3 — the Terms state the trial and the price as built', () => {
  const t = text(TERMS_OF_SERVICE)
  const plan = getQuotedPlan()

  it('the length is the number Stripe is given, and the prices are the plan’s own', () => {
    expect(t).toContain(`A new practice starts with a ${TRIAL_DAYS}-day free trial.`)
    expect(t).toContain(`currently ${usd(plan.price)} a month, or ${usd(plan.annualPrice)} a year`)
    // No other dollar figure, typed or otherwise.
    for (const figure of t.match(/\$[\d,]+/g) ?? []) {
      expect([usd(plan.price), usd(plan.annualPrice)], figure).toContain(figure)
    }
    expect(TRIAL.days).toBe(TRIAL_DAYS)
  })

  it('a card is required, nothing is charged during the trial, and it is charged when the trial ends', () => {
    expect(t).toContain('A payment card is required to start it. Nothing is charged during the trial.')
    expect(t).toMatch(/When the trial ends, your subscription begins and the card is charged/)
    expect(t).not.toMatch(/no[- ]?(credit[- ])?card/i)
  })

  it('cancelling during the trial costs nothing, by the page’s real name, and reminders come first', () => {
    expect(t).toContain('You can cancel at any time during the trial from Settings → Plan & billing, and if you do, you are not charged.')
    // The schedule the reminder sweep keeps for a card-on-file trial.
    expect(t).toContain('a reminder about a week before the trial ends and again the day before')
    expect(t).toContain('There is one free trial for each practice.')
  })

  it('renewal and cancellation are described as the product behaves', () => {
    expect(t).toMatch(/renews automatically at the start of each billing period/)
    expect(t).toMatch(/Cancelling stops the next renewal; you keep access for the period you have already paid for/)
    expect(t).toMatch(/access to the dashboard stops, your public website shows a holding page, and automated messages stop/)
  })
})

describe('rule 2 — the Privacy Policy quotes the cookies as the middleware sets them', () => {
  const p = text(PRIVACY_POLICY)

  it('the attribution cookie’s name and lifetime are the constants', () => {
    const days = Math.round(ATTRIBUTION_COOKIE_MAX_AGE_SECONDS / 86_400)
    expect(p).toContain(`one first-party cookie (${ATTRIBUTION_COOKIE}, kept for ${days} days)`)
    expect(p).toContain(`${ATTRIBUTION_COOKIE} — how you first found us, described above. First-party, ${days} days.`)
  })

  it('the partner cookie’s name and thirty days are what middleware.ts writes', () => {
    expect(p).toContain('partner_ref — set for 30 days')
    const mw = readFileSync(join(ROOT, 'middleware.ts'), 'utf8')
    expect(mw).toMatch(/res\.cookies\.set\('partner_ref', ref, \{\s*maxAge: 30 \* 24 \* 60 \* 60,/)
  })

  it('says what is NOT done: no sale, no patient advertising, no third-party trackers', () => {
    expect(p).toContain('We do not sell personal information.')
    expect(p).toContain('We do not sell patient information and we do not use it to advertise to patients.')
    expect(p).toContain('We do not run third-party advertising or analytics trackers on this site.')
  })

  it('…and the marketing layout, where one would be added, loads none', () => {
    // One named file, not a walk: this is where a tag manager or an analytics
    // snippet lands when somebody adds one, and the day it does the sentence
    // above is false.
    const layout = readFileSync(join(ROOT, 'app/(marketing)/layout.tsx'), 'utf8')
    expect(layout).not.toMatch(
      /googletagmanager|google-analytics|gtag\(|connect\.facebook|facebook\.net|plausible\.io|posthog|hotjar|clarity\.ms|segment\.com|linkedin\.com\/px/i,
    )
  })
})

describe('rule 4 — every company information is sent to is named', () => {
  it('the policy lists each provider on the one list, with what it does', () => {
    const p = text(PRIVACY_POLICY)
    expect(SERVICE_PROVIDERS.length).toBeGreaterThan(5)
    for (const provider of SERVICE_PROVIDERS) {
      expect(p, provider.name).toContain(`${provider.name} — ${provider.does}.`)
    }
  })

  it('the list covers the providers the product is built on', () => {
    const names = SERVICE_PROVIDERS.map((p) => p.name)
    for (const expected of ['Amazon Web Services', 'Stripe', 'Resend', 'Anthropic', 'Google', 'Zernio', 'NexHealth', 'Stedi', 'name.com']) {
      expect(names, expected).toContain(expected)
    }
  })

  it('says plainly that AI features send the content they work on to the AI provider', () => {
    const p = text(PRIVACY_POLICY)
    expect(p).toMatch(/the content it is asked to work on is sent to our AI provider to produce the result/)
  })
})

describe('who is responsible, and when it was written', () => {
  for (const doc of LEGAL_DOCS) {
    it(`${doc.title} names the operator, the postal address and the contact address`, () => {
      const t = text(doc)
      expect(t).toContain(OPERATOR.business)
      expect(t).toContain(OPERATOR.person)
      expect(t).toContain(`${OPERATOR.street}, ${OPERATOR.cityLine}`)
      expect(t).toContain(OPERATOR.email)
      expect(doc.updated).toBe(LEGAL_UPDATED)
    })
  }

  it('the date renders from the string alone', () => {
    expect(formatLegalDate('2026-11-23')).toBe('November 23, 2026')
    expect(formatLegalDate('2027-01-05')).toBe('January 5, 2027')
  })
})

describe('rule 5 — the pages render and are reachable', () => {
  for (const doc of LEGAL_DOCS) {
    it(`${doc.path} renders its title, its date, every section, and a way to the other document`, () => {
      const { container, unmount } = render(<LegalPage doc={doc} />)
      expect(screen.getByRole('heading', { level: 1, name: doc.title })).toBeInTheDocument()
      expect(container).toHaveTextContent(`Last updated ${formatLegalDate(doc.updated)}`)
      const h2s = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
      expect(h2s).toEqual(doc.sections.map((s) => s.heading))
      // Each section is addressable.
      for (const s of doc.sections) expect(container.querySelector(`#${s.id}`), s.id).toBeTruthy()
      for (const other of LEGAL_DOCS.filter((d) => d.path !== doc.path)) {
        expect(screen.getByRole('link', { name: other.title })).toHaveAttribute('href', other.path)
      }
      unmount()
    })
  }

  it('section ids are unique within a document', () => {
    for (const doc of LEGAL_DOCS) {
      const ids = doc.sections.map((s) => s.id)
      expect(new Set(ids).size, doc.title).toBe(ids.length)
    }
  })

  it('both routes are public — the same list the middleware and the sitemap read', () => {
    for (const doc of LEGAL_DOCS) expect(MARKETING_PUBLIC_PATHS as readonly string[]).toContain(doc.path)
    expect(LEGAL_LINKS.map((l) => l.href).sort()).toEqual(LEGAL_DOCS.map((d) => d.path).sort())
  })

  it('every marketing page’s footer links to both', () => {
    render(<MarketingFooter />)
    const legal = screen.getByRole('navigation', { name: 'Legal' })
    for (const l of LEGAL_LINKS) {
      const link = Array.from(legal.querySelectorAll('a')).find((a) => a.getAttribute('href') === l.href)
      expect(link, l.href).toBeTruthy()
      expect(link!.textContent).toBe(l.label)
    }
  })

  it('the signup form says what creating an account agrees to, and the card step links the Terms', () => {
    const signup = readFileSync(join(ROOT, 'app/(auth)/signup/signup-form.tsx'), 'utf8')
    expect(signup).toMatch(/By creating an account you agree to the/)
    expect(signup).toContain('href="/terms"')
    expect(signup).toContain('href="/privacy"')
    const cardStep = readFileSync(join(ROOT, 'app/(onboarding)/onboarding-complete/page.tsx'), 'utf8')
    expect(cardStep).toMatch(/The trial and your subscription run on the/)
    expect(cardStep).toContain('href="/terms"')
  })
})
