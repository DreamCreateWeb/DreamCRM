import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

let cached: NeonHttpDatabase<typeof schema> | null = null

function getDb(): NeonHttpDatabase<typeof schema> {
  if (cached) return cached
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Add it to your environment.')
  }
  const client = neon(connectionString)
  cached = drizzle(client, { schema })
  return cached
}

// Proxy so importing `db` doesn't throw at module-eval time
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as any, prop, receiver)
  },
})

export { schema }
