/**
 * Client-safe retention-automation types + labels (campaigns phase 2,
 * 2026-07-21). The four set-&-forget auto-sends; the engine lives in
 * lib/services/retention-automation.ts, message overrides in
 * lib/services/marketing-templates.ts — both import the kind from here
 * so neither has to import the other.
 */

export type RetentionKind = 'birthday' | 'reactivation' | 'benefits' | 'welcome'

export const RETENTION_KINDS: RetentionKind[] = ['birthday', 'reactivation', 'benefits', 'welcome']

export const RETENTION_KIND_LABELS: Record<RetentionKind, string> = {
  birthday: 'Birthday greetings',
  reactivation: 'Reactivation nudge',
  benefits: 'Use-your-benefits reminder',
  welcome: 'New-patient welcome',
}

export function isRetentionKind(v: string): v is RetentionKind {
  return (RETENTION_KINDS as string[]).includes(v)
}
