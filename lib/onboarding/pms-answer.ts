/**
 * Onboarding's one software question — "Which practice software do you use?"
 * (docs/ACTIVATION.md: the cockpit asks again whenever it was skipped).
 *
 * Client-safe. The answer is a PMS_VENDORS id (the practice runs it — which
 * also files the connect request), 'none' (no practice software yet) or
 * 'unsure'. Null is "never asked / skipped" and is NOT an answer.
 */
import { PMS_VENDORS, isPmsVendor, type PmsVendorId } from '@/lib/pms-connect'

export const PMS_ANSWER_NONE = 'none' as const
export const PMS_ANSWER_UNSURE = 'unsure' as const

export type PmsAnswer = PmsVendorId | typeof PMS_ANSWER_NONE | typeof PMS_ANSWER_UNSURE

/** The picker's choices, vendors first, the two honest non-answers last. */
export const PMS_ANSWER_CHOICES: ReadonlyArray<{ id: PmsAnswer; label: string }> = [
  ...PMS_VENDORS,
  { id: PMS_ANSWER_NONE, label: 'None yet' },
  { id: PMS_ANSWER_UNSURE, label: 'Not sure' },
]

export function isPmsAnswer(v: unknown): v is PmsAnswer {
  return v === PMS_ANSWER_NONE || v === PMS_ANSWER_UNSURE || isPmsVendor(v)
}

/** A vendor answer is the only one that files a connect request. */
export function isVendorAnswer(v: unknown): v is PmsVendorId {
  return isPmsVendor(v)
}
