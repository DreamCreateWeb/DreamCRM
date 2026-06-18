import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Bare /settings → the user's own account (the personal surface). Clinic-wide
// settings are reached from the org-switcher → "Clinic settings" (/settings/clinic).
export default function SettingsIndex() {
  redirect('/settings/account')
}
