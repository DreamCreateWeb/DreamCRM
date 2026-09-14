import { describe, it, expect } from 'vitest'
import { allOffenders, isBareFlag, perRowSites, siblingGroups, silentlyDisabled } from './shared-pending'

// The rules, the reasoning, and why the exemptions are a list rather than a
// count all live in `./shared-pending.ts`. Read that first.

/**
 * Reviewed and correct — the controls are never on screen at the same time.
 * Keyed `file|Component|flag`: the component NAME matters, because two
 * components in one file can each own a `pending` and an exemption written
 * for one must not quietly cover the other.
 */
const NOT_SIMULTANEOUS: Record<string, string> = {
  'app/(default)/dashboard/guardian-audience-control.tsx|GuardianAudienceControl|pending':
    'the `confirming` branch and the un-confirmed branch are the two arms of one ternary',
  'app/(default)/patients/import-patients-modal.tsx|ImportPatientsModal|pending':
    'the wizard renders one `stage.type` at a time — Next: match columns and Import are different steps',
  'app/(default)/platform/prospecting/demo/[id]/brief-panel.tsx|BriefPanel|pending':
    'Generate returns early when there is no brief yet; Regenerate only renders once there is one',
  'app/(default)/integrations/integrations-library.tsx|SocialAddonCard|pending':
    'Cancel add-on and Add more are two arms of the same `entitlement.addonActive` ternary chain',
  'app/(default)/integrations/integrations-library.tsx|IntegrationsLibrary|pending':
    'a prop passthrough into <BundleSection>, which hands it on to SocialAddonCard — whose own two uses are the exempted ternary arms above; no button reads it per row',
  'app/(default)/partners/[id]/referred-clinics-table.tsx|ReferredClinicsTable|pending':
    '`editing` is `editId === c.id`, so exactly one row in the table renders Save at a time',
  'app/(partner)/partner/partner-payout.tsx|PartnerPayout|pending':
    'Withdraw / Finish payout setup / Set up payouts are the three arms of one `method === …` ternary chain — a partner sees exactly one',
  'app/(default)/partners/partners-table.tsx|PartnersTable|busy':
    '`busy` is already `pendingId === p.id` (per row), and Resend / Suspend / Reactivate are selected by `p.status` — a row shows exactly one of them',
}

describe('one control’s busy state is not every control’s', () => {
  it('both rules see real sites (neither is silently matching nothing)', () => {
    // Rule 1 finds the exempt sibling groups; rule 2 has to find the in-map
    // population it narrows, or the `useTransition` restriction has swallowed
    // the whole rule and nobody would notice.
    expect(siblingGroups().length).toBeGreaterThan(0)
    expect(isBareFlag('pending')).toBe(true)
    expect(isBareFlag('handlers.pending')).toBe(true)
    expect(isBareFlag("pending && active === 'save'")).toBe(false)
    expect(isBareFlag('busy(`job:${j.id}`)')).toBe(false)
  })

  it('every exemption still matches a real group', () => {
    // A surface gets rewritten, its exemption stops matching, and the entry
    // sits there looking like coverage. That is a hole with a comment on it.
    const found = new Set(allOffenders().map((o) => o.key))
    const stale = Object.keys(NOT_SIMULTANEOUS).filter((k) => !found.has(k))
    expect(stale, `No longer matches any group — delete it:\n  ${stale.join('\n  ')}`).toEqual([])
  })

  it('no surface runs two different actions off one undiscriminated flag', () => {
    const offenders = allOffenders()
      .filter((o) => !(o.key in NOT_SIMULTANEOUS))
      .map((o) =>
        o.rule === 'per-row'
          ? `${o.rel}:${o.lines.join(', ')} — pending={${o.flag}} on a control rendered once per row`
          : `${o.rel} — pending={${o.flag}} on lines ${o.lines.join(', ')}`,
      )
    expect(
      offenders,
      'Pressing one of these spins all of them. Name which one is working:\n' +
        "  pending={pending && active === '<key>'} disabled={pending}\n" +
        '(see referral-card.tsx). For a list, the key is the row id. If they are\n' +
        'never on screen together, add the group to NOT_SIMULTANEOUS with the\n' +
        `reason:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it('the per-row rule is narrowed to the transition itself, not every in-map flag', () => {
    // The restriction that makes rule 2 shippable. `partners-table` reads
    // `busy = pendingId === p.id` and `subscription-panel` reads
    // `isPending && pendingPlan === p.id` — both already narrowed, both
    // inside a `.map`, and both correct. If this starts failing, the rule has
    // widened into reporting eight right answers to catch two wrong ones.
    const flagged = new Set(perRowSites().map((o) => o.rel))
    expect(flagged.has('app/(default)/partners/partners-table.tsx')).toBe(false)
    expect(flagged.has('app/(default)/settings/billing/subscription-panel.tsx')).toBe(false)
  })
})

describe('a primitive that only greys out says nothing', () => {
  // Read the block comment over `silentlyDisabled` — this rule exists because
  // its absence let 11 buttons, including the partner Withdraw, come out of a
  // cleanup round with no busy state at all.

  /**
   * Reviewed: the flag genuinely means "unavailable" rather than "working",
   * so there is nothing for this button to report.
   */
  const NOT_BUSY: Record<string, string> = {}

  it('every branded primitive told work is running says so', () => {
    const offenders = silentlyDisabled()
      .filter((b) => !(`${b.rel}:${b.line}` in NOT_BUSY))
      .map((b) => `${b.rel}:${b.line} <${b.tag}> "${b.label}" — disabled={${b.flag}}, no pending=`)
    expect(
      offenders,
      'These grey out and say nothing: no spinner, no aria-busy, no label. The\n' +
        'primitive already does the whole job — add `pending={<flag>}` beside the\n' +
        '`disabled`. If the flag means "unavailable" rather than "working", add the\n' +
        `site to NOT_BUSY with the reason:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})
