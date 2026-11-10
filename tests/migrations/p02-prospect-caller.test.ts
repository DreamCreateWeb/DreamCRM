import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P-02 — the cold-caller portal. Pinned BY TAG: the integrator regenerates
 * one sequential migration per PR on the merged schema, so the number may
 * move; the tag and these statements must not.
 */

const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_p02_prospect_caller.sql'))

function statements(): string[] {
  const sql = readFileSync(join(DIR, file!), 'utf8').trim()
  return sql.split('--> statement-breakpoint').map((st) => st.trim())
}

describe('p02_prospect_caller (by tag)', () => {
  it('creates prospect_caller — platform-global, no organization_id, email unique, user FK set null', () => {
    expect(file).toBeTruthy()
    const create = statements().find((st) => st.startsWith('CREATE TABLE "prospect_caller"'))!
    expect(create).toBeTruthy()
    expect(create).not.toContain('organization_id')
    for (const col of [
      '"id" text PRIMARY KEY NOT NULL',
      '"name" text NOT NULL',
      '"email" text NOT NULL',
      `"status" text DEFAULT 'invited' NOT NULL`,
      '"invite_token" text',
      '"invite_expires_at" timestamp with time zone',
      '"user_id" text',
      '"daily_target" integer DEFAULT 40 NOT NULL',
      '"states" jsonb',
      '"notes" text',
      '"created_by_user_id" text',
      '"last_active_at" timestamp with time zone',
      'CONSTRAINT "prospect_caller_email_unique" UNIQUE("email")',
    ]) {
      expect(create, col).toContain(col)
    }
    expect(statements()).toContain(
      'ALTER TABLE "prospect_caller" ADD CONSTRAINT "prospect_caller_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;',
    )
  })

  it('adds the assignment columns on prospect + caller_id on the call log, every FK set null, and the two indexes', () => {
    const own = statements().filter((st) => st.includes('"prospect"') || st.includes('"prospect_call_log"'))
    expect(own).toEqual([
      'ALTER TABLE "prospect" ADD COLUMN "assigned_caller_id" text;',
      'ALTER TABLE "prospect" ADD COLUMN "assigned_at" timestamp with time zone;',
      'ALTER TABLE "prospect" ADD COLUMN "caller_cooldown_until" timestamp with time zone;',
      'ALTER TABLE "prospect_call_log" ADD COLUMN "caller_id" text;',
      'ALTER TABLE "prospect" ADD CONSTRAINT "prospect_assigned_caller_id_prospect_caller_id_fk" FOREIGN KEY ("assigned_caller_id") REFERENCES "public"."prospect_caller"("id") ON DELETE set null ON UPDATE no action;',
      'ALTER TABLE "prospect_call_log" ADD CONSTRAINT "prospect_call_log_caller_id_prospect_caller_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."prospect_caller"("id") ON DELETE set null ON UPDATE no action;',
      'CREATE INDEX "idx_prospect_assigned_caller" ON "prospect" USING btree ("assigned_caller_id","assigned_at");',
      'CREATE INDEX "idx_pcall_caller" ON "prospect_call_log" USING btree ("caller_id","created_at");',
    ])
  })

  it('is registered in the journal by tag', () => {
    const j = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    expect(j.entries.some((e) => e.tag.endsWith('_p02_prospect_caller'))).toBe(true)
  })
})
