import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, sep } from 'node:path'

/**
 * A PUBLIC CLINIC-SITE ACTION RESOLVES ITS OWN TENANT.
 *
 * Everything under `app/site/[slug]/**` is unauthenticated: whoever calls it
 * chose every argument. An organization id in that argument list is therefore
 * not a tenant scope — it is an invitation to pick a victim.
 * `submitContactRequest` and the insurance verifier already say so in as many
 * words ("resolve the org from the PUBLIC slug, never a client-posted
 * orgId"). The insurance-card scanner did not, and because each of its calls
 * spends real money from a per-clinic monthly cap, anyone who could upload an
 * image could drain an ARBITRARY practice's allowance.
 *
 * The rule frozen here: no exported action in that tree DECLARES an org-id
 * parameter, unless it is listed below with a reason. What it may take is a
 * slug, a token, or an entity id it re-validates against the org it resolved
 * — all of which cost the action a lookup before it can act.
 *
 * Red run (2026-09-14): restoring `readInsuranceCardAction(orgId: string, …)`
 * failed case 2 naming `app/site/[slug]/intake/[formSlug]/actions.ts`, and
 * dropping the `rateLimitPublicAction` call failed case 3. Both watched
 * failing, then restored.
 */

const PUBLIC_ACTION_ROOT = 'app/site'

/**
 * A DECLARATION of an org id — `orgId: string`, `organizationId?: string`,
 * `orgId: z.string()`. Deliberately not `organizationId: orgId,`, which is a
 * service call being handed a value the action already resolved.
 */
const ORG_ID_DECLARATION = /^\s*_?(?:org|organization)Id\s*\??\s*:\s*(?:string|z\.)/i

/**
 * Pre-existing and NOT closed by this pass — each is its own call, and
 * bundling them into a scanner fix would have meant one verdict over several
 * defects. Written up as their own ledger line in `docs/RELEASE.md` Part 5.
 */
const ALLOWED: Array<{ file: string; why: string }> = [
  {
    file: 'app/site/[slug]/actions.ts',
    why: '`listBookingSlots` reads public availability — no write, no spend, and the same slots the page already renders',
  },
  {
    file: 'app/site/[slug]/intake/[formSlug]/actions.ts',
    why: '`submitIntakeForm` re-validates the templateId against the posted org, so a submission can only land on a form that org really owns; spends nothing',
  },
  {
    file: 'app/site/[slug]/intake-start/actions.ts',
    why: '`linkUserToClinicAsPatient` re-reads the org and requires a signed-in session; it links the CALLER to a clinic whose public page already offers that',
  },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/** Comments scope nothing — a doc comment naming a helper adopts it not. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function publicActionFiles(): Array<{ path: string; src: string }> {
  const root = process.cwd()
  return walk(resolve(root, PUBLIC_ACTION_ROOT))
    .map((f) => ({ path: f.slice(root.length + 1).split(sep).join('/'), src: readFileSync(f, 'utf8') }))
    .filter(({ src }) => /^\s*'use server'/m.test(src))
}

describe('public clinic-site server actions resolve their own tenant', () => {
  it('the scanner still finds the public action files', () => {
    // A guard that matches nothing passes forever.
    const paths = publicActionFiles().map((f) => f.path)
    expect(paths).toContain('app/site/[slug]/actions.ts')
    expect(paths).toContain('app/site/[slug]/intake/[formSlug]/actions.ts')
  })

  it('no unlisted action declares an organization id the caller supplies', () => {
    const allowed = new Set(ALLOWED.map((a) => a.file))
    const offenders: string[] = []
    for (const { path, src } of publicActionFiles()) {
      if (allowed.has(path)) continue
      code(src)
        .split('\n')
        .forEach((line, i) => {
          if (ORG_ID_DECLARATION.test(line)) offenders.push(`${path}:${i + 1} — ${line.trim()}`)
        })
    }
    expect(
      offenders,
      'A public action cannot be handed its tenant. Resolve it with ' +
        'resolveClinicOrgIdBySlug from the slug the page was served under, or ' +
        'add an entry to ALLOWED with the reason it is safe here.',
    ).toEqual([])
  })

  it('the insurance-card scanner takes a slug, never an org id', () => {
    // The allowlist entry above covers `submitIntakeForm`'s own `Input`, so
    // this asserts the scanner's OWN signature rather than relying on it.
    const src = code(
      readFileSync(resolve(process.cwd(), 'app/site/[slug]/intake/[formSlug]/actions.ts'), 'utf8'),
    )
    const signature = src.slice(
      src.indexOf('export async function readInsuranceCardAction'),
      src.indexOf('export async function readInsuranceCardAction') + 240,
    )
    expect(signature).not.toMatch(ORG_ID_DECLARATION)
    expect(src).toMatch(
      /import\s*\{[^}]*resolveClinicOrgIdBySlug[^}]*\}\s*from\s*'@\/lib\/services\/clinic-site'/,
    )
    expect(src).toMatch(/resolveClinicOrgIdBySlug\(/)
  })

  it('the insurance-card scanner is rate-limited like every other public action', () => {
    // It was the one exception, and it is the one that spends money per call.
    const src = code(
      readFileSync(resolve(process.cwd(), 'app/site/[slug]/intake/[formSlug]/actions.ts'), 'utf8'),
    )
    expect(src).toMatch(
      /import\s*\{[^}]*rateLimitPublicAction[^}]*\}\s*from\s*'@\/lib\/services\/rate-limit'/,
    )
    expect(src).toMatch(/rateLimitPublicAction\(\s*'insurance_ocr'/)
  })
})
