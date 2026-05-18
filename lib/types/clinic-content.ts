// Public, client-safe content types stored as JSON on clinic_profile.
// Used by the clinic site editor and consumed by the public-facing template.

export interface ClinicService {
  id: string
  name: string
  description?: string | null
  icon?: string | null
}

export interface ClinicStaff {
  id: string
  name: string
  title?: string | null
  bio?: string | null
  photoUrl?: string | null
}

export const DEFAULT_SERVICES: ClinicService[] = [
  { id: 'cleanings', name: 'Cleanings & Exams', icon: '🦷' },
  { id: 'cosmetic', name: 'Cosmetic Dentistry', icon: '✨' },
  { id: 'restorations', name: 'Restorations', icon: '🔧' },
  { id: 'emergency', name: 'Emergency Care', icon: '😌' },
]
