import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * EVERY TONE PILL IS THE REGISTRY'S (ML-55, G1-28).
 *
 * A pill is a WASH + INK pair: `bg-amber-500/15 text-amber-800`. The radius
 * is incidental (the thread-panel chips were `rounded-[var(--r-xs)]`, so a
 * guard keyed on `rounded-full` missed them), so this keys on the pair: a
 * wash of a hue and that hue's ink on the SAME line of source. The one home
 * for the pair is lib/ui/encodings.ts — render `<StatusPill tone>` or
 * interpolate `TONE_PILL[tone]`.
 *
 * Scope: the authenticated app + shared components. The marketing site, the
 * clinic sites and the portal own their palettes. Pre-existing banners,
 * avatars and selected-state chips sit in the DATED ALLOWLIST (2026-11-09) —
 * it may only SHRINK: convert one, lower its count (remove at zero).
 */
const ROOTS = ['app/(default)', 'app/(double-sidebar)', 'app/(partner)', 'app/(caller)', 'app/(caller-accept)', 'components']
const SKIP = ['components/clinic-site', 'components/patient-portal', 'components/marketing']
const HUES = 'amber|emerald|rose|violet|fuchsia|green|red|yellow|blue|orange|indigo|sky|teal|purple'
const WASH = new RegExp(`\\bbg-(${HUES})-(?:50|100|200|\\d{3}/\\d{1,3})(?![\\d/])`, 'g')

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(n)) out.push(p)
  }
  return out
}

function localPairLines(src: string): number {
  let n = 0
  for (const line of src.split('\n')) {
    WASH.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WASH.exec(line))) {
      if (new RegExp(`\\btext-${m[1]}-\\d{3}\\b`).test(line)) {
        n++
        break
      }
    }
  }
  return n
}

