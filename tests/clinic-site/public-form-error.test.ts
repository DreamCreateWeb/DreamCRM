import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  PublicFormError,
  publicFormFailure,
  PUBLIC_FORM_UNAVAILABLE_MESSAGE,
} from '@/lib/services/public-form-error'

/**
 * The patient-facing half of the split `lib/services/checkout-error.ts` already
 * made on the money side.
 *
 * A public form action used to signal every refusal by THROWING — and in
 * production Next.js replaces a server-action error message with an opaque
 * digest, so "that slot is no longer available — please pick another time"
 * reached the patient as "An error occurred in the Server Components render".
 * The one piece of information that would have told them what to do next was
 * exactly the piece that got eaten.
 *
 * `publicFormFailure` draws the line: a message we WROTE for the patient is
 * shown; anything else is logged server-side and replaced with something true
 * and actionable.
 */

describe('publicFormFailure', () => {
  let logged: unknown[][]
  beforeEach(() => {
    logged = []
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      logged.push(a)
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a message written FOR the patient, verbatim', () => {
    const res = publicFormFailure(
      'clinic-site.booking',
      new PublicFormError('That slot is no longer available — please pick another time.'),
    )
    expect(res).toEqual({
      ok: false,
      error: 'That slot is no longer available — please pick another time.',
    })
    expect(logged).toHaveLength(0)
  })

  it('never shows an internal failure — it logs it and says something actionable', () => {
    const res = publicFormFailure('clinic-site.contact', new Error('connect ECONNREFUSED 10.0.3.7:5432'))
    expect(res).toEqual({ ok: false, error: PUBLIC_FORM_UNAVAILABLE_MESSAGE })
    expect(res.error).not.toContain('ECONNREFUSED')
    // The real thing is still where staff can find it.
    expect(logged).toHaveLength(1)
    expect(String(logged[0][0])).toContain('clinic-site.contact')
  })

  it('the patient-facing fallback says nothing was saved and offers the phone', () => {
    expect(PUBLIC_FORM_UNAVAILABLE_MESSAGE).toMatch(/nothing was saved/i)
    expect(PUBLIC_FORM_UNAVAILABLE_MESSAGE).toMatch(/call/i)
  })

  it('treats a non-Error throw as internal rather than showing it', () => {
    expect(publicFormFailure('x', 'some string').error).toBe(PUBLIC_FORM_UNAVAILABLE_MESSAGE)
    expect(publicFormFailure('x', { message: 'looks like an error' }).error).toBe(
      PUBLIC_FORM_UNAVAILABLE_MESSAGE,
    )
  })

  it('a PublicFormError survives being rethrown through an async boundary', async () => {
    // instanceof is the whole gate — if a bundler ever produced two copies of
    // the class, every patient message would silently become the generic one.
    const thrown = await (async () => {
      try {
        await Promise.reject(new PublicFormError('Please tell us your name'))
      } catch (e) {
        return e
      }
    })()
    expect(publicFormFailure('x', thrown).error).toBe('Please tell us your name')
  })
})

// ── Adoption guard ───────────────────────────────────────────────────────────

/**
 * The actions below are reached by an unauthenticated (or patient) browser, so
 * a `throw` in any of them is a message the patient never sees. This guard
 * fails the moment one of them throws a bare Error again, or stops returning a
 * result shape.
 */
