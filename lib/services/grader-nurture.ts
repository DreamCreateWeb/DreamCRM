import 'server-only'
import { and, desc, eq, gt, isNull, lt, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { deliver, authEmailShell } from '@/lib/email'
import { encodeToken } from '@/lib/marketing/tokens'
import { GRADER_UTM_SOURCE } from '@/lib/marketing-attribution'
import { parsePracticeGradeResult } from '@/lib/practice-grade'
import {
  NURTURE_BATCH_CAP,
  NURTURE_REGRADE_DAYS,
  NURTURE_REGRADE_MAX_DAYS,
  NURTURE_REPORT_DAYS,
  NURTURE_REPORT_MAX_DAYS,
  inNurtureWindow,
  topFixFor,
} from '@/lib/grader-nurture'

/**
 * Grader-lead nurture — the server half (Part 9 C①; the daily
 * `grader-nurture` cron drives it). The LAWS, in order of who they
 * protect:
 *  1. Suppression is honored at SEND TIME via the same
 *     prospect_suppression list the Hunter obeys — one "never again"
 *     covers every machine we run. Every nurture email's unsubscribe
 *     writes to that list (the existing /api/unsub prospect path).
 *  2. Rows without a prospectId aren't nurtured at all — no prospect
 *     means no working unsubscribe target, and a marketing email
 *     without a working opt-out doesn't go out. Ever.
 *  3. A signup wins: an account exists for the email → the machine
 *     goes quiet (the product's own onboarding took over).
 *  4. A newer grade for the same practice supersedes the touch —
 *     they came back on their own; nudging them backward is noise.
 *  5. Every considered row gets STAMPED (sent or skipped) so the scan
 *     never grinds the same rows daily; the counts tell the truth.
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')

export interface GraderNurtureRun {
  reportSent: number
  regradeSent: number
  skipped: number
  errors: number
}

const dayAgo = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

async function isSuppressed(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.prospectSuppression.id })
    .from(schema.prospectSuppression)
    .where(eq(schema.prospectSuppression.email, email))
    .limit(1)
  return !!row
}

async function hasAccount(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1)
  return !!row
}

/** A newer grade run for the same email + practice (normalized). */
async function hasNewerRun(row: { id: string; email: string; practiceName: string; createdAt: Date }): Promise<boolean> {
  const [newer] = await db
    .select({ id: schema.practiceGrade.id })
    .from(schema.practiceGrade)
    .where(
      and(
        eq(schema.practiceGrade.email, row.email),
        gt(schema.practiceGrade.createdAt, row.createdAt),
        ne(schema.practiceGrade.id, row.id),
      ),
    )
    .orderBy(desc(schema.practiceGrade.createdAt))
    .limit(1)
  return !!newer
}

function unsubFootnote(email: string, prospectId: string): string {
  const unsubUrl = `${APP_URL}/api/unsub/${encodeToken({ e: email, pr: prospectId, p: 'u' })}`
  const postal = (process.env.MARKETING_POSTAL_ADDRESS || '').trim()
  return (
    `You asked for a practice grade at dreamcreatestudio.com — this is a follow-up about that report. ` +
    `<a href="${unsubUrl}">Unsubscribe</a> and you'll never hear from us again.` +
    (postal ? `<br/>Dream Create · ${postal.replace(/</g, '&lt;')}` : '')
  )
}

export async function runGraderNurture(now: Date = new Date()): Promise<GraderNurtureRun> {
  const run: GraderNurtureRun = { reportSent: 0, regradeSent: 0, skipped: 0, errors: 0 }

  // ── Touch 1: day-3 "your report's still here" + the one fix ──────────
  const reportRows = await db
    .select()
    .from(schema.practiceGrade)
    .where(
      and(
        isNull(schema.practiceGrade.nurtureReportAt),
        lt(schema.practiceGrade.createdAt, dayAgo(now, NURTURE_REPORT_DAYS)),
        gt(schema.practiceGrade.createdAt, dayAgo(now, NURTURE_REPORT_MAX_DAYS)),
      ),
    )
    .limit(NURTURE_BATCH_CAP)

  for (const row of reportRows) {
    try {
      const stamp = () =>
        db
          .update(schema.practiceGrade)
          .set({ nurtureReportAt: now })
          .where(eq(schema.practiceGrade.id, row.id))

      if (!row.prospectId || !inNurtureWindow(row.createdAt, now, NURTURE_REPORT_DAYS, NURTURE_REPORT_MAX_DAYS)) {
        await stamp()
        run.skipped++
        continue
      }
      const result = parsePracticeGradeResult(row.result)
      const fix = result ? topFixFor(result) : null
      if (
        !fix ||
        (await isSuppressed(row.email)) ||
        (await hasAccount(row.email)) ||
        (await hasNewerRun(row))
      ) {
        await stamp()
        run.skipped++
        continue
      }
      const reportUrl = `${APP_URL}/g/${row.token}?utm_source=${GRADER_UTM_SOURCE}&utm_medium=email&utm_campaign=nurture-report`
      await deliver({
        to: row.email,
        subject: `The one fix that moves ${row.practiceName}’s grade most`,
        html: authEmailShell({
          heading: 'Your report’s still here',
          introHtml:
            `<p>A few days ago you graded <strong>${row.practiceName.replace(/</g, '&lt;')}</strong>. ` +
            `If you only fix one thing from it, make it this (${fix.axisLabel.toLowerCase()}):</p>` +
            `<p style="margin:14px 0;padding:12px 16px;border-left:3px solid #14b8a6;background:#f0fdfa;">` +
            `${fix.text.replace(/</g, '&lt;')}<br/><br/><strong>With DreamCRM:</strong> ${fix.after.replace(/</g, '&lt;')}</p>` +
            `<p>The full report is one click away — it’s yours, share it with whoever runs your front desk.</p>`,
          buttonUrl: reportUrl,
          buttonLabel: 'Open your report',
          footnoteHtml: unsubFootnote(row.email, row.prospectId),
        }),
        tags: [{ name: 'kind', value: 'grader-nurture-report' }],
      })
      await stamp()
      run.reportSent++
    } catch (err) {
      console.warn('[grader-nurture] report touch failed', row.id, err)
      run.errors++
    }
  }

  // ── Touch 2: day-14 "re-grade and see what moved" ────────────────────
  const regradeRows = await db
    .select()
    .from(schema.practiceGrade)
    .where(
      and(
        isNull(schema.practiceGrade.nurtureRegradeAt),
        lt(schema.practiceGrade.createdAt, dayAgo(now, NURTURE_REGRADE_DAYS)),
        gt(schema.practiceGrade.createdAt, dayAgo(now, NURTURE_REGRADE_MAX_DAYS)),
      ),
    )
    .limit(NURTURE_BATCH_CAP)

  for (const row of regradeRows) {
    try {
      const stamp = () =>
        db
          .update(schema.practiceGrade)
          .set({ nurtureRegradeAt: now })
          .where(eq(schema.practiceGrade.id, row.id))

      if (!row.prospectId || !inNurtureWindow(row.createdAt, now, NURTURE_REGRADE_DAYS, NURTURE_REGRADE_MAX_DAYS)) {
        await stamp()
        run.skipped++
        continue
      }
      if ((await isSuppressed(row.email)) || (await hasAccount(row.email)) || (await hasNewerRun(row))) {
        await stamp()
        run.skipped++
        continue
      }
      const gradeUrl = `${APP_URL}/grade?utm_source=${GRADER_UTM_SOURCE}&utm_medium=email&utm_campaign=nurture-regrade`
      await deliver({
        to: row.email,
        subject: `Re-grade ${row.practiceName} — see what’s moved`,
        html: authEmailShell({
          heading: 'Two weeks later — what changed?',
          introHtml:
            `<p>It’s been a couple of weeks since <strong>${row.practiceName.replace(/</g, '&lt;')}</strong> was graded. ` +
            `Run it again and the new report opens with a <strong>“since your last grade”</strong> strip — ` +
            `every score side by side with last time, and any check you’ve fixed called out.</p>` +
            `<p>Takes about a minute, same as before. No account, no card — just the report.</p>`,
          buttonUrl: gradeUrl,
          buttonLabel: 'Re-grade your practice',
          footnoteHtml: unsubFootnote(row.email, row.prospectId),
        }),
        tags: [{ name: 'kind', value: 'grader-nurture-regrade' }],
      })
      await stamp()
      run.regradeSent++
    } catch (err) {
      console.warn('[grader-nurture] regrade touch failed', row.id, err)
      run.errors++
    }
  }

  return run
}