/** Dated 2026-11-09. May only shrink. */
const ALLOWLIST: Record<string, number> = {
  'app/(default)/appointments/book-from-patient-drawer.tsx': 1,
  'app/(default)/appointments/waitlist-panel.tsx': 1,
  'app/(default)/billing/activate/page.tsx': 1,
  'app/(default)/dashboard/activation-card.tsx': 1,
  'app/(default)/dashboard/approval-inbox.tsx': 2,
  'app/(default)/dashboard/dream-team-strip.tsx': 1,
  'app/(default)/dashboard/fintech/platform-revenue.tsx': 1,
  'app/(default)/dashboard/guardian-panel.tsx': 1,
  'app/(default)/dashboard/platform-overview.tsx': 5,
  'app/(default)/dashboard/proposal-artifacts.tsx': 4,
  'app/(default)/dashboard/shared-brain-card.tsx': 1,
  'app/(default)/dream-team/runway-section.tsx': 1,
  'app/(default)/dream-team/sandman-panel.tsx': 2,
  'app/(default)/ecommerce/customers/[id]/page.tsx': 2,
  'app/(default)/ecommerce/customers/[id]/referral-card.tsx': 1,
  'app/(default)/ecommerce/customers/add-clinic-modal.tsx': 1,
  'app/(default)/ecommerce/customers/clinics-list.tsx': 1,
  'app/(default)/ecommerce/invoices/page.tsx': 1,
  'app/(default)/ecommerce/invoices/plans-panel.tsx': 1,
  'app/(default)/ecommerce/orders/new-project-modal.tsx': 1,
  'app/(default)/followups/followup-rules-card.tsx': 1,
  'app/(default)/growth/audiences/audiences-client.tsx': 1,
  'app/(default)/growth/campaigns/[id]/campaign-editor.tsx': 6,
  'app/(default)/growth/campaigns/new-campaign-button.tsx': 1,
  'app/(default)/growth/outreach/automations/[kind]/message-editor.tsx': 2,
  'app/(default)/growth/outreach/queue/page.tsx': 4,
  'app/(default)/growth/reviews/page.tsx': 2,
  'app/(default)/growth/social/composer.tsx': 5,
  'app/(default)/growth/social/connect-channels.tsx': 2,
  'app/(default)/growth/social/post-history.tsx': 1,
  'app/(default)/intake-forms/packets-manager.tsx': 1,
  'app/(default)/integrations/_pms-dashboard.tsx': 6,
  'app/(default)/integrations/google-business/gbp-detail-controls.tsx': 1,
  'app/(default)/integrations/google-business/page.tsx': 1,
  'app/(default)/integrations/integrations-library.tsx': 6,
  'app/(default)/integrations/sms/registration-panel.tsx': 1,
  'app/(default)/leads/lead-drawer.tsx': 1,
  'app/(default)/marketing/clinic-recall-dashboard.tsx': 1,
  'app/(default)/marketing/dials-panel.tsx': 4,
  'app/(default)/marketing/newsletter-card.tsx': 1,
  'app/(default)/marketing/retention-automations-card.tsx': 2,
  'app/(default)/partners/[id]/partner-terms-editor.tsx': 1,
  'app/(default)/partners/add-partner-modal.tsx': 1,
  'app/(default)/partners/delete-partner-modal.tsx': 1,
  'app/(default)/partners/partners-table.tsx': 1,
  'app/(default)/patients/[id]/documents-panel.tsx': 1,
  'app/(default)/patients/[id]/notes-panel.tsx': 1,
  'app/(default)/patients/saved-views-bar.tsx': 3,
  'app/(default)/payments/collections/propose-plan-cell.tsx': 1,
  'app/(default)/payments/hub-doors.tsx': 1,
  'app/(default)/payments/online/balance-outreach-card.tsx': 1,
  'app/(default)/platform/prospecting/call-list/call-card.tsx': 1,
  'app/(default)/platform/prospecting/call-list/page.tsx': 1,
  'app/(default)/platform/prospecting/call-list/phone-queue.tsx': 1,
  'app/(default)/platform/prospecting/contacts-panel.tsx': 1,
  'app/(default)/platform/prospecting/daily-briefing.tsx': 1,
  'app/(default)/platform/prospecting/demo/[id]/track-picker.tsx': 1,
  'app/(default)/platform/prospecting/demo-followup-drafter.tsx': 1,
  'app/(default)/platform/prospecting/demos/page.tsx': 2,
  'app/(default)/platform/prospecting/momentum-strip.tsx': 3,
  'app/(default)/platform/prospecting/page.tsx': 1,
  'app/(default)/platform/prospecting/sales-pipeline-board.tsx': 3,
  'app/(default)/platform/prospecting/sequences/sequence-editor.tsx': 1,
  'app/(default)/platform/prospecting/settings/settings-panel.tsx': 4,
  'app/(default)/platform/prospecting/stage.tsx': 2,
  'app/(default)/platform/service-library/library-entry-editor.tsx': 2,
  'app/(default)/platform/service-library/review-board.tsx': 1,
  'app/(default)/settings/account/account-panel.tsx': 1,
  'app/(default)/settings/apps/integrations-panel.tsx': 4,
  'app/(default)/settings/automations/emails/emails-hub.tsx': 2,
  'app/(default)/settings/billing/page.tsx': 1,
  'app/(default)/settings/billing/subscription-panel.tsx': 2,
  'app/(default)/settings/clinic/calendar-feed-card.tsx': 1,
  'app/(default)/settings/clinic/clinic-settings-nav.tsx': 1,
  'app/(default)/settings/clinic/hours-grid.tsx': 2,
  'app/(default)/settings/clinic/services-library-picker.tsx': 6,
  'app/(default)/settings/clinic/timezone-picker.tsx': 1,
  'app/(default)/settings/feedback/feedback-panel.tsx': 3,
  'app/(default)/settings/notifications/notifications-panel.tsx': 1,
  'app/(default)/settings/portal/portal-settings-form.tsx': 1,
  'app/(default)/settings/practice/practice-panel.tsx': 3,
  'app/(default)/settings/security/security-panel.tsx': 1,
  'app/(default)/settings/settings-home.tsx': 1,
  'app/(default)/settings/settings-tabs.tsx': 1,
  'app/(default)/shop/coupons/coupons-client.tsx': 1,
  'app/(default)/shop/shop-client.tsx': 7,
  'app/(default)/shop/shop-intro-card.tsx': 1,
  'app/(default)/website/blog/[id]/blog-editor.tsx': 4,
  'app/(default)/website/content/content-workspace.tsx': 1,
  'app/(default)/website/domain/buy-domain-card.tsx': 3,
  'app/(default)/website/editor/lead-form-builder.tsx': 1,
  'app/(default)/website/editor/rewrite-with-ai-button.tsx': 2,
  'app/(default)/website/editor/website-studio.tsx': 3,
  'app/(default)/website/seo/page.tsx': 2,
  'app/(double-sidebar)/inbox/components/category-tabs.tsx': 1,
  'app/(double-sidebar)/inbox/components/mailbox-sidebar.tsx': 7,
  'app/(double-sidebar)/inbox/components/patient-card.tsx': 1,
  'app/(double-sidebar)/inbox/components/quick-reply.tsx': 2,
  'app/(double-sidebar)/inbox/components/thread-view.tsx': 6,
  'app/(double-sidebar)/inbox/compose-button.tsx': 2,
  'app/(double-sidebar)/inbox/connect-prompt.tsx': 1,
  'app/(double-sidebar)/inbox/page.tsx': 1,
  'app/(double-sidebar)/inbox/settings/settings-panel.tsx': 6,
  'app/(double-sidebar)/messages/broadcast-button.tsx': 2,
  'app/(double-sidebar)/messages/client-messaging-sidebar.tsx': 2,
  'app/(double-sidebar)/messages/clinic-thread-detail-panel.tsx': 8,
  'app/(double-sidebar)/messages/messages-body.tsx': 1,
  'app/(double-sidebar)/messages/messages-sidebar.tsx': 1,
  'app/(double-sidebar)/messages/new-conversation-button.tsx': 2,
  'app/(partner)/partner/page.tsx': 1,
  'components/demo/script-remote.tsx': 2,
  'components/dropdown-profile.tsx': 2,
  'components/onboarding/getting-started.tsx': 1,
  'components/onboarding/module-hint-banner.tsx': 1,
  'components/onboarding/welcome-modal.tsx': 1,
  'components/saved-views/saved-views-bar.tsx': 3,
  'components/search-modal.tsx': 2,
  'components/social-posts/post-comments-panel.tsx': 1,
  'components/tags/add-tag-popover.tsx': 1,
  'components/tags/patient-tag-control.tsx': 1,
  'components/ui/billing-action-form.tsx': 1,
  'components/ui/billing-dunning-banner.tsx': 2,
  'components/ui/demo-exit-chip.tsx': 1,
  'components/ui/editor-kit.tsx': 1,
  'components/ui/filter-chip.tsx': 1,
  'components/ui/image-uploader.tsx': 1,
  'components/ui/tenant-sidebar.tsx': 2,
  'components/ui/text-size-toggle.tsx': 1,
  'components/ui/theme-choice.tsx': 1,
  'components/ui/trial-banner.tsx': 4,
  'components/ui/trial-ended-wall.tsx': 1,
  'components/ui/trial-reminder-modal.tsx': 4,
  'components/website/service-icon-picker.tsx': 1,
}