const PUBLIC_FORM_ACTION_FILES = [
  'app/site/[slug]/actions.ts',
  'app/site/[slug]/intake/[formSlug]/actions.ts',
  'app/(portal)/patient/intake/actions.ts',
  // Not in the DREAMCRM-24 write-up — this guard found it.
  'app/site/[slug]/intake-start/actions.ts',
]

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('public form actions return their refusals', () => {
  it.each(PUBLIC_FORM_ACTION_FILES)('%s throws no bare Error', (file) => {
    const src = code(readFileSync(join(process.cwd(), file), 'utf8'))
    const bare = src.match(/throw new Error\([^\n]*/g) ?? []
    expect(
      bare,
      `A thrown message is replaced by an opaque digest in production. Throw ` +
        `PublicFormError (lib/services/public-form-error.ts) and let the exported ` +
        `action return publicFormFailure(...).`,
    ).toEqual([])
  })

  it.each(PUBLIC_FORM_ACTION_FILES)('%s imports the shared split', (file) => {
    const src = code(readFileSync(join(process.cwd(), file), 'utf8'))
    expect(src).toMatch(/from\s*'@\/lib\/services\/public-form-error'/)
    expect(src).toContain('publicFormFailure(')
  })

  it('every exported form action in those files returns a result, never void', () => {
    const offenders: string[] = []
    for (const file of PUBLIC_FORM_ACTION_FILES) {
      const src = code(readFileSync(join(process.cwd(), file), 'utf8'))
      const decls = Array.from(src.matchAll(/export async function (\w+)\(([\s\S]*?)\):\s*([^{]+)\{/g))
      for (const m of decls) {
        const [, name, , ret] = m
        if (!/^(submit|linkUserToClinic)/.test(name)) continue
        if (!/PublicFormResult/.test(ret)) offenders.push(`${file}#${name} → ${ret.trim()}`)
      }
    }
    expect(
      offenders,
      'A submit action that returns void or a bare value has no way to tell the ' +
        'patient why it refused.',
    ).toEqual([])
  })

  it('the scanner actually found the actions (it did not silently match nothing)', () => {
    const names = PUBLIC_FORM_ACTION_FILES.flatMap((file) =>
      Array.from(
        code(readFileSync(join(process.cwd(), file), 'utf8')).matchAll(
          /export async function ((?:submit|linkUserToClinic)\w*)\(/g,
        ),
      ).map((m) => m[1]),
    )
    expect(names.sort()).toEqual([
      'linkUserToClinicAsPatient',
      'submitAppointmentRequest',
      'submitBookingRequest',
      'submitChatMessage',
      'submitContactRequest',
      'submitIntakeForm',
      'submitPatientIntakeAction',
    ])
  })
})

// The client components are the other half: an action that returns its refusal
// is no use if the caller still reads `err.message`.
describe('public form clients read the result, not a thrown message', () => {
  const CLIENTS = [
    'app/site/[slug]/contact-form.tsx',
    'app/site/[slug]/book/request-form.tsx',
    'app/site/[slug]/book/book-form.tsx',
    'components/clinic-site/site-chat-widget.tsx',
    'app/site/[slug]/intake/[formSlug]/intake-form-runner.tsx',
    'app/site/[slug]/intake-start/intake-start-form.tsx',
  ]

  it.each(CLIENTS)('%s does not surface err.message to the patient', (file) => {
    const src = code(readFileSync(join(process.cwd(), file), 'utf8'))
    // `err instanceof Error ? err.message : …` was the exact shape that rendered
    // the digest on a public clinic page.
    expect(src).not.toMatch(/err\s+instanceof\s+Error\s*\?\s*err\.message/)
  })

  it.each(CLIENTS)('%s branches on the result', (file) => {
    const src = code(readFileSync(join(process.cwd(), file), 'utf8'))
    expect(src).toMatch(/if\s*\(!\s*res\.ok\s*\)/)
  })

  it('no OTHER client under the public site still renders a thrown action message', () => {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.next') continue
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.tsx?$/.test(full)) out.push(full)
      }
    }
    walk(join(process.cwd(), 'app', 'site'))
    walk(join(process.cwd(), 'components', 'clinic-site'))
    const offenders = out
      .filter((f) => /err\s+instanceof\s+Error\s*\?\s*err\.message/.test(code(readFileSync(f, 'utf8'))))
      .map((f) => relative(process.cwd(), f).split('\\').join('/'))
    expect(
      offenders,
      'On a public clinic page `err.message` from a server action is an opaque ' +
        'digest in production. Return { ok, error } and read res.error.',
    ).toEqual([])
  })
})
