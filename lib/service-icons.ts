/**
 * Service icons — the ONE registry behind every service card's picture.
 *
 * A `ClinicService.icon` is still one string, and it can be three things:
 *
 *   - `icon:<id>`  one of the curated line glyphs below (drawn by
 *                  `components/clinic-site/service-icon.tsx` as inline SVG in
 *                  `currentColor`, so every template tints it with its own ink);
 *   - an `https://` URL  a picture the practice uploaded ("Upload your own");
 *   - a short text  an emoji (the legacy shape — library entries ship one).
 *
 * Templates never branch on these: they render `<ServiceIcon icon={s.icon} />`
 * and the Studio's picker drawer writes whichever form the owner chose.
 * Client-safe and pure — no React, no DOM.
 */

export const SERVICE_ICON_PREFIX = 'icon:'

export interface ServiceIconGlyph {
  id: string
  label: string
  /** Search words beyond the label. */
  tags: string[]
  /** 24×24 stroke paths (one or several), drawn with currentColor. */
  paths: string[]
}

export const SERVICE_ICON_GLYPHS: readonly ServiceIconGlyph[] = [
  {
    id: 'tooth',
    label: 'Tooth',
    tags: ['general', 'dental', 'molar', 'cleaning', 'hygiene'],
    paths: [
      'M8 3.5c-2.8 0-4.5 2-4.5 4.6 0 3 1.6 4.4 2.1 8 .3 2.1.8 4.4 2 4.4 1.3 0 1.4-3.3 2.2-4.7a1.4 1.4 0 0 1 2.4 0c.8 1.4.9 4.7 2.2 4.7 1.2 0 1.7-2.3 2-4.4.5-3.6 2.1-5 2.1-8 0-2.6-1.7-4.6-4.5-4.6-1.2 0-2.2.7-3 .7s-1.8-.7-3-.7z',
    ],
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    tags: ['whitening', 'cosmetic', 'bright', 'shine', 'veneers'],
    paths: ['M12 3l1.9 5.3 5.3 1.9-5.3 1.9L12 17.4l-1.9-5.3-5.3-1.9 5.3-1.9z', 'M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z'],
  },
  {
    id: 'shield',
    label: 'Shield',
    tags: ['preventive', 'protect', 'sealants', 'fluoride', 'checkup'],
    paths: ['M12 3l7.5 3v5.2c0 4.6-3.1 8.7-7.5 10-4.4-1.3-7.5-5.4-7.5-10V6z', 'M9 12.2l2.1 2.1 4-4.2'],
  },
  {
    id: 'family',
    label: 'Family',
    tags: ['family dentistry', 'all ages', 'parents', 'kids'],
    paths: [
      'M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
      'M17.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
      'M12 13.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z',
      'M2.5 20v-2.5A3.5 3.5 0 0 1 6 14h1.5',
      'M21.5 20v-2.5A3.5 3.5 0 0 0 18 14h-1.5',
      'M8 21v-2a4 4 0 0 1 8 0v2',
    ],
  },
  {
    id: 'child',
    label: 'Child',
    tags: ['pediatric', 'kids', 'children', 'baby', 'happy'],
    paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9 10.5h.01M15 10.5h.01', 'M8.5 14.5a4.7 4.7 0 0 0 7 0', 'M9 5.5c.5-1.5 1.5-2.5 3-2.5'],
  },
  {
    id: 'exam',
    label: 'Exam',
    tags: ['checkup', 'magnifier', 'search', 'inspect', 'diagnosis'],
    paths: ['M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20.5 20.5l-5-5'],
  },
  {
    id: 'toothbrush',
    label: 'Toothbrush',
    tags: ['cleaning', 'hygiene', 'brush', 'preventive'],
    paths: ['M3 21l8.5-8.5', 'M11.5 12.5l5.5-5.5 3.5 3.5-5.5 5.5z', 'M13.5 8.5l2 2M15.5 6.5l2 2'],
  },
  {
    id: 'crown',
    label: 'Crown',
    tags: ['crowns', 'restorative', 'caps', 'royal'],
    paths: ['M5 19h14', 'M5 16L3 7.5l5 3.5 4-6.5 4 6.5 5-3.5-2 8.5z'],
  },
  {
    id: 'implant',
    label: 'Implant',
    tags: ['implants', 'restorative', 'missing tooth', 'post'],
    paths: ['M8 3h8v3.5a4 4 0 0 1-8 0V3z', 'M9.5 10.5h5', 'M9.75 13.5h4.5', 'M10 16.5h4', 'M9.5 10.5l1 10h3l1-10'],
  },
  {
    id: 'braces',
    label: 'Braces',
    tags: ['orthodontics', 'ortho', 'straighten', 'wire'],
    paths: ['M3 12h18', 'M5 9h3.5v6H5zM10.25 9h3.5v6h-3.5zM15.5 9H19v6h-3.5z'],
  },
  {
    id: 'aligner',
    label: 'Aligner',
    tags: ['invisalign', 'clear aligners', 'orthodontics', 'ortho', 'straighten'],
    paths: ['M4 9.5c0 5.5 3.6 9.5 8 9.5s8-4 8-9.5', 'M4 9.5h16', 'M8 9.5v4M12 9.5v5M16 9.5v4'],
  },
  {
    id: 'denture',
    label: 'Dentures',
    tags: ['dentures', 'prosthetics', 'full mouth', 'partials'],
    paths: ['M4 12c0-4 3.6-7 8-7s8 3 8 7-3.6 7-8 7-8-3-8-7z', 'M4 12h16', 'M8 12v3M12 12v4M16 12v3', 'M8 9v3M12 8v4M16 9v3'],
  },
  {
    id: 'bridge',
    label: 'Bridge',
    tags: ['bridges', 'restorative', 'missing teeth'],
    paths: ['M3.5 9H8v7H3.5zM10 9h4v7h-4zM16 9h4.5v7H16z', 'M8 12.5h2M14 12.5h2'],
  },
  {
    id: 'veneer',
    label: 'Veneer',
    tags: ['veneers', 'cosmetic', 'smile makeover'],
    paths: ['M8 4h8l1 6c0 6-2 10-5 10S7 16 7 10z', 'M11 7.5v3.5'],
  },
  {
    id: 'root',
    label: 'Root canal',
    tags: ['endodontics', 'root', 'nerve', 'pain'],
    paths: ['M6 4h12v4.5c0 2.2-1.2 3.5-3 3.5-1 0-1.5 5-3 5s-2-5-3-5c-1.8 0-3-1.3-3-3.5z', 'M12 8v4'],
  },
  {
    id: 'wisdom',
    label: 'Wisdom tooth',
    tags: ['extraction', 'oral surgery', 'wisdom teeth', 'removal'],
    paths: [
      'M9 5.5c-2.3 0-3.7 1.6-3.7 3.8 0 2.5 1.3 3.6 1.7 6.6.3 1.7.7 3.6 1.7 3.6 1 0 1.1-2.7 1.8-3.9a1.1 1.1 0 0 1 2 0c.7 1.2.8 3.9 1.8 3.9 1 0 1.4-1.9 1.7-3.6.4-3 1.7-4.1 1.7-6.6 0-2.2-1.4-3.8-3.7-3.8-1 0-1.8.6-2.5.6s-1.5-.6-2.5-.6z',
      'M18.5 3l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z',
    ],
  },
  {
    id: 'gum',
    label: 'Gum care',
    tags: ['periodontal', 'perio', 'gums', 'droplet', 'bleeding'],
    paths: ['M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z', 'M9.5 14a2.5 2.5 0 0 0 2.5 2.5'],
  },
  {
    id: 'emergency',
    label: 'Emergency',
    tags: ['urgent', 'same day', 'cross', 'pain', 'first aid'],
    paths: ['M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'],
  },
  {
    id: 'bolt',
    label: 'Same day',
    tags: ['fast', 'lightning', 'quick', 'instant', 'cerec'],
    paths: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  },
  {
    id: 'moon',
    label: 'Sedation',
    tags: ['sleep', 'calm', 'anxiety', 'sedation dentistry', 'night'],
    paths: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  },
  {
    id: 'heart',
    label: 'Heart',
    tags: ['care', 'gentle', 'comfort', 'love', 'wellness'],
    paths: ['M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z'],
  },
  {
    id: 'star',
    label: 'Star',
    tags: ['favorite', 'featured', 'best', 'premium'],
    paths: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    tags: ['schedule', 'appointment', 'recall', 'checkup', 'visit'],
    paths: ['M4 6h16v14H4z', 'M4 10.5h16', 'M8 3v4M16 3v4'],
  },
  {
    id: 'clock',
    label: 'Clock',
    tags: ['time', 'hours', 'quick', 'wait', 'same day'],
    paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3.2 2'],
  },
  {
    id: 'smile',
    label: 'Smile',
    tags: ['happy', 'cosmetic', 'confidence', 'face'],
    paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 13.5a5 5 0 0 0 8 0', 'M9 9.5h.01M15 9.5h.01'],
  },
  {
    id: 'syringe',
    label: 'Numbing',
    tags: ['anesthesia', 'injection', 'botox', 'painless', 'syringe'],
    paths: ['M20 4l-1.5 1.5', 'M18.5 5.5l-2.5-2.5-2 2 2.5 2.5', 'M16.5 7.5L8 16l-4.5 1.5L5 13l8.5-8.5', 'M10 11l3 3'],
  },
  {
    id: 'clipboard',
    label: 'Consult',
    tags: ['exam', 'plan', 'treatment plan', 'checklist', 'forms'],
    paths: ['M8.5 3.5h7v3h-7z', 'M6.5 5.5H5v15h14v-15h-1.5', 'M9 12h6M9 16h6'],
  },
  {
    id: 'stethoscope',
    label: 'Stethoscope',
    tags: ['medical', 'doctor', 'health', 'sleep apnea', 'airway'],
    paths: ['M5.5 4v6a4 4 0 0 0 8 0V4', 'M9.5 14v2.5a4 4 0 0 0 8 0v-2', 'M17.5 14.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z'],
  },
  {
    id: 'mouthguard',
    label: 'Mouthguard',
    tags: ['night guard', 'sports', 'grinding', 'bruxism', 'tmj'],
    paths: ['M4 9.5a8 5.5 0 0 1 16 0v3a8 6.5 0 0 1-16 0z', 'M8 10v4M12 10v5M16 10v4'],
  },
  {
    id: 'jaw',
    label: 'Jaw',
    tags: ['tmj', 'bite', 'joint', 'headache', 'occlusion'],
    paths: ['M4 8c0-3 3.2-4 8-4s8 1 8 4-2 5-4 6c-1 .5-1 2-1 3.5H9c0-1.5 0-3-1-3.5-2-1-4-3-4-6z', 'M8 11h8'],
  },
  {
    id: 'leaf',
    label: 'Leaf',
    tags: ['holistic', 'natural', 'biological', 'gentle', 'eco'],
    paths: ['M5 19c0-8 5-13 14-14-1 9-6 14-14 14z', 'M5 19l7-7'],
  },
  {
    id: 'apple',
    label: 'Apple',
    tags: ['nutrition', 'kids', 'healthy', 'diet', 'school'],
    paths: ['M12 7.5c-3-3-8-1-8 4 0 5 3 9 5 9s2-1 3-1 1 1 3 1 5-4 5-9c0-5-5-7-8-4z', 'M12 7.5V4.5', 'M12 4.5c1-1 2-1.5 3-1.5'],
  },
  {
    id: 'dollar',
    label: 'Financing',
    tags: ['payment', 'money', 'plans', 'membership', 'affordable'],
    paths: ['M12 3v18', 'M16.5 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7.5'],
  },
  {
    id: 'camera',
    label: 'Imaging',
    tags: ['x-ray', 'xray', 'scan', 'photo', '3d', 'technology'],
    paths: ['M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4z', 'M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'],
  },
  {
    id: 'mask',
    label: 'Sleep apnea',
    tags: ['airway', 'snoring', 'cpap', 'oral appliance', 'sleep'],
    paths: ['M3 9h18v6a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6z', 'M8 13.5h8', 'M7 9V6.5M17 9V6.5'],
  },
  {
    id: 'bandage',
    label: 'Relief',
    tags: ['pain', 'repair', 'fix', 'bandage', 'injury'],
    paths: ['M4.5 12.5l8-8 7 7-8 8z', 'M8 9l-1 1M15 16l-1 1', 'M10.5 11.5h.01M13.5 11.5h.01M12 13h.01'],
  },
] as const

