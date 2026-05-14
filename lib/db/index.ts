import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as auth from './schema/auth'
import * as platform from './schema/platform'
import * as clinic from './schema/clinic'

const schema = { ...auth, ...platform, ...clinic }

// Lazy connection so the module can be imported during build (when DATABASE_URL
// may not be available) without crashing. The handler that actually queries the
// DB will get a runtime error if the env var is still missing then — which is
// the right time to fail.
function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set — cannot connect to database')
  }
  const sql = neon(url)
  return drizzle(sql, { schema, casing: 'snake_case' })
}

let _db: ReturnType<typeof createDb> | null = null

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    if (!_db) _db = createDb()
    return Reflect.get(_db, prop)
  },
})

export type DB = typeof db
