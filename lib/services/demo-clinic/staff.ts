import 'server-only'
import { type ClinicStaff } from '@/lib/types/clinic-content'

// The demo practice's people, as they appear on the public site.

/**
 * Dream Dental demo staff — 5 members covering every role + every glyph state on the
 * /team detail page. Bios are warm and plausible (not autobiographical); they
 * exist to showcase the template, not to invent credentials at a real clinic.
 *
 * Coverage:
 *   - Dr. Jordan Reyes — explicit `slug` set (exercises the override path
 *     on the staff detail resolver); full credentials + specialties + funFact
 *   - Dr. Sam Patel — derived slug (kebab(name)) — exercises the fallback
 *   - Maria Vega, RDH — name strips honorifics on derived slug, has
 *     specialties but no funFact (section gracefully hides)
 *   - Casey Lin — minimal bio, no specialties (pill section hides),
 *     funFact present
 *   - Renee Park — hygienist with credentials + specialties, no funFact
 */
export const DEMO_STAFF: ClinicStaff[] = [
  {
    id: 'p1',
    name: 'Dr. Jordan Reyes',
    title: 'Lead Dentist',
    slug: 'dr-jordan-reyes',
    credentials: 'DDS · 15 years experience',
    bio: 'Dr. Reyes founded Dream Dental to make going to the dentist feel like going to any other thoughtful place — calm rooms, plain-English explanations, no judgment about how long it has been. He trained at a community health center before moving into private practice, and brings that "everyone deserves great care" sensibility to every visit.',
    specialties: ['Family dentistry', 'Restorative care', 'Anxious patients'],
    funFact: 'On weekends you can find him on the trails outside Austin — he is slowly working his way through every hike in the Texas Hill Country.',
    bookHref: null,
    photoUrl: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=600&h=750&fit=crop&q=80',
    photoPosition: '50% 28%',
  },
  {
    id: 'p2',
    name: 'Dr. Sam Patel',
    title: 'Cosmetic Dentist',
    slug: null,
    credentials: 'DDS, MS · 8 years experience',
    bio: 'Sam joined the team in 2022 from a cosmetic-focused practice in Houston. She loves the moment a patient who has hidden their smile for years finally sees what is possible — and she is meticulous about the small choices (shade, shape, contour) that make the result look like you, just better.',
    specialties: ['Cosmetic dentistry', 'Teeth whitening', 'Veneers'],
    funFact: 'She is a relentless home baker — ask her about her sourdough rotation.',
    bookHref: null,
    photoUrl: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=600&h=750&fit=crop&q=80',
  },
  {
    id: 'p3',
    name: 'Maria Vega, RDH',
    title: 'Lead Hygienist',
    slug: null,
    credentials: 'RDH · 12 years experience',
    bio: 'Maria has been with the practice from day one. Patients ask for her by name because she is gentle, thorough, and absolutely refuses to lecture. If it has been a while since your last cleaning, she will tell you what she sees, what she would do about it, and then she will do it — calmly, and without making you feel small.',
    specialties: ['Deep cleanings', 'Periodontal care', 'Patient education'],
    funFact: null,
    bookHref: null,
    photoUrl: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=600&h=750&fit=crop&q=80',
  },
  {
    id: 'p4',
    name: 'Casey Lin',
    title: 'Office Manager',
    slug: null,
    credentials: null,
    bio: 'Casey runs the front of the office. She is the person who will call your insurance for you, send you the form ahead of time, and remember that you prefer morning appointments. Every front desk should be this kind.',
    specialties: null,
    funFact: 'She is studying for her certified dental practice manager credential on the side.',
    bookHref: null,
    photoUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&h=750&fit=crop&q=80',
  },
  {
    id: 'p5',
    name: 'Renee Park, RDH',
    title: 'Hygienist',
    slug: null,
    credentials: 'RDH · 6 years experience',
    bio: 'Renee joined Dream Dental in 2024. She is especially good with kids and first-time-in-a-while patients — patient, plainspoken, and never in a rush. She trained with the periodontal team at UT Health and brings that careful attention to every cleaning.',
    specialties: ['Pediatric hygiene', 'First-visit comfort'],
    funFact: null,
    bookHref: null,
    photoUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&h=750&fit=crop&q=80',
  },
]
