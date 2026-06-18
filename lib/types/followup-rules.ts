/**
 * Client-safe smart-follow-up-rule config. Each rule auto-creates a patient
 * follow-up when its condition holds; all default OFF (the clinic opts in).
 */

export type FollowupRuleId = 'balance' | 'recall' | 'unconfirmed'

export interface FollowupRuleConfig {
  /** Outstanding PMS balance > 0 → "Collect $X from {name}". */
  balance: boolean
  /** Overdue for a checkup with nothing booked → "Reach out to {name}". */
  recall: boolean
  /** A scheduled visit in the next 48h still unconfirmed → "Confirm {name}". */
  unconfirmed: boolean
}

export const DEFAULT_FOLLOWUP_RULES: FollowupRuleConfig = {
  balance: false,
  recall: false,
  unconfirmed: false,
}

export interface FollowupRuleMeta {
  id: FollowupRuleId
  label: string
  description: string
}

/** UI copy for each rule (the settings card renders this). */
export const FOLLOWUP_RULE_META: FollowupRuleMeta[] = [
  {
    id: 'balance',
    label: 'Collect outstanding balances',
    description: 'When a patient has a balance on file, add a "collect balance" task so it doesn\'t slip.',
  },
  {
    id: 'recall',
    label: 'Chase overdue recalls',
    description: 'When a patient is overdue for a checkup with nothing booked, add a "reach out" task (once a month).',
  },
  {
    id: 'unconfirmed',
    label: 'Confirm upcoming visits',
    description: 'When a visit in the next 48 hours is still unconfirmed, add a "confirm" task for the front desk.',
  },
]

/** Merge a stored partial config over the defaults (null = all off). */
export function resolveFollowupRules(stored: unknown): FollowupRuleConfig {
  const s = (stored ?? {}) as Partial<Record<FollowupRuleId, unknown>>
  return {
    balance: s.balance === true,
    recall: s.recall === true,
    unconfirmed: s.unconfirmed === true,
  }
}

export function anyFollowupRuleEnabled(c: FollowupRuleConfig): boolean {
  return c.balance || c.recall || c.unconfirmed
}
