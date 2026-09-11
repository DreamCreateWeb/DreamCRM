import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Adoption guard: `lib/attachment-hosts.ts` is the ONLY place the repo decides
 * whether a URL points at storage we own.
 *
 * The insurance-OCR path had two hand-rolled versions of that decision and one
 * missing one. The public site intake action matched the bucket name as a
 * SUBSTRING of the host (`mybucket.attacker.example` passed) and otherwise
 * waved through anything ending `.amazonaws.com` — every public S3 bucket on
 * the internet. The patient portal had no host check at all. The service itself
 * filtered on `/^https?:\/\//` only.
 *
 * The unit tests in `insurance-ocr.test.ts` prove the service now refuses a
 * foreign host. This guard is the other half: it fails the moment a NEW hand-
 * rolled host check appears, because the next one will be wrong in a different
 * way and no unit test will be watching that call site.
 */

const SHARED = 'lib/attachment-hosts.ts'

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(full)) out.push(full)
    }
  }
  for (const base of ['app', 'components', 'lib']) walk(join(process.cwd(), base))
  return out
}

function repoPath(absolute: string): string {
  return relative(process.cwd(), absolute).split('\\').join('/')
}

/**
 * Comments do not adopt anything. The red run for this guard passed the
 * "every entry point filters through the shared allowlist" check while the
 * hand-rolled filter was live, purely because the doc comment above it named
 * `isAllowedAttachmentUrl` — so every source check below reads CODE only.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * A hand-rolled "is this our storage?" test: a host/hostname compared against
 * `.amazonaws.com`, a bucket env, or the Vercel Blob suffix. The shared module
 * is the one legitimate home for all three.
 */
const HAND_ROLLED = [
  /\.(?:host|hostname)\b[^\n]*\b(?:endsWith|includes|indexOf|startsWith)\s*\(\s*[^)\n]*(?:amazonaws|vercel-storage|S3_BUCKET)/,
  /(?:endsWith|includes)\s*\(\s*['"`][^'"`\n]*(?:\.amazonaws\.com|\.public\.blob\.vercel-storage\.com)['"`]\s*\)/,
]

describe('shared attachment-host allowlist adoption', () => {
  it('the scanner still sees the source tree (it did not silently break)', () => {
    expect(sourceFiles().length).toBeGreaterThan(500)
  })

  it('no file re-implements the storage-host check outside the shared module', () => {
    const offenders = sourceFiles()
      .map((f) => [repoPath(f), readFileSync(f, 'utf8')] as const)
      .filter(([path]) => path !== SHARED)
      .filter(([, src]) => HAND_ROLLED.some((re) => re.test(code(src))))
      .map(([path]) => path)
    expect(
      offenders,
      'These files decide "is this URL on our storage?" themselves. A substring or ' +
        `suffix match on a host is how any public S3 bucket got accepted — import ` +
        `isAllowedAttachmentUrl from ${SHARED} instead.`,
    ).toEqual([])
  })

  it('every insurance-card OCR entry point filters through the shared allowlist', () => {
    const callers = sourceFiles()
      .map((f) => [repoPath(f), readFileSync(f, 'utf8')] as const)
      .filter(([path, src]) => /readInsuranceCard\s*\(/.test(code(src)) && path !== 'lib/services/insurance-ocr.ts')
    // The action call sites exist (the scan is not matching nothing).
    expect(callers.map(([p]) => p).sort()).toEqual([
      'app/(portal)/patient/intake/actions.ts',
      'app/site/[slug]/intake/[formSlug]/actions.ts',
    ])
    for (const [path, src] of callers) {
      // The IMPORT, not a mention: a doc comment naming the helper adopts nothing.
      expect(code(src), `${path} calls readInsuranceCard without the shared host gate`).toMatch(
        /import\s*\{[^}]*isAllowedAttachmentUrl[^}]*\}\s*from\s*'@\/lib\/attachment-hosts'/,
      )
      expect(code(src), `${path} imports the gate but never applies it`).toMatch(
        /isAllowedAttachmentUrl[\s\S]{0,40}\)/,
      )
    }
  })

  it('the OCR service itself gates on the allowlist, not on a bare protocol test', () => {
    const src = code(readFileSync(join(process.cwd(), 'lib/services/insurance-ocr.ts'), 'utf8'))
    expect(src).toMatch(
      /import\s*\{[^}]*isAllowedAttachmentUrl[^}]*\}\s*from\s*'@\/lib\/attachment-hosts'/,
    )
    // The filter itself must BE the allowlist, not a protocol test.
    expect(src).toMatch(/\.filter\(\([^)]*\)\s*=>[^\n]*isAllowedAttachmentUrl/)
    expect(src).not.toMatch(/\.filter\(\([^)]*\)\s*=>[^\n]*\/\^https\?/)
  })
})
