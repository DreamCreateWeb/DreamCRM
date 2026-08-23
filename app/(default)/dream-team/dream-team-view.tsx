import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import type { TenantContext } from '@/lib/auth/context'
import { readDemoSkin } from '@/lib/demo-skin'
import { PageHeader } from '@/components/ui/page-header'
import ApprovalInbox from '../dashboard/approval-inbox'
import { loadApprovalInbox } from './load'

/**
 * THE DREAM TEAM (docs/ai-operations.md) — the clinic's AI staff, on one
 * page: the sign-here stack of finished work waiting on a yes, the
 * take-it-back strip, and (as later slices land) the veto runway, the
 * goals, the roster, and Sandman. The Overview keeps only a calm summons
 * strip; the sitting-down work happens here.
 *
 * A ctx-taking async component (the clinic-overview pattern) so the
 * whole-DOM suite can render it directly with mocked services.
 */
export default async function DreamTeamView({ ctx }: { ctx: TenantContext }) {
  const [timeZone, demoSkin] = await Promise.all([
    getClinicTimeZone(ctx.organizationId).catch(() => 'America/New_York'),
    readDemoSkin(ctx),
  ])
  const name = demoSkin?.clinicName ?? ctx.organizationName
  const inbox = await loadApprovalInbox(ctx.organizationId, timeZone)
  const waiting = inbox.proposalCards.length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Daily · ${name}`}
        title="Dream Team"
        subtitle={
          waiting > 0
            ? 'Your AI staff. Finished work is below, waiting on your yes — read it, tweak it if you like, and tap approve.'
            : 'Your AI staff. When they finish something that needs your yes, it lands here — and what they handle on their own is reported below.'
        }
      />

      <ApprovalInbox
        proposals={inbox.proposalCards}
        totalOpen={inbox.totalOpen}
        clinicName={name}
        grants={inbox.grants}
        autonomousWork={inbox.autonomousWork}
        isDemo={ctx.isDemo}
      />

      {/* A first-visit presence when the desk is truly empty — the page must
          never open onto nothing (the stack + strips all hide when quiet). */}
      {waiting === 0 && inbox.grants.length === 0 && inbox.autonomousWork.length === 0 && (
        <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2,white)] p-8 text-center ring-1 ring-[color:var(--color-hairline)]">
          <p className="text-3xl" aria-hidden="true">
            🌙
          </p>
          <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
            The team is on the clock — nothing needs you right now.
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            They watch your reviews, inquiries, schedule, and content around the clock. Work that
            needs your sign-off lands here as a finished draft; the rest gets handled and reported.
          </p>
        </div>
      )}
    </div>
  )
}
