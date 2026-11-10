import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE MOSAIC FIELD / BUTTON CLASSES ARE LEAVING (ML-55b, 2026-11-10).
 *
 * `form-input` · `form-select` · `form-textarea` · `form-checkbox` ·
 * `form-radio` · `form-multiselect` · `form-switch` and the `btn` · `btn-lg` ·
 * `btn-sm` · `btn-xs` button sizes are the Mosaic template's CSS vocabulary
 * (app/css/additional-styles/utility-patterns.css). The v3 system owns the
 * same jobs in components/ui: `TextInput` / `Select` / `Textarea` /
 * `Checkbox` / `Radio` / `Field` (form-fields.tsx), `Toggle` (a real
 * `role="switch"`), `ActionButton` (and `buttonClasses()` for the rare
 * element that must stay a plain `<a>` / `<label>`).
 *
 * This walks app/ + components/ for a class token (a quote, backtick or space
 * on both sides) and holds every file NOT in the DATED ALLOWLIST at zero.
 * `app/(default)/settings/**` and the platform messaging surface are fully
 * clean. The allowlist is per-file COUNTS, dated 2026-11-10, and may only
 * SHRINK: convert a file -> lower or delete its line.
 *
 * `components/ui/action-button.tsx` is the one exempt file: it is where the
 * `btn` / `btn-sm` size skin is applied (SIZE_CLASSES), so it names them by
 * definition. Blind spot, said rather than guessed: a class assembled by string
 * concatenation (`'form-' + kind`) is invisible to a source walk.
 */
const ROOTS = ['app', 'components']
const HOME = 'components/ui/action-button.tsx'
const TOKEN =
  /(^|["'`\s])(form-(?:input|select|textarea|checkbox|radio|multiselect|switch)|btn-(?:lg|sm|xs)|btn)(?=["'`\s]|$)/g

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n).split('\\').join('/')
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(n)) out.push(p)
  }
  return out
}

function count(src: string): number {
  let n = 0
  for (const line of src.split('\n')) {
    TOKEN.lastIndex = 0
    while (TOKEN.exec(line)) n++
  }
  return n
}

