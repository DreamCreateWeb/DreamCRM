import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * The demo seeder's source, as one string.
 *
 * Several guards grep the seeder rather than running it — the seeded shapes
 * they defend (how many completed review requests, which coloring slugs,
 * which personas are pre-featured) are pure config blocks, and reading them is
 * cheaper and clearer than standing up a database.
 *
 * They used to read `lib/services/demo-clinic.ts` by path. That file was 6,535
 * lines and is now a directory, so the path is single-homed here instead: a
 * future move breaks one function, not five tests, and none of them has to
 * know how the module is laid out.
 */
const SEEDER_DIR = resolve(__dirname, '../..', 'lib/services/demo-clinic')

export function readDemoSeederSource(): string {
  return readdirSync(SEEDER_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .map((f) => readFileSync(join(SEEDER_DIR, f), 'utf8'))
    .join('\n')
}