describe('tone pills (wash + ink pair) come from the registry', () => {
  const root = resolve(__dirname, '../..')
  const counts: Record<string, number> = {}
  for (const r of ROOTS) {
    let files: string[] = []
    try {
      files = walk(resolve(root, r))
    } catch {
      continue
    }
    for (const f of files) {
      const rel = relative(root, f)
      if (SKIP.some((s) => rel.startsWith(s))) continue
      const n = localPairLines(readFileSync(f, 'utf8'))
      if (n) counts[rel] = n
    }
  }

  it('no file exceeds its allowlisted count', () => {
    const over = Object.entries(counts)
      .filter(([f, n]) => n > (ALLOWLIST[f] ?? 0))
      .map(([f, n]) => `${f}: ${n}`)
    expect(over).toEqual([])
  })

  it('the allowlist only shrinks (a stale entry must be lowered)', () => {
    const stale = Object.entries(ALLOWLIST)
      .filter(([f, n]) => (counts[f] ?? 0) < n)
      .map(([f, n]) => `${f}: ${counts[f] ?? 0} < ${n}`)
    expect(stale).toEqual([])
  })

  it('the detector sees a local pill', () => {
    expect(localPairLines('<span className="bg-amber-100 text-amber-800">')).toBe(1)
    expect(localPairLines('<span className="bg-amber-500/15 px-1 text-amber-700">')).toBe(1)
    expect(localPairLines('<span className={TONE_PILL.warn}>')).toBe(0)
  })
})
