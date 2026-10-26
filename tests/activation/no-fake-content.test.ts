import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * NO FAKE CONTENT (CLAUDE.md) + "nothing may promise what it cannot do".
 * `/community/profile` was the Mosaic template's social-profile demo —
 * invented people, a lorem-ipsum bio, six stock headshots — reachable by any
 * signed-in user inside the clinic's own chrome. It is deleted; this holds
 * the class at zero: no lorem ipsum, none of the template's stock names,
 * none of its stock image files, and every authenticated page checks who is
 * asking (a tenant read or a redirect) before it renders.
 */
const ROOTS = ['app/(default)', 'app/(double-sidebar)', 'components']

function walk(dir: string, out: string[]) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
}

const STOCK_NAMES = /Carolyn McNeail|Simona Lürwer|Mary Roszczewski|Acme Inc\./
const LOREM = /lorem ipsum/i

describe('no fake content in the dashboard trees', () => {
  const files: string[] = []
  for (const root of ROOTS) walk(join(process.cwd(), root), files)

  it('holds lorem ipsum and the template’s stock people at zero', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      if (LOREM.test(src) || STOCK_NAMES.test(src)) offenders.push(relative(process.cwd(), file))
    }
    expect(offenders, 'a dashboard file carries placeholder people or lorem ipsum — every UI placeholder reads a real column').toEqual([])
  })

  it('the Mosaic community demo and its stock images are gone', () => {
    expect(existsSync(join(process.cwd(), 'app/(double-sidebar)/community'))).toBe(false)
    for (const img of [
      'user-avatar-32.png', 'user-128-01.jpg', 'profile-bg.jpg', 'icon-02.svg', 'icon-03.svg',
      'avatar-01.jpg', 'avatar-02.jpg', 'avatar-03.jpg', 'avatar-04.jpg', 'avatar-05.jpg', 'avatar-06.jpg',
      'user-32-01.jpg', 'user-32-02.jpg', 'user-32-03.jpg', 'user-32-04.jpg', 'user-32-05.jpg', 'user-32-06.jpg', 'user-32-08.jpg',
    ]) {
      expect(existsSync(join(process.cwd(), 'public/images', img)), img).toBe(false)
    }
    // No component imports a stock headshot as the profile avatar any more.
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), relative(process.cwd(), file)).not.toMatch(/public\/images\/(user-avatar-32|user-\d+-\d+|avatar-\d+)/)
    }
  })

  it('every authenticated page.tsx resolves the tenant (or redirects) before rendering', () => {
    const pages: string[] = []
    for (const root of ['app/(default)', 'app/(double-sidebar)']) walk(join(process.cwd(), root), pages)
    const offenders = pages
      .filter((p) => p.endsWith('/page.tsx'))
      .filter((p) => {
        const src = readFileSync(p, 'utf8')
        return !/requireTenant|getTenantContext|requireUser|requireRole|requirePlatformAdmin|requirePartner|(permanent)?[rR]edirect\(/.test(src)
      })
      .map((p) => relative(process.cwd(), p))
    expect(offenders, 'an authenticated page renders without asking who is looking — add a tenant read or make it a redirect stub').toEqual([])
  })
})
