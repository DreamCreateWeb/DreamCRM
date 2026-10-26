import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Stripe doors. Since S3 the Shop is OFF for every new clinic, so `/shop`
 * renders the generic intro card — no Stripe button on it — and even when
 * Shop is on, the hub is not the OAuth start. Three doors (Collections, the
 * automatic balance reminders card, the Integrations hub's Stripe card) all
 * sent a clinic there: a door behind a door, on the one setup step the whole
 * money workspace waits on. The real door is the Connect OAuth start,
 * returning to the page that sent it (S5's `back=`). Held at zero the way
 * no-coming-soon holds its class.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')

const DOORS = [
  'app/(default)/payments/collections/page.tsx',
  'app/(default)/payments/online/balance-outreach-card.tsx',
  'app/(default)/integrations/page.tsx',
]

describe('Stripe doors open the Connect OAuth start, never /shop', () => {
  for (const rel of DOORS) {
    it(`${rel} has no href to /shop`, () => {
      const code = stripComments(read(rel))
      expect(code).not.toMatch(/href=["'{`]\/shop["'`]|href="\/shop"|'\/shop'\s*\}/)
      expect(code).toMatch(/\/api\/connect\/shop\/start\?back=(payments|integrations)/)
    })
  }

  it('the catalog’s Stripe card manages from Payments, not the storefront', () => {
    const code = stripComments(read('lib/integrations/catalog.ts'))
    const stripe = code.slice(code.indexOf("id: 'stripe_connect'"))
    expect(stripe.slice(0, 1200)).toMatch(/valueLinks: \[\{ href: '\/payments', label: 'Payments' \}\]/)
  })

  it('Collections and the reminders card hide the connect link from members (the start route would 403 nobody, but only an owner should be told to connect)', () => {
    for (const rel of DOORS.slice(0, 2)) {
      const code = stripComments(read(rel))
      expect(code).toMatch(/canManage\s*\?/)
      expect(code).toMatch(/ask an owner/i)
    }
  })
})
