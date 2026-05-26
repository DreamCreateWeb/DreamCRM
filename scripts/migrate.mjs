// One-shot migration runner for the AWS (RDS) database. Applies every
// drizzle migration in lib/db/migrations using the same node-postgres driver
// the app uses. Run with DATABASE_URL pointed at the target database:
//   DATABASE_URL=postgresql://... node scripts/migrate.mjs
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
})
const db = drizzle(pool)
await migrate(db, { migrationsFolder: 'lib/db/migrations' })
await pool.end()
console.log('migrations applied')
