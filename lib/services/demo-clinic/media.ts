import 'server-only'
import { COLORING_LIBRARY, coloringLibraryUrl } from '@/lib/types/coloring-library'

// Logos, hero images, the intro video, office photos, coloring pages.

// Logo + hero image for the demo clinic. Unsplash assets keep us
// dependency-free and consistent with how DEMO_OFFICE_PHOTOS works.
export const DEMO_LOGO_URL =
  'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=200&h=200&fit=crop&q=80'
export const DEMO_HERO_IMAGE_URL =
  'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=2000&q=80'
// Second hero photo (the right-hand oval) — a portrait-orientation shot, its
// own dedicated single-image field (not an office-gallery photo).
export const DEMO_HERO_IMAGE_2_URL =
  'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=1000&h=1250&fit=crop&q=80'
// Ambient autoplay loop for the "The {clinic} difference" section. Free
// Pexels dental footage — Pexels licenses everything for free commercial
// use without attribution. Keeps the demo showcasing the video branch of
// the difference section without us needing to shoot anything.
// Self-hosted on our S3 bucket. The original Pexels CDN URL returned 403
// to direct browser requests (their CDN hotlink-blocks the mp4 endpoint),
// leaving the difference-section card visibly blank. Source is the same
// dentist-checkup clip from Mixkit (free under the Mixkit License, no
// attribution required) mirrored to S3 so the demo serves reliably from
// a domain we control.
export const DEMO_DIFFERENCE_VIDEO_URL =
  'https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/demo-assets/dental-difference.mp4'

// Fixed demo calendar-feed token so the Settings → Clinic "Calendar feed" card
// showcases the live "On" state (a working /api/calendar/<token>.ics over the
// demo's seeded appointments). Deterministic so the demo URL never churns.
export const DEMO_CALENDAR_FEED_TOKEN = 'demo-dream-dental-calendar-feed-7c3f9a2e1b'

// Kids' coloring corner — six pages from the platform's CC0 coloring library
// (lib/types/coloring-library.ts). The `lib-<slug>` ids match what the Studio
// editor's "Add from library" writes, so the demo mirrors the real flow and
// re-seeding is idempotent. Dental-forward picks + crowd-pleasers.
export const DEMO_COLORING_PAGES = [
  'happy-tooth',
  'tooth-with-toothbrush',
  'big-smile-teeth',
  'caticorn',
  'retro-rocket',
  'stegosaurus',
].map((slug) => {
  const entry = COLORING_LIBRARY.find((e) => e.slug === slug)!
  return { id: `lib-${slug}`, title: entry.title, imageUrl: coloringLibraryUrl(slug) }
})

export const DEMO_OFFICE_PHOTOS = [
  {
    id: 'op1',
    url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80',
    alt: 'Modern dental treatment room with natural light',
    caption: null,
    position: '50% 35%',
  },
  {
    id: 'op2',
    url: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=1200&q=80',
    alt: 'Reception area with warm wood and plants',
    caption: null,
  },
  {
    id: 'op3',
    url: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1200&q=80',
    alt: 'Hygienist working with a patient',
    caption: null,
  },
  {
    id: 'op4',
    url: 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=1200&q=80',
    alt: 'Comfortable waiting lounge',
    caption: null,
  },
]
