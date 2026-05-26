import { Pool } from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

// RDS terminates TLS with an AWS-managed cert. We encrypt in transit but skip
// CA verification for now (pinning the RDS root bundle is a later hardening
// step). Local Postgres on localhost is assumed plaintext.
export function pgSsl(connectionString: string): false | { rejectUnauthorized: boolean } {
  return /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
}

let cached: NodePgDatabase<typeof schema> | null = null

function getDb(): NodePgDatabase<typeof schema> {
  if (cached) return cached
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Add it to your environment.')
  }
  const pool = new Pool({
    connectionString,
    ssl: pgSsl(connectionString),
    max: 10,
  })
  cached = drizzle(pool, { schema })
  return cached
}

// Proxy so importing `db` doesn't throw at module-eval time.
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as any, prop, receiver)
  },
})

export { schema }