export const SERVICE_ICON_EMOJI: readonly string[] = [
  '🦷', '😁', '😊', '✨', '🪥', '🩺', '💉', '🩹', '🛡️', '👨‍👩‍👧', '👶', '🧒',
  '🔍', '📋', '📅', '⏰', '⚡', '🌙', '💤', '❤️', '⭐', '💎', '👑', '🦴',
  '🍎', '🌿', '💧', '🫧', '😬', '😷', '🎉', '🏆',
]

/** What a template draws when a service has no icon of its own. */
export const SERVICE_ICON_FALLBACK = '🦷'

export type ServiceIconRef =
  | { kind: 'glyph'; id: string; glyph: ServiceIconGlyph }
  | { kind: 'image'; url: string }
  | { kind: 'emoji'; text: string }

const MAX_EMOJI_CHARS = 4
const MAX_URL_LENGTH = 2048

export function serviceIconGlyph(id: string): ServiceIconGlyph | undefined {
  return SERVICE_ICON_GLYPHS.find((g) => g.id === id)
}

/** The stored value for a curated glyph. */
export function glyphIconValue(id: string): string {
  return `${SERVICE_ICON_PREFIX}${id}`
}

/** Count user-perceived characters (an emoji with modifiers is one). */
function graphemeCount(text: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (loc: string, o: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter
  if (Seg) return Array.from(new Seg('en', { granularity: 'grapheme' }).segment(text)).length
  return Array.from(text).length
}

/**
 * Read a stored icon string into its kind, or null when there is nothing
 * drawable: empty, an unknown glyph id (the registry was trimmed), a URL that
 * is not https, or a text too long to be an emoji.
 */
export function parseServiceIcon(value: string | null | undefined): ServiceIconRef | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  if (v.startsWith(SERVICE_ICON_PREFIX)) {
    const glyph = serviceIconGlyph(v.slice(SERVICE_ICON_PREFIX.length))
    return glyph ? { kind: 'glyph', id: glyph.id, glyph } : null
  }
  if (/^https:\/\//i.test(v)) {
    if (v.length > MAX_URL_LENGTH || /[\s<>"']/.test(v)) return null
    return { kind: 'image', url: v }
  }
  if (/[<>]/.test(v) || graphemeCount(v) > MAX_EMOJI_CHARS || v.length > 32) return null
  return { kind: 'emoji', text: v }
}

/** Is this a value the service writer may store? (null/empty = no icon.) */
export function isServiceIconValue(value: unknown): value is string {
  return typeof value === 'string' && parseServiceIcon(value) !== null
}

/** Glyphs whose label or tags match a search; the whole set for a blank query. */
export function searchServiceIconGlyphs(query: string): ServiceIconGlyph[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...SERVICE_ICON_GLYPHS]
  return SERVICE_ICON_GLYPHS.filter(
    (g) => g.label.toLowerCase().includes(q) || g.id.includes(q) || g.tags.some((t) => t.includes(q)),
  )
}