/** Dated 2026-11-10. May only shrink. */
const ALLOWLIST: Record<string, number> = {
  'app/(auth)/accept-invite/page.tsx': 9,
  'app/(auth)/error.tsx': 1,
  'app/(auth)/reset-password/reset-form.tsx': 2,
  'app/(auth)/signin/second-step.tsx': 1,
  'app/(auth)/signin/signin-form.tsx': 3,
  'app/(auth)/signup/signup-form.tsx': 4,
  'app/(default)/appointments/agenda-view.tsx': 6,
  'app/(default)/appointments/appointment-drawer.tsx': 2,
  'app/(default)/appointments/book-from-patient-drawer.tsx': 7,
  'app/(default)/appointments/new-booking-drawer.tsx': 5,
  'app/(default)/dashboard/approval-inbox.tsx': 7,
  'app/(default)/dream-team/goals-section.tsx': 1,
  'app/(default)/dream-team/sandman-panel.tsx': 1,
  'app/(default)/ecommerce/customers/[id]/nexhealth-card.tsx': 4,
  'app/(default)/ecommerce/customers/[id]/referral-card.tsx': 3,
  'app/(default)/ecommerce/customers/add-clinic-modal.tsx': 22,
  'app/(default)/ecommerce/customers/add-customer-modal.tsx': 7,
  'app/(default)/ecommerce/customers/clinics-list.tsx': 2,
  'app/(default)/ecommerce/customers/customers-table-item.tsx': 1,
  'app/(default)/ecommerce/customers/customers-table.tsx': 1,
  'app/(default)/ecommerce/invoices/add-invoice-modal.tsx': 7,
  'app/(default)/ecommerce/invoices/invoices-table-item.tsx': 1,
  'app/(default)/ecommerce/invoices/invoices-table.tsx': 1,
  'app/(default)/ecommerce/invoices/plans-panel.tsx': 4,
  'app/(default)/ecommerce/invoices/subscriptions-panel.tsx': 2,
  'app/(default)/ecommerce/orders/add-order-modal.tsx': 7,
  'app/(default)/ecommerce/orders/new-project-modal.tsx': 6,
  'app/(default)/ecommerce/orders/orders-table-item.tsx': 1,
  'app/(default)/ecommerce/orders/orders-table.tsx': 1,
  'app/(default)/ecommerce/orders/pipeline-board.tsx': 3,
  'app/(default)/growth/audiences/audiences-client.tsx': 7,
  'app/(default)/growth/campaigns/[id]/campaign-editor.tsx': 7,
  'app/(default)/growth/campaigns/[id]/recipients-table.tsx': 1,
  'app/(default)/growth/campaigns/new-campaign-button.tsx': 2,
  'app/(default)/growth/outreach/automations/[kind]/message-editor.tsx': 2,
  'app/(default)/growth/reviews/review-config-panel.tsx': 9,
  'app/(default)/growth/social/connect-channels.tsx': 2,
  'app/(default)/insurance/discovery-panel.tsx': 3,
  'app/(default)/insurance/insurance-tool.tsx': 12,
  'app/(default)/insurance/intro.tsx': 1,
  'app/(default)/insurance/payer-notebook-card.tsx': 1,
  'app/(default)/intake-forms/[id]/form-builder.tsx': 23,
  'app/(default)/intake-forms/[id]/form-preview.tsx': 7,
  'app/(default)/intake-forms/intake-intro-card.tsx': 1,
  'app/(default)/intake-forms/packets-manager.tsx': 2,
  'app/(default)/intake-forms/submissions/[submissionId]/link-panel.tsx': 1,
  'app/(default)/integrations/google-business/location-picker.tsx': 1,
  'app/(default)/integrations/integrations-library.tsx': 1,
  'app/(default)/integrations/pms/connect-request.tsx': 4,
  'app/(default)/leads/lead-drawer.tsx': 3,
  'app/(default)/leads/leads-view.tsx': 2,
  'app/(default)/marketing/pipeline/add-lead-button.tsx': 6,
  'app/(default)/marketing/pipeline/pipeline-lead-drawer.tsx': 7,
  'app/(default)/marketing/spend-entry-form.tsx': 5,
  'app/(default)/partners/[id]/partner-terms-editor.tsx': 3,
  'app/(default)/partners/[id]/referred-clinics-table.tsx': 2,
  'app/(default)/partners/add-partner-modal.tsx': 6,
  'app/(default)/patients/[id]/consent-card.tsx': 4,
  'app/(default)/patients/[id]/documents-panel.tsx': 1,
  'app/(default)/patients/[id]/edit-modal.tsx': 3,
  'app/(default)/patients/[id]/followups-panel.tsx': 4,
  'app/(default)/patients/[id]/loyalty-panel.tsx': 2,
  'app/(default)/patients/[id]/notes-panel.tsx': 1,
  'app/(default)/patients/[id]/patient-detail.tsx': 1,
  'app/(default)/patients/[id]/secondary-plan.tsx': 3,
  'app/(default)/patients/add-patient-modal.tsx': 5,
  'app/(default)/patients/bulk-message-modal.tsx': 2,
  'app/(default)/patients/import-patients-modal.tsx': 1,
  'app/(default)/patients/patients-list.tsx': 5,
  'app/(default)/patients/saved-views-bar.tsx': 5,
  'app/(default)/payments/collections/propose-plan-cell.tsx': 1,
  'app/(default)/payments/memberships/memberships-client.tsx': 1,
  'app/(default)/payments/online/balance-outreach-card.tsx': 3,
  'app/(default)/platform/prospecting/add-clinic-button.tsx': 1,
  'app/(default)/platform/prospecting/call-list/call-card.tsx': 8,
  'app/(default)/platform/prospecting/call-mode/call-session.tsx': 3,
  'app/(default)/platform/prospecting/call-mode/practice-panel.tsx': 1,
  'app/(default)/platform/prospecting/contacts-panel.tsx': 2,
  'app/(default)/platform/prospecting/demo-followup-drafter.tsx': 2,
  'app/(default)/platform/prospecting/sequences/sequence-editor.tsx': 4,
  'app/(default)/platform/prospecting/settings/settings-panel.tsx': 4,
  'app/(default)/platform/service-library/review-board.tsx': 1,
  'app/(default)/shop/coupons/coupons-client.tsx': 1,
  'app/(default)/shop/loyalty-config-card.tsx': 1,
  'app/(default)/shop/orders/orders-client.tsx': 1,
  'app/(default)/website/blog/[id]/blog-editor.tsx': 10,
  'app/(default)/website/careers/careers-client.tsx': 2,
  'app/(default)/website/domain/buy-domain-card.tsx': 1,
  'app/(default)/website/domain/custom-domain-card.tsx': 1,
  'app/(default)/website/editor/faq-editor.tsx': 2,
  'app/(default)/website/editor/hours-editor.tsx': 4,
  'app/(default)/website/editor/lead-form-builder.tsx': 1,
  'app/(default)/website/editor/website-studio.tsx': 4,
  'app/(default)/website/go-live-card.tsx': 3,
  'app/(default)/website/publish-card.tsx': 1,
  'app/(default)/website/templates/templates-gallery.tsx': 1,
  'app/(double-sidebar)/inbox/compose-button.tsx': 5,
  'app/(onboarding)/onboarding-01/page.tsx': 7,
  'app/(onboarding)/onboarding-02/page.tsx': 2,
  'app/(onboarding)/onboarding-complete/page.tsx': 2,
  'app/(onboarding)/welcome/welcome-interview.tsx': 8,
  'app/(partner)/partner/share-link-card.tsx': 1,
  'app/(partner)/partner/sign-out.tsx': 1,
  'app/(partner-accept)/error.tsx': 1,
  'app/(partner-accept)/partner/accept/page.tsx': 10,
  'app/d/[token]/booking-form.tsx': 3,
  'app/site/[slug]/intake/[formSlug]/intake-form-runner.tsx': 2,
  'components/appointments/slot-grid.tsx': 1,
  'components/auth/two-step.tsx': 5,
  'components/clinic-site/edit-bridge.tsx': 1,
  'components/date-select.tsx': 1,
  'components/delete-button.tsx': 1,
  'components/dropdown-filter.tsx': 9,
  'components/followups/followup-quick-add.tsx': 2,
  'components/followups/followup-row.tsx': 1,
  'components/onboarding/getting-started.tsx': 1,
  'components/onboarding/welcome-modal.tsx': 1,
  'components/pagination-classic.tsx': 2,
  'components/saved-views/saved-views-bar.tsx': 1,
  'components/search-form.tsx': 1,
  'components/search-modal.tsx': 2,
  'components/social-posts/post-comments-panel.tsx': 1,
  'components/ui/editor-kit.tsx': 3,
  'components/ui/patient-combobox.tsx': 1,
  'components/website/service-icon-picker.tsx': 1,
}
const ALLOWLIST_CEILING = 125

