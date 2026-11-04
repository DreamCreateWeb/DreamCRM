import type { BillingInterval, PlanId } from '@/lib/stripe-config'

const KEY = 'dc:onboarding'

/**
 * Client-side onboarding draft, persisted to sessionStorage between steps.
 * The real DB writes happen once, in submitOnboarding (the last screen) — see
 * app/(onboarding)/actions.ts.
 */
export interface OnboardingState {
  /** Pre-picked on the marketing /pricing page (?plan=…) or in step 4. */
  planId?: PlanId
  interval?: BillingInterval
  // Step 1 — the practice
  practiceName?: string
  phone?: string
  // Step 2 — where patients find you
  street?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  // Screen 3 — web address + brand + software
  slug?: string
  brandColor?: string
  /** PMS_VENDORS id | 'none' | 'unsure'; absent = skipped. */
  pmsAnswer?: string
  pmsVendorName?: string
}

export function loadOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as OnboardingState
  } catch {
    return {}
  }
}

export function saveOnboardingState(patch: Partial<OnboardingState>) {
  if (typeof window === 'undefined') return
  const next = { ...loadOnboardingState(), ...patch }
  sessionStorage.setItem(KEY, JSON.stringify(next))
}

export function clearOnboardingState() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEY)
}
