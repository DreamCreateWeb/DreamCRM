const KEY = 'dc:onboarding'

export interface OnboardingState {
  situation?: 'existing' | 'solo' | 'starting'
  orgType?: 'individual' | 'organization'
  companyName?: string
  city?: string
  postalCode?: string
  street?: string
  country?: string
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