const counts: Record<string, number> = {}
for (const root of ROOTS) {
  for (const f of walk(root)) {
    if (f === HOME) continue
    const n = count(readFileSync(f, 'utf8'))
    if (n > 0) counts[f] = n
  }
}

describe('the Mosaic form-* / btn-* classes are leaving', () => {
  it('walks a real population', () => {
    expect(Object.keys(counts).length).toBeGreaterThan(10)
  })

  it('has no file outside the allowlist that uses them', () => {
    const offenders = Object.keys(counts).filter((f) => !(f in ALLOWLIST))
    expect(
      offenders,
      'use TextInput/Select/Textarea/Checkbox/Radio (components/ui/form-fields.tsx), Toggle, ActionButton or buttonClasses()',
    ).toEqual([])
  })

  it('never grows a file past its allowed count, and drops converted files', () => {
    for (const [f, allowed] of Object.entries(ALLOWLIST)) {
      const now = counts[f] ?? 0
      expect(now, `${f}: ${now} > ${allowed} — convert, do not add`).toBeLessThanOrEqual(allowed)
      expect(now, `${f} is clean (or shrank) — lower/delete its allowlist line`).toBe(allowed)
    }
  })

  it('keeps Settings and the platform messaging surface clean', () => {
    const dirty = Object.keys(counts).filter(
      (f) => f.startsWith('app/(default)/settings/') || f.startsWith('app/(double-sidebar)/messages/'),
    )
    expect(dirty).toEqual([])
  })

  it('only shrinks (ceiling is the file count)', () => {
    expect(Object.keys(ALLOWLIST).length).toBeLessThanOrEqual(ALLOWLIST_CEILING)
  })
})
