import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

config({ path: '.env.local' })

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const sql = neon(url)
  const dir = join(process.cwd(), 'lib', 'db', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    console.log(`Applying ${file}…`)
    const contents = readFileSync(join(dir, file), 'utf8')
    const statements = contents
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)

    for (const statement of statements) {
      try {
        await sql.query(statement)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already exists')) {
          console.log(`  (skip — already exists)`)
          continue
        }
        console.error(`  ✗ Failed: ${statement.slice(0, 80)}…`)
        throw err
      }
    }
    console.log(`  ✓ ${file}`)
  }

  console.log('\nAll migrations applied.')
}

main().catch((err) => { console.error(err); process.exit(1) })
