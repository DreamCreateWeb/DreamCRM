import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_CLINIC_SLUG } from '@/lib/services/demo-constants'

/**
 * The production watch sweep loads one real clinic site every 30 minutes, and
 * the only place it can learn which one is `docs/OPS.md` — a clinic slug is
 * production data, so nothing else in the repo carries it. That pin is a URL
 * written by hand in prose, which means it rots the moment either half of it
 * moves: the demo slug (`DEMO_CLINIC_SLUG`) or the production host (`BASE_URL`
 * in the cron-schedule script). Then the sweep quietly checks a 404 and reports
 * the site is down, or checks nothing at all.
 *
 * So: the doc's URL must be assembled from the two constants that are actually
 * true. Move one, and this tells you to move the doc in the same PR.
 */

const OPS_DOC = 'docs/OPS.md'

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

/** Every `https://<host>/site/<slug>` URL the ops doc pins. */
function pinnedPathUrls(doc: string): { host: string; slug: string }[] {
  return Array.from(doc.matchAll(/https:\/\/([a-z0-9.-]+)\/site\/([a-z0-9-]+)/g)).map((m) => ({
    host: m[1],
    slug: m[2],
  }))
}

/** Every `https://<slug>.<host>` clinic-subdomain URL the ops doc pins. */
function pinnedSubdomainUrls(doc: string, bareHost: string): string[] {
  const escaped = bareHost.replace(/\./g, '\.')
  return Array.from(doc.matchAll(new RegExp(`https://([a-z0-9-]+)\.${escaped}`, 'g'))).map((m) => m[1])
}

/** `BASE_URL="https://www.dreamcreatestudio.com"` from the cron-schedule script. */
function productionHost(): string {
  const script = read('scripts/setup-cron-schedules.sh')
  const m = script.match(/^BASE_URL="https:\/\/([a-z0-9.-]+)"/m)
  expect(m, 'scripts/setup-cron-schedules.sh no longer pins BASE_URL in the expected shape').toBeTruthy()
  return m![1]
}

describe('ops doc pins a live clinic-site URL', () => {
  it('pins at least one /site/<slug> URL for the sweep to load', () => {
    const urls = pinnedPathUrls(read(OPS_DOC))
    expect(
      urls.length,
      `${OPS_DOC} must pin a production clinic-site URL (https://<host>/site/<slug>) — that line is the ` +
        `only way the production watch sweep can check a real patient-facing page instead of only the homepage.`,
    ).toBeGreaterThan(0)
  })

  it('every pinned /site/<slug> URL uses the demo slug and the production host', () => {
    const host = productionHost()
    for (const url of pinnedPathUrls(read(OPS_DOC))) {
      expect(
        url.slug,
        `${OPS_DOC} pins /site/${url.slug}, but DEMO_CLINIC_SLUG is now '${DEMO_CLINIC_SLUG}'. The demo clinic ` +
          `is the only clinic site every deploy re-seeds; update the doc to match the constant.`,
      ).toBe(DEMO_CLINIC_SLUG)
      expect(
        url.host,
        `${OPS_DOC} pins host '${url.host}', but scripts/setup-cron-schedules.sh pins BASE_URL host '${host}'. ` +
          `The sweep would be checking a different origin than production.`,
      ).toBe(host)
    }
  })

  it('the subdomain form of the pinned URL uses the same slug', () => {
    const bareHost = productionHost().replace(/^www\./, '')
    const subdomains = pinnedSubdomainUrls(read(OPS_DOC), bareHost).filter((s) => s !== 'www')
    expect(
      subdomains.length,
      `${OPS_DOC} no longer pins the subdomain form (https://<slug>.${bareHost}) of the clinic site.`,
    ).toBeGreaterThan(0)
    for (const slug of subdomains) {
      expect(
        slug,
        `${OPS_DOC} pins the subdomain '${slug}.${bareHost}', but DEMO_CLINIC_SLUG is now '${DEMO_CLINIC_SLUG}'.`,
      ).toBe(DEMO_CLINIC_SLUG)
    }
  })
})
