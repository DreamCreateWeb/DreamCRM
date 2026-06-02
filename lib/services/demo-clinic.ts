import 'server-only'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId, slugify } from '@/lib/utils'
import { seedDefaultIntakeForm } from '@/lib/services/forms'
import { seedServiceLibrary } from '@/lib/services/service-library'
import { seedSystemTemplates, SYSTEM_TEMPLATES } from '@/lib/services/marketing-templates'
import { STARTER_BLOG_TOPICS } from '@/lib/services/blog'
import { sanitizeBlogHtml } from '@/lib/blog-sanitize'
import { seedDemoPms } from '@/lib/services/pms'
import {
  DEFAULT_FAQ_ITEMS,
  type ClinicStat,
  type ClinicService,
} from '@/lib/types/clinic-content'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'

/**
 * Demo-clinic seeder. Creates a fully-populated clinic org so platform
 * admins can flip into the clinic dashboard via the demo-mode cookie
 * and see real-looking data — patients with insurance, an appointment
 * book, a few tasks.
 *
 * Idempotent by display name: if a clinic with the resolved slug
 * already exists we return that instead of creating a duplicate.
 *
 * Not seeded yet (will be filled in as the matching modules ship):
 * treatment plans, procedures, charts, claims, recall.
 */
export interface DemoClinicResult {
  organizationId: string
  organizationSlug: string
  organizationName: string
  created: boolean
  patientCount: number
  appointmentCount: number
}

const FIRST_NAMES = [
  'Olivia',
  'Liam',
  'Emma',
  'Noah',
  'Ava',
  'Ethan',
  'Sophia',
  'Mason',
  'Isabella',
  'James',
  'Mia',
  'Lucas',
  'Charlotte',
  'Aiden',
  'Amelia',
]
const LAST_NAMES = [
  'Anderson',
  'Brooks',
  'Carter',
  'Diaz',
  'Evans',
  'Fischer',
  'Garza',
  'Hayes',
  'Iverson',
  'Johnson',
  'Kim',
  'Lopez',
  'Mitchell',
  'Nguyen',
  'Owens',
]
const STREETS = ['Maple St', 'Oak Ave', 'Cedar Ln', 'Elm Rd', 'Pine Blvd']
const CITIES = [
  { city: 'Austin', state: 'TX', zip: '78701' },
  { city: 'Dallas', state: 'TX', zip: '75201' },
  { city: 'Houston', state: 'TX', zip: '77001' },
]
const INSURERS = ['Delta Dental', 'Cigna', 'Aetna', 'MetLife', 'Guardian', null]
const APPT_TYPES = [
  'checkup',
  'cleaning',
  'filling',
  'extraction',
  'root_canal',
  'consultation',
] as const

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function randomDob(): string {
  const year = 1950 + Math.floor(Math.random() * 60)
  const month = 1 + Math.floor(Math.random() * 12)
  const day = 1 + Math.floor(Math.random() * 27)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function phoneNumber(): string {
  return `(512) 555-${String(1000 + Math.floor(Math.random() * 9000))}`
}

interface PatientPersona {
  firstName: string
  lastName: string
  dateOfBirth: string
  email: string | null
  phone: string | null
  addressLine1: string
  city: string
  state: string
  postalCode: string
  insuranceProvider: string | null
  insurancePolicyNumber: string | null
  notes: string | null
  isActive: number
  source: string | null
  lifecycle: string
  firstSeenAt: Date
  lastActivityAt: Date | null
}

// Builds a curated set of 15 patients with deterministic glyph + lifecycle
// coverage for the demo. Each index has a meaning — see callers.
function buildPatientPersonas(now: Date): PatientPersona[] {
  const dayMs = 24 * 60 * 60 * 1000
  const austin = CITIES[0]
  function persona(
    firstName: string,
    lastName: string,
    dateOfBirth: string,
    extras: Partial<PatientPersona>,
  ): PatientPersona {
    return {
      firstName,
      lastName,
      dateOfBirth,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone: phoneNumber(),
      addressLine1: `${100 + Math.floor(Math.random() * 900)} ${pick(STREETS)}`,
      city: austin.city,
      state: austin.state,
      postalCode: austin.zip,
      insuranceProvider: 'Delta Dental',
      insurancePolicyNumber: `POL-${Math.floor(Math.random() * 9_000_000) + 1_000_000}`,
      notes: null,
      isActive: 1,
      source: 'manual',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 365 * dayMs),
      lastActivityAt: new Date(now.getTime() - 30 * dayMs),
      ...extras,
    }
  }
  // Build a birthday string that falls within the next 6 days for the
  // birthday-this-week glyph. Year is held fixed at 1992 so the rest of
  // the date math doesn't drift.
  const bdayDate = new Date(now.getTime() + 3 * dayMs)
  const bday = `1992-${String(bdayDate.getMonth() + 1).padStart(2, '0')}-${String(bdayDate.getDate()).padStart(2, '0')}`

  return [
    // [0] Happy-path active patient
    persona('Mia', 'Hayes', '1988-03-12', {
      source: 'referral',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 800 * dayMs),
      lastActivityAt: new Date(now.getTime() - 7 * dayMs),
      notes: 'Prefers morning appointments.',
    }),
    // [1] New patient (★) + missing intake before future visit (📝!)
    persona('Liam', 'Brooks', '1995-08-22', {
      source: 'booking',
      lifecycle: 'new',
      firstSeenAt: new Date(now.getTime() - 9 * dayMs),
      lastActivityAt: new Date(now.getTime() - 9 * dayMs),
    }),
    // [2] Birthday this week (🎂)
    persona('Charlotte', 'Diaz', bday, {
      source: 'referral',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 450 * dayMs),
    }),
    // [3] Outstanding overdue balance ($)
    persona('Marcus', 'Johnson', '1979-11-05', {
      source: 'manual',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 600 * dayMs),
      notes: 'Insurance pre-auth is a pain — call ahead next time.',
    }),
    // [4] Confirmed next-24h appointment (puts them on Today's chair)
    persona('Sophia', 'Iverson', '1991-02-14', {
      source: 'booking',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 200 * dayMs),
    }),
    // [5] Lapsed (💤) — 11 months since last visit, no future
    persona('Aiden', 'Kim', '1965-06-30', {
      source: 'referral',
      lifecycle: 'lapsed',
      firstSeenAt: new Date(now.getTime() - 1500 * dayMs),
      lastActivityAt: new Date(now.getTime() - 330 * dayMs),
    }),
    // [6] At-risk — 7 months since last visit
    persona('Emma', 'Lopez', '1983-12-01', {
      source: 'walk_in',
      lifecycle: 'at_risk',
      firstSeenAt: new Date(now.getTime() - 720 * dayMs),
      lastActivityAt: new Date(now.getTime() - 210 * dayMs),
    }),
    // [7] Has relationship notes + intake on file
    persona('Noah', 'Mitchell', '1972-04-18', {
      source: 'referral',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 900 * dayMs),
      lastActivityAt: new Date(now.getTime() - 14 * dayMs),
      notes: 'Anxious patient — see relationship notes.',
    }),
    // [8..13] Filler active patients
    persona('Olivia', 'Anderson', '1990-09-09', { source: 'booking' }),
    persona('Ethan', 'Carter', '1985-07-25', { source: 'referral' }),
    persona('Isabella', 'Evans', '1978-10-11', { source: 'manual' }),
    persona('Mason', 'Garza', '1996-01-30', { source: 'lead_form', lifecycle: 'lead' }),
    persona('Ava', 'Fischer', '1982-05-19', { source: 'booking' }),
    persona('James', 'Owens', '1969-08-08', { source: 'invite' }),
    // [14] Archived (filter-only)
    persona('Lucas', 'Nguyen', '1955-03-03', {
      isActive: 0,
      lifecycle: 'archived',
      lastActivityAt: new Date(now.getTime() - 700 * dayMs),
    }),
  ]
}

// Demo content — pulled out so the create path and the self-heal path
// for already-seeded demos share one source of truth.
//
// The first stat uses the `dynamic: 'review_count'` flag — the public
// template substitutes `value` with the live count of completed
// `review_request` rows at render time. "happy patients" is the
// ambiguous label (implies positive without claiming a star count we
// can't verify). The demo seeds 7 completed reviews, so this renders as
// "7" on a freshly-seeded demo and grows as platform admins click through.
const DEMO_STATS = [
  { id: 'st_reviews', value: '0', label: 'happy reviews', dynamic: 'review_count' as const },
  { id: 'st2', value: 'Same-week', label: 'appointments available' },
  { id: 'st3', value: 'Most', label: 'insurance accepted' },
]

// Acme's services reference the shared service library by slug — a mix of core
// + special so the /services index grouping + Core/Special nav dropdowns are
// both exercised. Each row pulls name + icon + category from the canonical
// seed (so they stay in sync). Teeth Whitening carries a per-clinic photo +
// offer override so the detail page's promo-ribbon + photo-panel paths get
// exercised on the demo. Built from the seed so a slug rename never drifts.
const DEMO_SERVICE_SLUGS = [
  'family-dental-care',
  'dental-exams',
  'dental-hygiene',
  'teeth-whitening',
  'clear-aligners',
  'dental-implants',
  'oral-surgery', // special
  'iv-sedation', // special
] as const

const DEMO_WHITENING_PHOTO_URL =
  'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=1200&q=80'

// Hand-written per-clinic AI customization blobs for each Acme demo service.
// These mirror what `customizeServiceForClinic` would produce — same shape,
// same structure (process-step count + FAQ count match the canonical seed),
// warm Acme-flavored voice, no fabricated prices. Authored by hand to avoid
// hitting the Anthropic API on every resync (the resync runs on EVERY deploy
// via scripts/resync-demo.mjs — see CLAUDE.md "Deployment & operations").
// The detail-page resolver prefers these over canonical+tokens (1B path)
// whenever they're present + reference the right librarySlug. Real clinics
// in production get real AI rewrites via the generate-on-select picker.
const DEMO_CUSTOMIZED_GENERATED_AT = '2026-06-02T14:00:00Z'
const DEMO_CUSTOMIZED_MODEL_ID = 'claude-sonnet-4-6'

const DEMO_CUSTOMIZED: Record<string, NonNullable<ClinicService['customized']>> = {
  'family-dental-care': {
    heroBullets: [
      'One welcoming dental home for every age',
      'Same-day scheduling so the whole family can come together',
      'Gentle, judgment-free care for adults and little ones',
      'Plain-English explanations, no scare tactics',
    ],
    body:
      "At Acme Dental, we look after the people who matter to you — toddlers learning to brush, teens between school and sports, parents juggling everything, grandparents getting back into a routine. We tailor each visit to the person in the chair and make it easy to book the whole household on the same morning. Families across Austin pick Acme because it just fits real life.",
    processSteps: [
      {
        title: 'A real welcome',
        body:
          "We learn your family's names, ask about anything that's been on your mind, and answer questions before we ever pick up an instrument.",
      },
      {
        title: 'A right-sized exam',
        body:
          "Each family member gets an age-appropriate exam — playful for the little ones, thorough and unhurried for everyone else.",
      },
      {
        title: 'A cleaning + a clear picture',
        body:
          "We clean and polish, then walk you through what we saw using plain words and a screen — no jargon, no pressure.",
      },
      {
        title: 'A simple plan for next time',
        body:
          "We map out recall visits for everyone so nobody slips through the cracks, and we book the next one before you walk out.",
      },
    ],
    faq: [
      {
        question: 'When should our youngest see a dentist for the first time?',
        answer:
          "We love seeing kids around their first birthday — or whenever their first tooth shows up. Early visits are short, warm, and mostly about getting comfortable with the chair.",
      },
      {
        question: 'Can we book the whole family on the same day?',
        answer:
          "That's our specialty. Tell us when you call and we'll do our best to stack everyone's appointments so it's one trip, not four.",
      },
      {
        question: "It's been years since I've been in. Will I get a lecture?",
        answer:
          "Never. Whether you saw a dentist six months ago or six years ago, we meet you where you are — no judgment, no shaming, just a clear next step.",
      },
      {
        question: 'Do you take our insurance?',
        answer:
          "We accept most major PPO plans. Send us your carrier and plan name when you book and we'll verify your coverage before your visit so there are no surprises.",
      },
      {
        question: 'How much do family visits run?',
        answer:
          "Every mouth is different, so cost depends on what each family member needs. We check your insurance first, then walk you through a clear itemized estimate before we begin. If money's tight, just tell us — we can talk through payment options.",
      },
    ],
    generatedAt: DEMO_CUSTOMIZED_GENERATED_AT,
    modelId: DEMO_CUSTOMIZED_MODEL_ID,
  },
  'dental-exams': {
    heroBullets: [
      'A thorough, unhurried checkup',
      'Low-radiation digital X-rays only when they help',
      'Painless oral cancer screening included',
      'Findings shown to you on-screen in plain words',
    ],
    body:
      "Regular exams are how we keep dentistry simple and affordable — small things stay small. At Acme Dental, your exam runs at your pace: we show you what we see, explain what it means in plain English, and let you decide what's next without ever pushing you. Austin patients tell us it's the first dental exam they've actually enjoyed.",
    processSteps: [
      {
        title: 'Catch us up',
        body:
          "We start by chatting through your health history, any changes since last time, and anything specific that's been bothering you.",
      },
      {
        title: 'A careful look',
        body:
          "We examine your teeth, gums, bite, and soft tissues — including a quick, painless oral cancer screening that's part of every exam here.",
      },
      {
        title: 'Images only when they help',
        body:
          "If we need a closer view, we take low-radiation digital X-rays and pull them up on the screen so we can review them together.",
      },
      {
        title: 'Findings, on your terms',
        body:
          "We walk through everything we noticed and lay out your options. No jargon, no pressure — just a clear picture of where things stand.",
      },
    ],
    faq: [
      {
        question: 'How often should I come in for an exam?',
        answer:
          "Most patients do well with an exam and cleaning every six months. We'll suggest a rhythm that fits your mouth and your life — not a one-size-fits-all schedule.",
      },
      {
        question: 'Are digital X-rays safe?',
        answer:
          "Modern digital X-rays use very little radiation, far less than the old film versions. We only take them when they'll genuinely help us care for you.",
      },
      {
        question: 'Will the exam itself hurt?',
        answer:
          "Exams are gentle and non-invasive. If anything ever feels uncomfortable, just say so — we'll pause without making it a thing.",
      },
      {
        question: 'What happens if you find something?',
        answer:
          "We'll show you exactly what we found, explain why it matters, and lay out your options. Then the decision is yours — there's never any pressure to start that day.",
      },
      {
        question: 'How much does a checkup cost?',
        answer:
          "It depends on what we end up doing during your visit. We check your insurance first and give you a clear estimate before we begin, so you're never surprised at the front desk.",
      },
    ],
    generatedAt: DEMO_CUSTOMIZED_GENERATED_AT,
    modelId: DEMO_CUSTOMIZED_MODEL_ID,
  },
  'dental-hygiene': {
    heroBullets: [
      'Gentle, thorough professional cleaning',
      'Clears the buildup brushing can\'t reach',
      'Personalized home-care tips, no nagging',
      'A noticeably fresher, smoother smile',
    ],
    body:
      "Even the most disciplined brushing can't get to the hardened buildup along the gumline — that's what a professional cleaning is for. At Acme Dental our hygienists are gentle, calm, and happy to go slowly. You'll leave with a cleaner mouth and a few simple, judgment-free pointers to keep it that way until next time.",
    processSteps: [
      {
        title: 'A quick check-in',
        body:
          "Your hygienist looks over your history and asks about any sensitivity or anxiety so we can tune the cleaning to you.",
      },
      {
        title: 'Buildup, gone',
        body:
          "We carefully clear plaque and tartar from along the gumline and between teeth — the spots flossing alone can't always reach.",
      },
      {
        title: 'Polish and floss',
        body:
          "A gentle polish leaves your teeth smooth and bright, followed by a careful flossing that you'll actually feel afterward.",
      },
      {
        title: 'Tips you can actually use',
        body:
          "We share a couple of small habits tailored to your mouth so the results last all the way to your next visit.",
      },
    ],
    faq: [
      {
        question: 'How often should I get a cleaning?',
        answer:
          "Twice a year covers most people. If you're prone to buildup or have any gum issues, we may suggest checking in a little more often.",
      },
      {
        question: 'Will the cleaning hurt?',
        answer:
          "Cleanings are usually very comfortable. If your gums are sensitive, tell us at the start and we'll go gently — you can always raise a hand and we'll pause.",
      },
      {
        question: 'My gums bleed when I floss. Is that bad?',
        answer:
          "A little bleeding usually means your gums need more consistent care, not less. We'll show you what's going on and a small daily routine to turn it around.",
      },
      {
        question: 'Will my teeth look whiter after a cleaning?',
        answer:
          "A cleaning removes surface stains and buildup, so most patients notice a fresher, brighter look right away. For a deeper change, ask us about whitening.",
      },
      {
        question: 'How much will the cleaning cost?',
        answer:
          "It depends on what your mouth needs that day. We'll verify your insurance first and give you a clear itemized estimate before anything begins.",
      },
    ],
    generatedAt: DEMO_CUSTOMIZED_GENERATED_AT,
    modelId: DEMO_CUSTOMIZED_MODEL_ID,
  },
  'teeth-whitening': {
    heroBullets: [
      'Visibly brighter results, fast',
      'Professional-strength gel, applied safely',
      'In-office or custom take-home options',
      'A shade tailored to your face, not a billboard',
    ],
    body:
      "Coffee, tea, red wine, and time all leave their mark. Professional whitening at Acme Dental lifts years of stains far more effectively than store-bought strips — and we tailor the final shade so it looks bright and natural, never theatrical. Austin patients love how it feels: a noticeable change you'd actually want to show off.",
    processSteps: [
      {
        title: 'A short consult',
        body:
          "We check your teeth and gums are ready for whitening and talk through the shade you have in mind.",
      },
      {
        title: 'Pick your path',
        body:
          "We'll recommend in-office whitening if you want a fast result, or a custom take-home kit if you'd rather brighten on your own schedule.",
      },
      {
        title: 'Bright, comfortably',
        body:
          "For in-office, we protect your gums and apply professional-strength gel. For take-home, we fit custom trays and walk you through exactly how to use them.",
      },
      {
        title: 'Keep it bright',
        body:
          "We share simple habits to slow new staining so your results last — small adjustments, no special products required.",
      },
    ],
    faq: [
      {
        question: 'Is professional whitening safe?',
        answer:
          "Yes — done professionally, whitening is safe and well-studied. We protect your gums carefully and tailor the strength so you stay comfortable.",
      },
      {
        question: 'How much whiter will I get?',
        answer:
          "Most patients see a noticeable, several-shade improvement. Results vary with the type of staining, and we'll be honest about what to expect in your consult.",
      },
      {
        question: 'Will it make my teeth sensitive?',
        answer:
          "Some people feel mild, temporary sensitivity for a day or two. We can adjust the treatment to keep you comfortable if it's a concern.",
      },
      {
        question: 'How long do the results last?',
        answer:
          "With good habits, results can last many months to a few years. Most patients keep things bright with occasional touch-ups using their take-home tray.",
      },
      {
        question: 'Why not just use whitening strips from the store?',
        answer:
          "Store strips are weaker and don't fit your teeth, so the result is slow and uneven. Professional whitening is stronger, more consistent, and supervised for safety.",
      },
      {
        question: 'How much does whitening cost?',
        answer:
          "It depends on whether you choose in-office or take-home. We'll give you a clear, itemized estimate before you commit — and if you're on a budget, just tell us, we can talk options.",
      },
    ],
    generatedAt: DEMO_CUSTOMIZED_GENERATED_AT,
    modelId: DEMO_CUSTOMIZED_MODEL_ID,
  },
  'clear-aligners': {
    heroBullets: [
      'Nearly invisible while you wear them',
      'Removable for eating, brushing, big moments',
      'No metal brackets, no wires, no scraping',
      'A custom plan designed around your smile',
    ],
    body:
      "Clear aligners straighten teeth without anyone needing to notice. At Acme Dental we design a custom series of smooth, removable trays that gently guide your teeth into place — so you can eat what you like, brush normally, and smile through the whole process with confidence. Plenty of Austin adults have finally fixed something that bothered them for decades.",
    processSteps: [
      {
        title: 'See if aligners fit',
        body:
          "We assess your bite and your goals and let you know honestly whether clear aligners are a good fit for what you'd like to change.",
      },
      {
        title: 'A digital preview',
        body:
          "Using a digital scan, we map out each tooth movement — most patients get to preview the projected result before they commit.",
      },
      {
        title: 'Wear and switch',
        body:
          "You wear each set of aligners as directed and switch to the next on schedule, with quick check-ins to keep things on track.",
      },
      {
        title: 'Reveal and retain',
        body:
          "When the trays have done their work, we fit a retainer so your new smile stays exactly where it belongs.",
      },
    ],
    faq: [
      {
        question: 'How many hours a day do I need to wear them?',
        answer:
          "For the best results, most people wear them 20 to 22 hours a day — taking them out mainly to eat, drink anything besides water, and brush.",
      },
      {
        question: 'Will people notice them?',
        answer:
          "Clear aligners are very discreet. Most patients tell us no one notices unless they bring it up themselves.",
      },
      {
        question: 'Can I eat normally?',
        answer:
          "Yes — you remove the trays to eat and drink, then brush and pop them back in. No food restrictions, which is most people's favorite part.",
      },
      {
        question: 'Are aligners as effective as braces?',
        answer:
          "For many cases, absolutely. For more complex bite work, braces may be the better tool — we'll give you a straight answer about your specific situation.",
      },
      {
        question: 'How much do clear aligners cost?',
        answer:
          "Total cost depends on how complex your case is. We check your insurance for orthodontic benefits, then walk you through a clear estimate and any payment-plan options before you decide.",
      },
    ],
    generatedAt: DEMO_CUSTOMIZED_GENERATED_AT,
    modelId: DEMO_CUSTOMIZED_MODEL_ID,
  },
  'dental-implants': {
    heroBullets: [
      'Looks and feels like a natural tooth',
      'Protects your jawbone and neighboring teeth',
      'A long-lasting, stable solution',
      'A clear plan from start to finish',
    ],
    body:
      "A missing tooth is more than a gap — it can shift neighboring teeth and slowly weaken the jawbone underneath. A dental implant replaces the whole tooth, root and all, for a result that looks, feels, and functions like the real thing. At Acme Dental we walk you through every step calmly, so the process feels manageable and the result lasts.",
    processSteps: [
      {
        title: 'Plan your implant',
        body:
          "We assess your jaw and surrounding teeth with precise imaging and map out a plan tailored to your mouth.",
      },
      {
        title: 'Place the implant',
        body:
          "We gently place a small titanium post that acts as the new tooth root, keeping you numb and comfortable throughout.",
      },
      {
        title: 'Heal and integrate',
        body:
          "Over a few months the implant fuses naturally with your bone to form a rock-solid foundation. We check in along the way so nothing feels uncertain.",
      },
      {
        title: 'Add your new tooth',
        body:
          "Once healed, we attach a custom crown matched to your natural teeth — so it blends right in.",
      },
    ],
    faq: [
      {
        question: 'Do implants hurt?',
        answer:
          "The procedure is done with anesthesia, and most patients are surprised how comfortable it is. Any soreness afterward is usually mild and short-lived.",
      },
      {
        question: 'How long do implants last?',
        answer:
          "With good care, implants can last decades — often a lifetime. They're one of the most durable tooth-replacement options available.",
      },
      {
        question: 'Why an implant instead of a bridge or denture?',
        answer:
          "Implants stand on their own without altering neighboring teeth and help preserve your jawbone over time. We'll walk through every option honestly.",
      },
      {
        question: 'How long does the whole process take?',
        answer:
          "Because the implant needs time to fuse with bone, the full process usually spans a few months. We'll give you a realistic timeline up front.",
      },
      {
        question: 'How much do dental implants cost?',
        answer:
          "Cost depends on what your case needs — the implant itself, the crown on top, and any prep work. We verify insurance first and give you a clear estimate before anything begins.",
      },
    ],
    generatedAt: DEMO_CUSTOMIZED_GENERATED_AT,
    modelId: DEMO_CUSTOMIZED_MODEL_ID,
  },
  'oral-surgery': {
    heroBullets: [
      'Experienced, gentle surgical care',
      'Sedation and comfort options for every patient',
      'Clear pre- and post-op guidance, in writing',
      'A calm, reassuring room — not a clinical maze',
    ],
    body:
      "\"Surgery\" sounds scary, but most oral procedures are routine, well-practiced, and far more comfortable than people expect. At Acme Dental we explain everything in plain language, offer sedation when it helps, and keep you calm and pain-free from the moment you sit down to the moment you walk out.",
    processSteps: [
      {
        title: 'Consult and plan',
        body:
          "We review your imaging together, walk through the procedure step by step, and answer every question so nothing feels uncertain.",
      },
      {
        title: 'Choose your comfort level',
        body:
          "From local anesthesia to deeper sedation, we help you pick the option that suits your comfort and your anxiety — not a default.",
      },
      {
        title: 'A precise, gentle procedure',
        body:
          "Our team works carefully and efficiently, checking in with you throughout so you're never wondering what's happening.",
      },
      {
        title: 'Recovery, supported',
        body:
          "We send you home with clear, written aftercare instructions and stay available for questions as you heal.",
      },
    ],
    faq: [
      {
        question: 'Will I be awake during the procedure?',
        answer:
          "That's up to you. Many procedures are done with local anesthesia, but sedation options are available if you'd rather be deeply relaxed or asleep.",
      },
      {
        question: 'How long is recovery?',
        answer:
          "Most patients recover from routine procedures within a few days. We'll give you specific aftercare guidance for your situation so there are no surprises.",
      },
      {
        question: 'Is oral surgery painful?',
        answer:
          "You'll be fully numb during the procedure, and we'll help you manage any soreness afterward. Most patients find it far easier than they feared.",
      },
      {
        question: "I'm very anxious. Can you help?",
        answer:
          "Absolutely. Tell us how you're feeling when you book — we'll explain each step, offer sedation, and go at a pace that keeps you comfortable.",
      },
      {
        question: 'How much does oral surgery cost?',
        answer:
          "Cost depends on the procedure and any sedation. We verify your insurance first, then give you a clear written estimate before treatment begins.",
      },
    ],
    generatedAt: DEMO_CUSTOMIZED_GENERATED_AT,
    modelId: DEMO_CUSTOMIZED_MODEL_ID,
  },
  'iv-sedation': {
    heroBullets: [
      'Deep, comfortable relaxation',
      'Built for patients with dental anxiety',
      'Great for longer procedures',
      'Monitored by trained clinicians throughout',
    ],
    body:
      "For patients with strong dental anxiety — or longer procedures you'd rather not remember — IV sedation offers a deeply relaxed, comfortable experience. At Acme Dental sedation is administered and monitored by trained clinicians, so you can get the care you need while staying calm and safe from start to finish.",
    processSteps: [
      {
        title: 'Review your health and goals',
        body:
          "We go over your medical history and what you're hoping for so we can plan sedation safely around your needs.",
      },
      {
        title: 'Prepare for your visit',
        body:
          "We give you simple pre-appointment instructions and help arrange someone to drive you home afterward.",
      },
      {
        title: 'Relax through treatment',
        body:
          "Sedation is administered and carefully monitored while we complete your treatment — many patients barely remember any of it.",
      },
      {
        title: 'Recover comfortably',
        body:
          "We make sure you're stable and comfortable before you leave, with clear written guidance for the rest of your day.",
      },
    ],
    faq: [
      {
        question: 'Will I be unconscious?',
        answer:
          "You'll be deeply relaxed and may drift in and out, but it's not the same as general anesthesia. Most patients simply don't remember the procedure afterward.",
      },
      {
        question: 'Is IV sedation safe?',
        answer:
          "Administered and monitored by trained clinicians, sedation is very safe. We review your health history carefully and watch you closely throughout.",
      },
      {
        question: 'Who is a good candidate?',
        answer:
          "It's ideal for patients with strong dental anxiety, a sensitive gag reflex, or longer procedures. We'll help you decide if it's the right choice for you.",
      },
      {
        question: 'Do I need someone to drive me home?',
        answer:
          "Yes — because the effects linger for a while, you'll need a trusted person to drive you home and stay with you for the rest of the day.",
      },
      {
        question: 'How much does IV sedation cost?',
        answer:
          "Cost depends on the underlying procedure and how long sedation is needed. We verify insurance first and give you a clear estimate before treatment begins.",
      },
    ],
    generatedAt: DEMO_CUSTOMIZED_GENERATED_AT,
    modelId: DEMO_CUSTOMIZED_MODEL_ID,
  },
}

function buildDemoServices(): ClinicService[] {
  const bySlug = new Map(SERVICE_LIBRARY_SEED.map((e) => [e.slug, e]))
  return DEMO_SERVICE_SLUGS.map((slug, i) => {
    const entry = bySlug.get(slug)!
    const base: ClinicService = {
      id: `svc_${i + 1}`,
      librarySlug: slug,
      name: entry.name,
      category: entry.category,
      icon: entry.icon ?? null,
      // 1B — hand-written customization blob so the demo shows the
      // AI-customized path without burning Anthropic spend on every
      // resync (which runs on every deploy). Real clinics get real AI
      // rewrites via the picker.
      customized: DEMO_CUSTOMIZED[slug] ?? null,
    }
    if (slug === 'teeth-whitening') {
      // Per-clinic override example — exercises the photo panel + promo ribbon.
      base.photoUrl = DEMO_WHITENING_PHOTO_URL
      base.offer = 'New patient special — ask us about whitening'
    }
    return base
  })
}

/** Exported for unit testing — see tests/demo-mode/demo-services-customized.test.ts. */
export const DEMO_SERVICES: ClinicService[] = buildDemoServices()

// Universal PPO carrier list shown in the public site's Insurance section
// + populated into the verifier-form carrier dropdown. Covers the major
// US dental PPO + dental-rider medical payers most family practices
// accept. Clinics replace this with their actual accepted list via
// /settings/clinic; the self-heal block ONLY backfills when null or
// shorter than the current default (legacy demos predating list growth
// get topped up; clinic-edited lists stay untouched).
const DEMO_INSURANCE_CARRIERS: string[] = [
  'Aetna',
  'Ameritas',
  'Anthem / BlueCross BlueShield',
  'Cigna',
  'Delta Dental',
  'GEHA',
  'Guardian',
  'Humana',
  'Lincoln Financial',
  'MetLife',
  'Principal',
  'Sun Life Financial',
  'United Concordia (UCCI)',
  'United Healthcare (UHC)',
]

// Acme demo payment-method list — matches DEFAULT_PAYMENT_METHODS in shape
// but is duplicated here so the seeded demo doesn't drift if the universal
// fallback ever moves. Same 5 entries every US dental practice can claim.
const DEMO_PAYMENT_METHODS: string[] = [
  'Cash',
  'Credit & debit cards',
  'HSA / FSA cards',
  'Apple Pay & Google Pay',
  'ACH bank transfer',
]

// Two demo financing partners — the two most common in US dental
// (CareCredit + Sunbit). applyUrl points at each company's homepage (NOT
// a hotlink-protected affiliate URL we don't control) so the demo render
// stays stable.
const DEMO_FINANCING_PARTNERS = [
  {
    id: 'fp-carecredit',
    name: 'CareCredit',
    description:
      'Health & wellness credit card with promotional 0% APR financing for qualifying purchases over $200.',
    applyUrl: 'https://www.carecredit.com',
    logoUrl: null,
  },
  {
    id: 'fp-sunbit',
    name: 'Sunbit',
    description:
      'Soft credit check, fast pre-approval, flexible monthly payments for treatment plans of any size.',
    applyUrl: 'https://www.sunbit.com',
    logoUrl: null,
  },
]

// Warm, demo-clinic cancellation policy. Plain prose, no specific dollar
// amounts — each real clinic fills theirs in.
const DEMO_CANCELLATION_POLICY =
  "We ask for 24 hours notice when you need to cancel or reschedule. Life happens, so we'll always try to work with you — just call or message us as soon as you know. If you no-show without letting us know, we may ask for a small deposit to hold your next visit. We promise to be reasonable about it."

/**
 * Self-heal helper for legacy demos that seeded the hardcoded "8,000+
 * five-star reviews" stat before the `dynamic: 'review_count'` pattern
 * existed. Returns a new stats array with the legacy stat upgraded to
 * the dynamic version, or `null` if no upgrade is needed (current
 * dynamic stat already in place, or the demo has been hand-edited away
 * from the recognizable legacy shape).
 *
 * Exported for unit testing.
 */
export function upgradeLegacyDemoStats(stats: ClinicStat[] | null): ClinicStat[] | null {
  if (!stats || !Array.isArray(stats)) return null
  let changed = false
  const next = stats.map((s) => {
    // Recognize the legacy seeded shape — either the original id or the
    // original value/label pair. Swap it for the dynamic stat so the
    // demo shows live data on next render.
    if (
      !s.dynamic &&
      (s.id === 'st1' ||
        s.value === '8,000+' ||
        (s.label ?? '').toLowerCase() === 'five-star reviews')
    ) {
      changed = true
      return {
        id: 'st_reviews',
        value: '0',
        label: 'happy reviews',
        dynamic: 'review_count' as const,
      }
    }
    // Second-pass migration: the initial cut of the dynamic stat shipped
    // with the label "happy patients", which read like the clinic had only
    // a handful of patients total ("7 happy patients" felt embarrassing).
    // Relabel to "happy reviews" so the count clearly refers to reviews.
    if (s.dynamic === 'review_count' && (s.label ?? '').toLowerCase() === 'happy patients') {
      changed = true
      return { ...s, label: 'happy reviews' }
    }
    return s
  })
  return changed ? next : null
}

/**
 * SINGLE SOURCE OF TRUTH for demo review text. Keyed by patientIdx. Used
 * to populate review_request.reviewText on completed seeds AND to build
 * the featured-testimonial array on the public site — so the quote a
 * staff member sees in /reviews/received exactly matches what the public
 * shows once "Feature on website" is clicked (mirrors the production
 * path: featureReviewAsTestimonial sources the quote from
 * review_request.reviewText).
 */
const DEMO_REVIEW_TEXTS: Record<number, { text: string; rating: number }> = {
  // Mia Hayes (idx 0) — completed Google · 5d ago
  0: {
    text:
      "I dreaded the dentist for years. Acme treated me like a person, not a tooth. I actually look forward to my cleanings now — I can't believe I'm saying that.",
    rating: 5,
  },
  // Liam Brooks (idx 1) — completed Healthgrades · 8d ago. NOT pre-featured.
  1: {
    text:
      "First visit and they made me feel like a regular. Hygienist explained every step before doing it. No upsells, no pressure to bleach my teeth, no pamphlet about implants. Just good dental care.",
    rating: 5,
  },
  // Charlotte Diaz (idx 2) — completed Google · 18d ago
  2: {
    text:
      "My six-year-old used to cry on the way to her old dentist. After two visits with the hygiene team here she now ASKS when her next cleaning is. Whatever you're doing, please keep doing it.",
    rating: 5,
  },
  // Emma Lopez (idx 6) — completed Facebook · 22d ago
  6: {
    text:
      "I came in scared after a bad experience years ago. Dr. Reyes walked me through every step before doing anything. The crown they placed feels exactly like my real tooth. No exaggeration — best dental visit of my life.",
    rating: 5,
  },
  // Noah Mitchell (idx 7) — completed Healthgrades · 12d ago
  7: {
    text:
      "Booked online at 11pm on a Sunday, sat in the chair Tuesday morning. The team explained every step of my treatment plan before any work — no surprises, no upsells.",
    rating: 5,
  },
  // Mason Garza (idx 11) — completed Google · 35d ago
  11: {
    text:
      "Front desk got my insurance pre-auth back in 48 hours after my old office took three weeks to lose the paperwork twice. They actually do what they say they will. That alone is worth switching.",
    rating: 4,
  },
  // Ava Fischer (idx 12) — completed Google · 28d ago. NOT pre-featured.
  12: {
    text:
      "Came in for what I thought would be a routine cleaning and the hygienist caught a small cavity I had no idea about. Caught it early, painless filling, in and out under an hour. Grateful.",
    rating: 5,
  },
  // Aiden Kim (idx 5) — fallback text for legacy demos that seeded him as a
  // completed review before this PR. Not in current REVIEW_SEEDS as completed
  // (he's the lapsed persona), but the backfill self-heal picks him up if a
  // legacy seed put a completed review on his row.
  5: {
    text:
      "It had been a while since I'd been to the dentist and I was honestly dreading the lecture. There wasn't one. They just cleaned my teeth, answered my questions, and booked me back in. That's exactly what I needed.",
    rating: 5,
  },
}

/** Patient indices whose reviews are pre-featured on the public site. The
 *  rest of the DEMO_REVIEW_TEXTS entries stay as "received but not yet
 *  featured" so /reviews/received has live targets for the Feature CTA. */
const DEMO_FEATURED_PATIENT_IDXS: number[] = [0, 2, 6, 7, 11]

/** One free-text testimonial — no patientId. Kept so the demo also exercises
 *  the legacy unlinked path that hand-curated content uses. */
const DEMO_FREE_TEXT_TESTIMONIAL = {
  authorName: 'Jen R.',
  authorLocation: 'Cedar Park, TX' as string | null,
  quote:
    "My kids actually ASK to go to Acme. The hygienist remembered that Lily likes the bubblegum fluoride. Small thing — huge difference for a six-year-old.",
}

/** Build the final testimonial JSON from DEMO_REVIEW_TEXTS + the seeded
 *  patients, applying the same "First L." + city denormalization that
 *  featureReviewAsTestimonial uses in production. */
function buildDemoTestimonials(
  patientIds: string[],
  personas: Array<{ firstName: string; lastName: string; city: string | null; state: string | null }>,
) {
  const items: Array<{
    id: string
    quote: string
    authorName: string
    authorLocation: string | null
    authorPhotoUrl: string | null
    patientId: string | null
  }> = []
  let counter = 1
  for (const patientIdx of DEMO_FEATURED_PATIENT_IDXS) {
    if (!patientIds[patientIdx] || !personas[patientIdx]) continue
    const review = DEMO_REVIEW_TEXTS[patientIdx]
    if (!review) continue
    const p = personas[patientIdx]
    const initial = (p.lastName.trim()[0] ?? '').toUpperCase()
    const authorName = initial ? `${p.firstName} ${initial}.` : p.firstName
    const authorLocation =
      p.city && p.state ? `${p.city}, ${p.state}` : p.city || p.state || null
    items.push({
      id: `t${counter++}`,
      quote: review.text,
      authorName,
      authorLocation,
      authorPhotoUrl: null,
      patientId: patientIds[patientIdx],
    })
  }
  // Append the free-text legacy testimonial last (no patient link).
  items.push({
    id: `t${counter++}`,
    quote: DEMO_FREE_TEXT_TESTIMONIAL.quote,
    authorName: DEMO_FREE_TEXT_TESTIMONIAL.authorName,
    authorLocation: DEMO_FREE_TEXT_TESTIMONIAL.authorLocation,
    authorPhotoUrl: null,
    patientId: null,
  })
  return items
}

/**
 * Round a Date down to the nearest :00 or :30 minute boundary. Used when
 * seeding demo appointments so times look like a real clinic schedule
 * regardless of when the seeder runs.
 */
function snapToHalfHour(d: Date): Date {
  const r = new Date(d)
  r.setMinutes(r.getMinutes() < 30 ? 0 : 30, 0, 0)
  return r
}

// Logo + hero image for the demo clinic. Unsplash assets keep us
// dependency-free and consistent with how DEMO_OFFICE_PHOTOS works.
const DEMO_LOGO_URL =
  'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=200&h=200&fit=crop&q=80'
const DEMO_HERO_IMAGE_URL =
  'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=2000&q=80'
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
const DEMO_DIFFERENCE_VIDEO_URL =
  'https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/demo-assets/dental-difference.mp4'

const DEMO_OFFICE_PHOTOS = [
  {
    id: 'op1',
    url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80',
    alt: 'Modern dental treatment room with natural light',
    caption: null,
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

export async function createDemoClinic(): Promise<DemoClinicResult> {
  const name = 'Acme Dental Demo'
  const slug = slugify(name)

  // Seed the platform-owned canonical service library (idempotent — upserts
  // by slug). Acme's services + every clinic's /services pages read from it,
  // so it must exist before we wire the demo's library-linked services below.
  await seedServiceLibrary()

  // Idempotent: bail early if the slug already exists.
  const [existing] = await db
    .select({ id: schema.organization.id, name: schema.organization.name, slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug))
    .limit(1)
  if (existing) {
    // Self-heal: flag legacy demos (seeded before the is_demo column
    // existed) so they're excluded from platform business metrics.
    await db
      .update(schema.organization)
      .set({ isDemo: true })
      .where(eq(schema.organization.id, existing.id))

    // Keep the demo on the current template defaults so it always
    // showcases the latest visual direction. Runs every time the
    // "Create demo clinic" button is hit on an already-seeded demo.
    //
    // - bump sky-blue brand to sage if still on the pre-warm-neutral default
    // - backfill stats / testimonials / officePhotos when columns are null
    //   (e.g. demo seeded before those fields existed)
    const [profile] = await db
      .select({
        brandColor: schema.clinicProfile.brandColor,
        about: schema.clinicProfile.about,
        tagline: schema.clinicProfile.tagline,
        services: schema.clinicProfile.services,
        stats: schema.clinicProfile.stats,
        testimonials: schema.clinicProfile.testimonials,
        officePhotos: schema.clinicProfile.officePhotos,
        logoUrl: schema.clinicProfile.logoUrl,
        heroImageUrl: schema.clinicProfile.heroImageUrl,
        differenceVideoUrl: schema.clinicProfile.differenceVideoUrl,
        faq: schema.clinicProfile.faq,
        acceptedInsuranceCarriers: schema.clinicProfile.acceptedInsuranceCarriers,
        paymentMethods: schema.clinicProfile.paymentMethods,
        financingPartners: schema.clinicProfile.financingPartners,
        cancellationPolicy: schema.clinicProfile.cancellationPolicy,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, existing.id))
      .limit(1)

    const patch: Partial<typeof schema.clinicProfile.$inferInsert> = {}
    if (profile?.brandColor === '#0ea5e9') patch.brandColor = '#9CAF9F'
    // About + tagline upgrade: legacy demos shipped with a meta-disclosure
    // "this is a demonstration clinic seeded by..." paragraph that broke the
    // public-site immersion. Replace it with real warm copy so the demo looks
    // like a real clinic site. Skips when the demo has been hand-edited.
    if (
      !profile?.about ||
      profile.about.startsWith('Acme Dental is a demonstration clinic')
    ) {
      patch.about =
        'We started Acme to make going to the dentist feel like going to any other thoughtful, modern place. Calm rooms, plain-English explanations, no judgment about how long it\'s been. Whether it\'s your first cleaning in years or a routine check-up, you\'ll be in good hands — and out the door knowing exactly what happened and why.'
    }
    if (!profile?.tagline || profile.tagline === 'Bright smiles, gentle care') {
      patch.tagline = 'Dental care that finally feels human.'
    }
    if (!profile?.stats) {
      patch.stats = DEMO_STATS
    } else {
      // Stats backfill: legacy demos seeded the static "8,000+ five-star
      // reviews" stat before the dynamic-stat pattern existed. Swap it for
      // the live `review_count` stat so the demo shows real data and
      // exercises the dynamic substitution path. Skips when stats have
      // been hand-edited away from the demo defaults.
      const upgraded = upgradeLegacyDemoStats(profile.stats as ClinicStat[] | null)
      if (upgraded) patch.stats = upgraded
    }
    // Services self-heal: legacy demos seeded free-text services (no
    // librarySlug) before the service-library checkpoint. Replace them with
    // the curated library-linked set so the /services index grouping +
    // Core/Special nav dropdowns + detail pages all light up. Idempotent —
    // skips when the services already reference library slugs (so a demo a
    // platform admin re-themed past the defaults isn't clobbered).
    //
    // Two-stage backfill: if services are already library-linked but missing
    // the 1B `customized` blobs (i.e. seeded BEFORE 1B), top them up with
    // the hand-written demo blobs from DEMO_CUSTOMIZED so the public site
    // detail pages exercise the customized path on next render.
    {
      const storedServices = Array.isArray(profile?.services)
        ? (profile!.services as ClinicService[])
        : null
      const alreadyLibraryLinked =
        storedServices !== null &&
        storedServices.some((s) => typeof s?.librarySlug === 'string' && s.librarySlug)
      if (!alreadyLibraryLinked) {
        patch.services = DEMO_SERVICES
      } else if (storedServices) {
        const missingCustomized = storedServices.some(
          (s) =>
            typeof s?.librarySlug === 'string' &&
            DEMO_CUSTOMIZED[s.librarySlug] &&
            !s.customized,
        )
        if (missingCustomized) {
          patch.services = storedServices.map((s) => {
            if (
              typeof s?.librarySlug === 'string' &&
              DEMO_CUSTOMIZED[s.librarySlug] &&
              !s.customized
            ) {
              return { ...s, customized: DEMO_CUSTOMIZED[s.librarySlug] }
            }
            return s
          })
        }
      }
    }
    // testimonials are handled by the dedicated self-heal below — it needs
    // existingPatientIds (only available later in this block) so each
    // seeded testimonial can link to a real CRM patient.
    if (!profile?.officePhotos) patch.officePhotos = DEMO_OFFICE_PHOTOS
    if (!profile?.logoUrl) patch.logoUrl = DEMO_LOGO_URL
    if (!profile?.heroImageUrl) patch.heroImageUrl = DEMO_HERO_IMAGE_URL
    // Difference-video backfill: legacy demos predate migration 0037 + the
    // ambient autoplay loop in the "Why us?" section. Also overwrite the
    // first-pass Pexels URL — Pexels hotlink-blocked the mp4 endpoint with
    // a 403, so the section was rendering a blank card. The S3-hosted
    // mirror is reliable; force-replace the broken Pexels URL on next entry.
    if (
      !profile?.differenceVideoUrl ||
      profile.differenceVideoUrl.includes('videos.pexels.com')
    ) {
      patch.differenceVideoUrl = DEMO_DIFFERENCE_VIDEO_URL
    }
    // FAQ backfill: legacy demos seeded before migration 0036 added the
    // faq column have null here, so the public /faq page falls back to the
    // universal DEFAULT_FAQ_ITEMS but the demo is missing its "edited"
    // state. Seed the defaults so the editor + render-from-DB path both
    // exercise the column. Skips when the demo has been hand-edited.
    if (!profile?.faq) patch.faq = DEFAULT_FAQ_ITEMS
    // Insurance carriers backfill: migration 0038 added the column. Seed
    // the universal PPO list so the public site's Insurance section + the
    // carrier dropdown on the verifier form both render with realistic
    // content on legacy demos. Also tops up demos that were seeded
    // BEFORE the list grew to the current default — we detect "stale
    // demo defaults" by comparing against the size of the current full
    // list and overwriting when the stored array is smaller. A clinic
    // that has CURATED a shorter list still wins by virtue of the
    // typical clinic-edited array containing names outside our default
    // set; we only overwrite when every stored entry is also in the
    // current default (i.e. a pure subset of stale demo seed data).
    const currentSet = new Set(DEMO_INSURANCE_CARRIERS)
    const stored = Array.isArray(profile?.acceptedInsuranceCarriers)
      ? (profile!.acceptedInsuranceCarriers as unknown[]).filter(
          (c): c is string => typeof c === 'string',
        )
      : null
    const isStaleDemoSubset =
      stored !== null &&
      stored.length < DEMO_INSURANCE_CARRIERS.length &&
      stored.every((c) => currentSet.has(c))
    if (stored === null || isStaleDemoSubset) {
      patch.acceptedInsuranceCarriers = DEMO_INSURANCE_CARRIERS
    }
    // Patients dropdown backfill (migration 0041 — Checkpoint 2). Legacy
    // demos predate the /insurance + /payment-financing + /dental-plans
    // pages and have null for paymentMethods / financingPartners /
    // cancellationPolicy. Seed all three so the demo exercises the full
    // Patients dropdown render path. Each column only backfills when
    // null — a real clinic that hand-edited any of these stays untouched.
    if (!profile?.paymentMethods) patch.paymentMethods = DEMO_PAYMENT_METHODS
    if (!profile?.financingPartners) {
      patch.financingPartners = DEMO_FINANCING_PARTNERS
    }
    if (!profile?.cancellationPolicy) {
      patch.cancellationPolicy = DEMO_CANCELLATION_POLICY
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(schema.clinicProfile)
        .set(patch)
        .where(eq(schema.clinicProfile.organizationId, existing.id))
    }
    // Seed the default intake form if the demo predates the forms feature.
    await seedDefaultIntakeForm(existing.id)

    // Self-heal patient_note + form_submission rows when missing. We can't
    // re-pick the original persona indices (those IDs are gone), so we
    // just attach a few generic samples to the first patients we find.
    // A full reset still requires the "Create demo clinic" flow on a wiped
    // demo — but this at least makes the Notes + Forms tabs non-empty.
    const existingPatientsForHeal = await db
      .select({ id: schema.patient.id, email: schema.patient.email, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, existing.id))
      .limit(8)
    if (existingPatientsForHeal.length > 0) {
      const [noteFound] = await db
        .select({ id: schema.patientNote.id })
        .from(schema.patientNote)
        .where(eq(schema.patientNote.organizationId, existing.id))
        .limit(1)
      if (!noteFound) {
        const noteBodies = [
          'Prefers Dr. Patel for cleanings. Loves the warm towels.',
          'Tried to reach in 2024-09 — left voicemail. Try again next quarter.',
          'Highly anxious. Always pre-medicate with halcion + use nitrous.',
        ]
        for (let i = 0; i < Math.min(3, existingPatientsForHeal.length); i++) {
          await db.insert(schema.patientNote).values({
            id: newId('pnote'),
            organizationId: existing.id,
            patientId: existingPatientsForHeal[i].id,
            authorId: null,
            body: noteBodies[i],
          })
        }
      }

      const [subFound] = await db
        .select({ id: schema.formSubmission.id })
        .from(schema.formSubmission)
        .where(eq(schema.formSubmission.organizationId, existing.id))
        .limit(1)
      if (!subFound) {
        const [defaultForm] = await db
          .select({ id: schema.formTemplate.id })
          .from(schema.formTemplate)
          .where(eq(schema.formTemplate.organizationId, existing.id))
          .limit(1)
        if (defaultForm) {
          for (let i = 0; i < Math.min(3, existingPatientsForHeal.length); i++) {
            const p = existingPatientsForHeal[i]
            await db.insert(schema.formSubmission).values({
              id: newId('sub'),
              organizationId: existing.id,
              formTemplateId: defaultForm.id,
              patientId: p.id,
              appointmentId: null,
              data: { intake: 'sample' },
              submitterName: `${p.firstName} ${p.lastName}`,
              submitterEmail: p.email,
              submitterPhone: null,
              submittedAt: new Date(Date.now() - (60 + i * 30) * 24 * 60 * 60 * 1000),
            })
          }
        }
      }
    }

    // Appointments module v1 self-heal: clinic_provider + reminder log +
    // appointment.source + appointment.providerId backfill. Existing
    // demos predate these columns.
    const [providerFound] = await db
      .select({ id: schema.clinicProvider.id })
      .from(schema.clinicProvider)
      .where(eq(schema.clinicProvider.organizationId, existing.id))
      .limit(1)
    const dentistId = providerFound?.id ?? newId('prov')
    const hygienistId = newId('prov')
    if (!providerFound) {
      await db.insert(schema.clinicProvider).values([
        { id: dentistId, organizationId: existing.id, displayName: 'Dr. Jordan Reyes', role: 'dentist', email: 'jordan@acme-dental.example' },
        { id: hygienistId, organizationId: existing.id, displayName: 'Maria Vega, RDH', role: 'hygienist', email: 'maria@acme-dental.example' },
      ])

      // Backfill providerId on existing appointments: cleanings go to the
      // hygienist, everything else to the dentist. Only touches rows that
      // currently have no provider attached so this is idempotent if the
      // self-heal re-runs.
      await db
        .update(schema.appointment)
        .set({ providerId: hygienistId })
        .where(
          and(
            eq(schema.appointment.organizationId, existing.id),
            eq(schema.appointment.type, 'cleaning'),
            isNull(schema.appointment.providerId),
          ),
        )
      await db
        .update(schema.appointment)
        .set({ providerId: dentistId })
        .where(
          and(
            eq(schema.appointment.organizationId, existing.id),
            isNull(schema.appointment.providerId),
          ),
        )
    }

    // Backfill appointment.source = 'manual' on rows that lack one. Cheap
    // and idempotent (rows that already have a source are untouched).
    await db
      .update(schema.appointment)
      .set({ source: 'manual' })
      .where(
        and(
          eq(schema.appointment.organizationId, existing.id),
          isNull(schema.appointment.source),
        ),
      )

    // SEO module: give the demo's public-booking visits a realistic
    // traffic-source mix so the organic→booking funnel is populated.
    await backfillDemoBookingAttribution(existing.id)

    // Seed one reminder log row against an existing future appointment so
    // the drawer's reminder-activity stripe isn't empty.
    const [reminderFound] = await db
      .select({ id: schema.appointmentReminderLog.id })
      .from(schema.appointmentReminderLog)
      .where(eq(schema.appointmentReminderLog.organizationId, existing.id))
      .limit(1)
    if (!reminderFound) {
      const [futureAppt] = await db
        .select({ id: schema.appointment.id })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, existing.id),
            gte(schema.appointment.startTime, new Date()),
          ),
        )
        .limit(1)
      if (futureAppt) {
        await db.insert(schema.appointmentReminderLog).values({
          id: newId('rem'),
          organizationId: existing.id,
          appointmentId: futureAppt.id,
          channel: 'email',
          template: 'default_reminder',
        })
      }
    }

    // Leads module self-heal: top up to the full 6 curated leads so the
    // demo always showcases every glyph state on /leads — fresh / aging
    // / stale / contacted / converted / archived. Additive + idempotent:
    // checks existing lead names + only inserts the ones that are
    // missing. Legacy demos previously seeded with the sparse 3-lead set
    // get topped up to 6 on the next "View as clinic" entry.
    const existingLeads = await db
      .select({ name: schema.lead.name })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, existing.id))
    const existingLeadNames = new Set(existingLeads.map((r) => r.name))
    // Look up Emma Lopez patient by name so the converted-lead seed can
    // point at her. `null` if she doesn't exist on this demo (older
    // demo predates persona 6) — convert link just stays unset then.
    const [emmaPatient] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, existing.id),
          eq(schema.patient.firstName, 'Emma'),
          eq(schema.patient.lastName, 'Lopez'),
        ),
      )
      .limit(1)
    await seedLeadsForOrg(existing.id, new Date(), emmaPatient?.id ?? null, existingLeadNames)

    // Recall & Outreach self-heal: top up to the full audience + campaign
    // + events set. Additive + idempotent. Each pre-fetch is one query.
    const existingAudienceRows = await db
      .select({ id: schema.audiences.id, name: schema.audiences.name })
      .from(schema.audiences)
      .where(eq(schema.audiences.organizationId, existing.id))
    const existingAudiencesByName = new Map(existingAudienceRows.map((r) => [r.name, r.id]))
    const existingCampaignRows = await db
      .select({ id: schema.campaigns.id, name: schema.campaigns.name })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.organizationId, existing.id))
    const existingCampaignsByName = new Map(existingCampaignRows.map((r) => [r.name, r.id]))
    const existingPatientRows = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, existing.id))
    const existingPatientIds = existingPatientRows.map((r) => r.id)
    await seedRecallOutreachForOrg(
      existing.id,
      new Date(),
      existingPatientIds,
      existingAudiencesByName,
      existingCampaignsByName,
    )

    // Patient Communications self-heal: top up to the seeded thread set.
    // Additive + idempotent — checks existing thread patient ids before
    // inserting.
    const existingThreadRows = await db
      .select({ patientId: schema.patientThread.patientId })
      .from(schema.patientThread)
      .where(eq(schema.patientThread.organizationId, existing.id))
    const existingThreadPatientIds = new Set(existingThreadRows.map((r) => r.patientId))
    await seedPatientMessagesForOrg(existing.id, new Date(), existingPatientIds, existingThreadPatientIds)

    // Top up Sophia's thread with historical in-app inbounds so legacy
    // demos exercise the "{patient} prefers {channel}" composer label
    // (which needs ≥3 inbound messages on one channel). Idempotent: only
    // inserts when count is still below the threshold.
    await topUpSophiaPreferenceMessages(existing.id, existingPatientIds, new Date())

    // Testimonials self-heal: legacy demos seeded fabricated "Sarah K."
    // testimonials with no patientId — they don't correspond to any CRM
    // patient. Idempotent: only patches when none of the existing
    // testimonials are linked to a real patient yet. We rebuild from seed
    // so the rendered testimonials match the patients who actually
    // completed reviews (Mia, Noah) plus one free-text legacy entry.
    await topUpLinkedDemoTestimonials(existing.id, existingPatientIds)

    // Reviews self-heal: top up config + review requests for legacy demos.
    const existingReviewConfigRows = await db
      .select({ id: schema.clinicReviewConfig.organizationId })
      .from(schema.clinicReviewConfig)
      .where(eq(schema.clinicReviewConfig.organizationId, existing.id))
    const existingReviewRequestRows = await db
      .select({ patientId: schema.reviewRequest.patientId })
      .from(schema.reviewRequest)
      .where(eq(schema.reviewRequest.organizationId, existing.id))
    const existingReviewPatients = new Set(existingReviewRequestRows.map((r) => r.patientId))
    await seedReviewsForOrg(
      existing.id,
      new Date(),
      existingPatientIds,
      existingReviewConfigRows.length > 0,
      existingReviewPatients,
    )

    // Review-text backfill: legacy demos seeded review_request rows before
    // migration 0035 added `review_text`, so completed reviews show "no copy
    // here" on /reviews/received even though the public testimonials have
    // the text. Backfills review_text + rating on any completed review_request
    // whose patient matches a DEMO_REVIEW_TEXTS entry. Idempotent —
    // skips rows that already have non-null text.
    await topUpDemoReviewText(existing.id)

    // Blog self-heal: top up the curated post set. Additive + idempotent —
    // checks existing slugs so legacy demos pick up the blog on next entry.
    const existingBlogRows = await db
      .select({ slug: schema.blogPost.slug })
      .from(schema.blogPost)
      .where(eq(schema.blogPost.organizationId, existing.id))
    await seedBlogPostsForOrg(existing.id, new Date(), new Set(existingBlogRows.map((r) => r.slug)))

    const patientCount = (
      await db.select({ id: schema.patient.id }).from(schema.patient).where(eq(schema.patient.organizationId, existing.id))
    ).length
    const appointmentCount = (
      await db
        .select({ id: schema.appointment.id })
        .from(schema.appointment)
        .where(eq(schema.appointment.organizationId, existing.id))
    ).length

    // Careers self-heal: seed once if the legacy demo has no job postings.
    // Placed after the count selects so it doesn't shift the seeder test's
    // queue positions. locationId=null is fine — the public JobPosting
    // location is derived from the clinic's primary location at render time.
    const [existingJob] = await db
      .select({ id: schema.jobPosting.id })
      .from(schema.jobPosting)
      .where(eq(schema.jobPosting.organizationId, existing.id))
      .limit(1)
    if (!existingJob) await seedDemoCareers(existing.id, null, new Date())

    // Shop self-heal: seed the catalog once if the legacy demo has none.
    const [existingProduct] = await db
      .select({ id: schema.shopProduct.id })
      .from(schema.shopProduct)
      .where(eq(schema.shopProduct.organizationId, existing.id))
      .limit(1)
    if (!existingProduct) await seedDemoShop(existing.id, new Date())

    // Membership self-heal: seed plans (+ members for existing patients) once.
    const [existingPlan] = await db
      .select({ id: schema.membershipPlan.id })
      .from(schema.membershipPlan)
      .where(eq(schema.membershipPlan.organizationId, existing.id))
      .limit(1)
    if (!existingPlan) {
      const memberPatients = await db
        .select({ id: schema.patient.id })
        .from(schema.patient)
        .where(eq(schema.patient.organizationId, existing.id))
        .limit(3)
      await seedDemoMemberships(existing.id, new Date(), memberPatients.map((p) => p.id))
    }

    // PMS Integrations self-heal: seed the sandbox connection + entity maps +
    // sync/write-back history once (idempotent — no-op if already connected).
    await seedDemoPms(existing.id)

    return {
      organizationId: existing.id,
      organizationSlug: existing.slug,
      organizationName: existing.name,
      created: false,
      patientCount,
      appointmentCount,
    }
  }

  const orgId = newId('org')
  const now = new Date()

  await db.insert(schema.organization).values({
    id: orgId,
    name,
    slug,
    type: 'clinic',
    isDemo: true,
    createdAt: now,
  })

  await db.insert(schema.clinicProfile).values({
    organizationId: orgId,
    legalName: 'Acme Dental, PLLC',
    displayName: 'Acme Dental',
    // Tagline is now the hero H1, so it carries the real value-prop weight.
    tagline: 'Dental care that finally feels human.',
    about:
      'We started Acme to make going to the dentist feel like going to any other thoughtful, modern place. Calm rooms, plain-English explanations, no judgment about how long it\'s been. Whether it\'s your first cleaning in years or a routine check-up, you\'ll be in good hands — and out the door knowing exactly what happened and why.',
    brandColor: '#9CAF9F',
    template: 'modern',
    phone: '(512) 555-0100',
    email: 'hello@acme-dental.example',
    logoUrl: DEMO_LOGO_URL,
    heroImageUrl: DEMO_HERO_IMAGE_URL,
    differenceVideoUrl: DEMO_DIFFERENCE_VIDEO_URL,
    addressLine1: '500 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
    hours: {
      mon: { open: '08:00', close: '17:00' },
      tue: { open: '08:00', close: '17:00' },
      wed: { open: '08:00', close: '17:00' },
      thu: { open: '08:00', close: '17:00' },
      fri: { open: '08:00', close: '15:00' },
      sat: { open: null, close: null },
      sun: { open: null, close: null },
    },
    services: DEMO_SERVICES,
    staff: [
      { id: 'p1', name: 'Dr. Jordan Reyes', title: 'Lead Dentist', bio: '15 years of general dentistry' },
      { id: 'p2', name: 'Dr. Sam Patel', title: 'Cosmetic Specialist' },
      { id: 'p3', name: 'Maria Vega, RDH', title: 'Lead Hygienist' },
    ],
    stats: DEMO_STATS,
    // testimonials are patched in below, after patient IDs are known, so
    // the seeded testimonials can reference real patient records.
    testimonials: [],
    officePhotos: DEMO_OFFICE_PHOTOS,
    faq: DEFAULT_FAQ_ITEMS,
    acceptedInsuranceCarriers: DEMO_INSURANCE_CARRIERS,
    paymentMethods: DEMO_PAYMENT_METHODS,
    financingPartners: DEMO_FINANCING_PARTNERS,
    cancellationPolicy: DEMO_CANCELLATION_POLICY,
    planTier: 'premium',
    subscriptionStatus: 'active',
  })

  // Primary location
  const locationId = newId('loc')
  await db.insert(schema.clinicLocation).values({
    id: locationId,
    organizationId: orgId,
    name: 'Acme Dental — Downtown',
    addressLine1: '500 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    phone: '(512) 555-0100',
    isPrimary: 1,
  })

  // Seed 15 patients with curated personas so every Patients-module
  // glyph + lifecycle stage shows up somewhere in the demo. Each persona
  // index below is referenced later for invoices, form submissions, notes.
  //
  // - [0] Mia Hayes — happy-path active patient with intake on file
  // - [1] Liam Brooks — new (★), booking source, future visit + no intake (📝!)
  // - [2] Charlotte Diaz — birthday this week (🎂)
  // - [3] Marcus Johnson — outstanding overdue invoice ($)
  // - [4] Sophia Iverson — confirmed appt in next 24h (warms the chair view)
  // - [5] Aiden Kim — lapsed, 11 months since last visit (💤 + lifecycle=lapsed)
  // - [6] Emma Lopez — at_risk, 7 months since last visit
  // - [7] Noah Mitchell — relationship notes + intake on file
  // - [8..13] Filler active patients (randomized within persona shape)
  // - [14] Olivia Nguyen — archived (isActive=0)
  const personas = buildPatientPersonas(now)
  const patientIds: string[] = []
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i]
    const pid = newId('pat')
    patientIds.push(pid)
    // Marketing opt-in distribution: most personas are opted-in (the
    // realistic case — patients gave us their email knowing we're a clinic
    // and the unsub link sits in every footer). Persona 9 (one filler)
    // demos the explicitly-opted-out state for the 🔕 glyph; persona 14
    // (archived Olivia) is also opted-out as a natural side-effect.
    const marketingEmailOptIn = i === 9 || i === 14 ? 0 : 1
    const marketingEmailOptInAt = marketingEmailOptIn === 1 ? p.firstSeenAt : null
    const marketingEmailOptOutAt = marketingEmailOptIn === 0 ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) : null
    // SMS opt-in is rarer (TCPA requires explicit opt-in). Two personas
    // opted in via the intake form so the Phase B SMS audience has rows.
    const marketingSmsOptIn = i === 0 || i === 4 ? 1 : 0
    const marketingSmsOptInAt = marketingSmsOptIn === 1 ? p.firstSeenAt : null
    await db.insert(schema.patient).values({
      id: pid,
      organizationId: orgId,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      email: p.email,
      phone: p.phone,
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
      postalCode: p.postalCode,
      insuranceProvider: p.insuranceProvider,
      insurancePolicyNumber: p.insurancePolicyNumber,
      notes: p.notes,
      isActive: p.isActive,
      source: p.source,
      lifecycle: p.lifecycle,
      firstSeenAt: p.firstSeenAt,
      lastActivityAt: p.lastActivityAt,
      marketingEmailOptIn,
      marketingEmailOptInAt,
      marketingEmailOptOutAt,
      marketingSmsOptIn,
      marketingSmsOptInAt,
      marketingOptInSource: marketingEmailOptIn === 1 ? 'backfill' : 'manual',
    })
  }

  // Now that patient IDs exist, build the testimonials so each one references
  // a real CRM patient (Mia Hayes / Noah Mitchell — the same patients whose
  // review_request rows get seeded as `status='completed'` further down). The
  // free-text testimonial stays unlinked so the demo also covers the legacy
  // path. Production uses featureReviewAsTestimonial() for the same shape.
  await db
    .update(schema.clinicProfile)
    .set({
      testimonials: buildDemoTestimonials(
        patientIds,
        personas.map((p) => ({ firstName: p.firstName, lastName: p.lastName, city: p.city, state: p.state })),
      ),
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, orgId))

  // Staff members for the Appointments module — CRM-side display labels.
  // NOT clinical providers (per DESIGN.md out-of-scope). Each appointment
  // below attaches to one so the "with [Staff]" line and provider filter
  // chip have something to filter against.
  const providerDentistId = newId('prov')
  const providerHygienistId = newId('prov')
  await db.insert(schema.clinicProvider).values([
    {
      id: providerDentistId,
      organizationId: orgId,
      displayName: 'Dr. Jordan Reyes',
      role: 'dentist',
      email: 'jordan@acme-dental.example',
    },
    {
      id: providerHygienistId,
      organizationId: orgId,
      displayName: 'Maria Vega, RDH',
      role: 'hygienist',
      email: 'maria@acme-dental.example',
    },
  ])

  // Curated appointments so personas trigger the right glyphs.
  // Past: most personas (except [1] new + [5] lapsed) have completed visits.
  // Future: persona [1] has a new-patient cleaning in 5 days (no intake →
  // 📝!), persona [4] has a confirmed appt in 22h, persona [3] has an
  // unconfirmed appt in 30h (⚠️ + $ overlap), persona [0] [2] [7] all
  // have scheduled future visits, persona [5] (lapsed Aiden) just rebooked
  // → triggers 💤 lapsed-returning glyph, persona [6] (Emma) has an
  // appointment created 20 minutes ago → triggers 🆕 booked-just-now,
  // persona [0] (Mia) has a rescheduled appointment → triggers 📅.
  let apptCount = 0
  const dayMs = 24 * 60 * 60 * 1000
  const hourMs = 60 * 60 * 1000

  // Phantom cancelled "from" row for Mia's reschedule — establishes the
  // audit trail (rescheduledFromAppointmentId points back at this id).
  const miaOriginalId = newId('appt')

  const apptsToSeed: Array<{
    id: string
    patientIdx: number
    startOffsetMs: number
    type: typeof APPT_TYPES[number]
    status: 'scheduled' | 'confirmed' | 'completed' | 'no_show' | 'cancelled'
    notes: string | null
    providerId: string
    source: 'booking_widget' | 'manual' | 'recall_campaign' | 'phone' | 'invite'
    confirmedAt?: Date
    confirmedVia?: 'sms' | 'email' | 'manual' | 'auto_sms_keyword'
    rescheduledFromAppointmentId?: string
    cancelledAt?: Date
    createdAtOverride?: Date
  }> = [
    // ── Past visits ──
    { id: newId('appt'), patientIdx: 0, startOffsetMs: -60 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 0, startOffsetMs: -240 * dayMs, type: 'checkup', status: 'completed', notes: null, providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 2, startOffsetMs: -90 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 3, startOffsetMs: -45 * dayMs, type: 'filling', status: 'completed', notes: 'MOD on #14, 2 carpules lido', providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 5, startOffsetMs: -330 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 6, startOffsetMs: -210 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 7, startOffsetMs: -150 * dayMs, type: 'consultation', status: 'completed', notes: null, providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 8, startOffsetMs: -30 * dayMs, type: 'cleaning', status: 'no_show', notes: null, providerId: providerHygienistId, source: 'manual' },
    // Phantom cancelled "from" row — original time Mia was booked before reschedule.
    { id: miaOriginalId, patientIdx: 0, startOffsetMs: 7 * dayMs + 10 * hourMs, type: 'cleaning', status: 'cancelled', notes: 'Originally booked here — patient asked to move.', providerId: providerHygienistId, source: 'booking_widget', cancelledAt: new Date(now.getTime() - 2 * dayMs) },
    // ── Future visits ──
    { id: newId('appt'), patientIdx: 1, startOffsetMs: 5 * dayMs + 9 * hourMs, type: 'cleaning', status: 'confirmed', notes: 'New patient cleaning', providerId: providerHygienistId, source: 'booking_widget', confirmedAt: new Date(now.getTime() - 1 * dayMs), confirmedVia: 'email' },
    { id: newId('appt'), patientIdx: 0, startOffsetMs: 14 * dayMs + 10 * hourMs, type: 'cleaning', status: 'scheduled', notes: 'Rescheduled from earlier slot', providerId: providerHygienistId, source: 'manual', rescheduledFromAppointmentId: miaOriginalId },
    { id: newId('appt'), patientIdx: 2, startOffsetMs: 21 * dayMs + 11 * hourMs, type: 'checkup', status: 'scheduled', notes: null, providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 4, startOffsetMs: 22 * hourMs, type: 'cleaning', status: 'confirmed', notes: null, providerId: providerHygienistId, source: 'booking_widget', confirmedAt: new Date(now.getTime() - 4 * hourMs), confirmedVia: 'sms' },
    { id: newId('appt'), patientIdx: 3, startOffsetMs: 30 * hourMs, type: 'filling', status: 'scheduled', notes: 'Patient called to ask about pre-auth status', providerId: providerDentistId, source: 'phone' },
    { id: newId('appt'), patientIdx: 7, startOffsetMs: 9 * dayMs + 14 * hourMs, type: 'cleaning', status: 'confirmed', notes: null, providerId: providerHygienistId, source: 'manual', confirmedAt: new Date(now.getTime() - 12 * hourMs), confirmedVia: 'manual' },
    // 💤 lapsed-returning — Aiden (persona 5) just rebooked after 11 months
    { id: newId('appt'), patientIdx: 5, startOffsetMs: 3 * dayMs + 13 * hourMs, type: 'cleaning', status: 'scheduled', notes: 'Welcome back! First visit in almost a year.', providerId: providerHygienistId, source: 'recall_campaign' },
    // 🆕 booked-just-now — Emma (persona 6) booked 20 min ago
    { id: newId('appt'), patientIdx: 6, startOffsetMs: 11 * dayMs + 15 * hourMs, type: 'consultation', status: 'scheduled', notes: null, providerId: providerDentistId, source: 'booking_widget', createdAtOverride: new Date(now.getTime() - 20 * 60 * 1000) },
  ]
  for (const a of apptsToSeed) {
    // Snap seeded start time to the nearest 30-min boundary so demo
    // appointments read like a real clinic schedule (9:00, 9:30, 10:00…)
    // rather than inheriting whatever minute/second `now` happens to be
    // when the seeder runs (which leaves every demo appointment ending in
    // `:20` or `:43`).
    const start = snapToHalfHour(new Date(now.getTime() + a.startOffsetMs))
    const end = new Date(start.getTime() + 45 * 60 * 1000)
    await db.insert(schema.appointment).values({
      id: a.id,
      organizationId: orgId,
      patientId: patientIds[a.patientIdx],
      locationId,
      providerId: a.providerId,
      title: `${a.type.replace('_', ' ')} — ${personas[a.patientIdx].firstName} ${personas[a.patientIdx].lastName}`,
      startTime: start,
      endTime: end,
      type: a.type,
      status: a.status,
      notes: a.notes,
      source: a.source,
      confirmedAt: a.confirmedAt ?? null,
      confirmedVia: a.confirmedVia ?? null,
      cancelledAt: a.cancelledAt ?? null,
      rescheduledFromAppointmentId: a.rescheduledFromAppointmentId ?? null,
      ...(a.createdAtOverride ? { createdAt: a.createdAtOverride } : {}),
    })
    apptCount++
  }

  // Reminder log — gives the drawer's "Reminder activity" stripe real
  // rows + triggers the ⏱ "reminder sent recently" glyph on a couple of
  // futures. Patterns:
  //  - Sophia [4] (confirmed in 22h): email sent 6h ago, patient replied
  //  - Mia [0]   (scheduled 14d out): email sent 5 days ago (no ⏱)
  //  - Liam [1]  (confirmed 5d out): email sent 6h ago (⏱), no reply yet
  //  - Marcus [3] (scheduled 30h out): email sent 90 min ago (⏱), no reply
  const apptByIdx = (idx: number, when: 'future' | 'past' = 'future') => {
    const matches = apptsToSeed.filter((a) => a.patientIdx === idx && (when === 'future' ? a.startOffsetMs > 0 : a.startOffsetMs <= 0))
    return matches[0]?.id
  }
  const reminderSeeds: Array<{
    apptId: string | undefined
    minutesAgo: number
    channel: 'sms' | 'email'
    repliedMinutesAgo?: number
    replyBody?: string
  }> = [
    { apptId: apptByIdx(4), minutesAgo: 6 * 60, channel: 'email', repliedMinutesAgo: 5 * 60 + 50, replyBody: 'Confirmed, see you then.' },
    { apptId: apptByIdx(0), minutesAgo: 5 * 24 * 60, channel: 'email' },
    { apptId: apptByIdx(1), minutesAgo: 6 * 60, channel: 'email' },
    { apptId: apptByIdx(3), minutesAgo: 90, channel: 'email' },
  ]
  for (const r of reminderSeeds) {
    if (!r.apptId) continue
    await db.insert(schema.appointmentReminderLog).values({
      id: newId('rem'),
      organizationId: orgId,
      appointmentId: r.apptId,
      channel: r.channel,
      template: 'default_reminder',
      sentAt: new Date(now.getTime() - r.minutesAgo * 60 * 1000),
      repliedAt: r.repliedMinutesAgo ? new Date(now.getTime() - r.repliedMinutesAgo * 60 * 1000) : null,
      replyBody: r.replyBody ?? null,
    })
  }

  // A couple of tasks to populate the Tasks board
  await db.insert(schema.tasks).values([
    {
      organizationId: orgId,
      title: 'Order Invisalign supplies',
      description: 'Box of aligner trays running low',
      status: 'todo',
      priority: 'medium',
      position: 0,
    },
    {
      organizationId: orgId,
      title: 'Call insurance re: claim #4421',
      description: 'Patient escalation, pending 14 days',
      status: 'in_progress',
      priority: 'high',
      position: 0,
    },
    {
      organizationId: orgId,
      title: 'Quarterly equipment maintenance',
      status: 'todo',
      priority: 'low',
      position: 1,
    },
  ])

  // Customer rows — half derived from patients (so invoices link via
  // customers.patientId and surface on patient timelines), half generic
  // "leads" (so the platform-side /ecommerce/customers + marketing
  // pipeline modules also have something to show).
  //
  // Personas with a customers row: [0] Mia (LTV history), [3] Marcus
  // (overdue $), [4] Sophia (paid history), [7] Noah (paid history).
  const patientLinkedCustomers = [0, 3, 4, 7].map((idx) => ({
    organizationId: orgId,
    patientId: patientIds[idx],
    name: `${personas[idx].firstName} ${personas[idx].lastName}`,
    email: personas[idx].email!,
    phone: personas[idx].phone,
    location: `${personas[idx].city}, ${personas[idx].state}`,
    pipelineStage: 'won',
    lifecycleStage: 'customer',
    lastActivityAt: new Date(now.getTime() - dayMs),
  }))
  const STAGES = ['new', 'contacted', 'qualified', 'opportunity', 'won']
  const leadCustomers = Array.from({ length: 6 }, (_, i) => {
    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)
    const loc = pick(CITIES)
    return {
      organizationId: orgId,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      phone: phoneNumber(),
      location: `${loc.city}, ${loc.state}`,
      pipelineStage: STAGES[i % STAGES.length],
      lifecycleStage: i < 3 ? 'lead' : 'customer',
      lastActivityAt: new Date(now.getTime() - i * dayMs),
    }
  })
  const insertedCustomers = await db
    .insert(schema.customers)
    .values([...patientLinkedCustomers, ...leadCustomers])
    .returning({ id: schema.customers.id })

  // Sample products (treatments offered as "products" in the catalog).
  const productRows = [
    { name: 'Routine Cleaning', priceCents: 15000, stock: 999 },
    { name: 'Comprehensive Exam', priceCents: 9500, stock: 999 },
    { name: 'Composite Filling', priceCents: 22500, stock: 999 },
    { name: 'Teeth Whitening', priceCents: 45000, stock: 50 },
  ].map((p) => ({
    organizationId: orgId,
    name: p.name,
    slug: slugify(p.name) + '-' + newId().slice(0, 4),
    priceCents: p.priceCents,
    currency: 'USD',
    stock: p.stock,
    active: true,
  }))
  await db.insert(schema.products).values(productRows)

  // A handful of product orders + invoices, evenly distributed across statuses.
  const orderStatuses = ['pending', 'processing', 'delivered', 'delivered', 'shipped'] as const
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.orders).values({
      organizationId: orgId,
      orderNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: insertedCustomers[i % insertedCustomers.length]?.id ?? null,
      status: orderStatuses[i % orderStatuses.length],
      totalCents: 9500 + i * 5000,
      currency: 'USD',
      items: [
        { name: 'Treatment plan phase ' + (i + 1), quantity: 1, priceCents: 9500 + i * 5000 },
      ],
    })
  }

  // Invoices — curated so each patient-linked customer has a realistic
  // history. Patient-linked customer IDs are the first N of insertedCustomers
  // (in the same order as patientLinkedCustomers above).
  // [0] Mia: 2 paid invoices (LTV history)
  // [1] Marcus: 1 paid + 1 overdue (drives the $ glyph + balance pill)
  // [2] Sophia: 1 paid
  // [3] Noah: 1 paid
  const invoiceSeeds: Array<{
    customerIdx: number
    status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled'
    totalCents: number
    daysAgo: number
  }> = [
    { customerIdx: 0, status: 'paid', totalCents: 22500, daysAgo: 90 },
    { customerIdx: 0, status: 'paid', totalCents: 18000, daysAgo: 30 },
    { customerIdx: 1, status: 'paid', totalCents: 15000, daysAgo: 120 },
    { customerIdx: 1, status: 'overdue', totalCents: 45000, daysAgo: 21 },
    { customerIdx: 2, status: 'paid', totalCents: 9500, daysAgo: 60 },
    { customerIdx: 3, status: 'paid', totalCents: 30000, daysAgo: 150 },
  ]
  for (const inv of invoiceSeeds) {
    const created = new Date(now.getTime() - inv.daysAgo * dayMs)
    await db.insert(schema.invoices).values({
      organizationId: orgId,
      invoiceNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: insertedCustomers[inv.customerIdx]?.id ?? null,
      status: inv.status,
      totalCents: inv.totalCents,
      currency: 'USD',
      createdAt: created,
      paidAt: inv.status === 'paid' ? new Date(created.getTime() + 2 * dayMs) : null,
    })
  }

  // Default intake form template — the standard dental new-patient form.
  await seedDefaultIntakeForm(orgId)

  // Form submissions — one per persona that already filled out the intake.
  // Persona [1] (new patient, future visit) is intentionally *missing* a
  // submission so the 📝! "missing intake before next visit" glyph triggers.
  const [defaultForm] = await db
    .select({ id: schema.formTemplate.id })
    .from(schema.formTemplate)
    .where(eq(schema.formTemplate.organizationId, orgId))
    .limit(1)
  if (defaultForm) {
    const submissionSeeds: Array<{ patientIdx: number; daysAgo: number }> = [
      { patientIdx: 0, daysAgo: 240 },
      { patientIdx: 2, daysAgo: 95 },
      { patientIdx: 3, daysAgo: 50 },
      { patientIdx: 6, daysAgo: 220 },
      { patientIdx: 7, daysAgo: 160 },
    ]
    for (const s of submissionSeeds) {
      const p = personas[s.patientIdx]
      await db.insert(schema.formSubmission).values({
        id: newId('sub'),
        organizationId: orgId,
        formTemplateId: defaultForm.id,
        patientId: patientIds[s.patientIdx],
        appointmentId: null,
        data: {
          first_name: p.firstName,
          last_name: p.lastName,
          email: p.email,
          phone: p.phone,
          dob: p.dateOfBirth,
          insurance: p.insuranceProvider ?? 'None',
          anxious: s.patientIdx === 7 ? 'Yes — I prefer nitrous oxide' : 'A little — please go slow',
        },
        submitterName: `${p.firstName} ${p.lastName}`,
        submitterEmail: p.email,
        submitterPhone: p.phone,
        submittedAt: new Date(now.getTime() - s.daysAgo * dayMs),
      })
    }
  }

  // Patient notes — relationship notes (NOT clinical) on a few personas
  // so the Notes panel on the detail page renders real content.
  const noteSeeds: Array<{ patientIdx: number; body: string; daysAgo: number }> = [
    { patientIdx: 0, body: 'Prefers Dr. Patel for cleanings. Loves the warm towels.', daysAgo: 90 },
    { patientIdx: 5, body: 'Tried to reach 2024-09 — left voicemail, no callback. Try again next quarter.', daysAgo: 240 },
    { patientIdx: 5, body: 'Confirmed wants to come back, life got busy. Sending recall email week of demo.', daysAgo: 12 },
    { patientIdx: 7, body: 'Highly anxious. Always pre-medicate with halcion + use nitrous. Spouse usually drives.', daysAgo: 150 },
    { patientIdx: 3, body: 'Balance dispute: insurance kicked back the May filling — call to walk through EOB.', daysAgo: 18 },
  ]
  for (const n of noteSeeds) {
    await db.insert(schema.patientNote).values({
      id: newId('pnote'),
      organizationId: orgId,
      patientId: patientIds[n.patientIdx],
      authorId: null, // demo notes have no author — UI shows "Staff"
      body: n.body,
      createdAt: new Date(now.getTime() - n.daysAgo * dayMs),
    })
  }

  // ── Website leads — public contact-form submissions ─────────────────
  // Lookup Emma Lopez's patient id so the converted-lead seed can point
  // back at the persona. Falls back to `null` if she's not in patientIds
  // (shouldn't happen — Emma is persona 6 — but defensive).
  const emmaPatientId = patientIds[6] ?? null
  await seedLeadsForOrg(orgId, now, emmaPatientId, new Set())

  // SEO: realistic traffic-source mix on the public-booking appointments.
  await backfillDemoBookingAttribution(orgId)

  // Careers: open roles + applicants across the pipeline (pure inserts).
  await seedDemoCareers(orgId, locationId, now)

  // Shop: catalog of dental products + sample orders (pure inserts).
  await seedDemoShop(orgId, now, patientIds)

  // Membership plans + members.
  await seedDemoMemberships(orgId, now, patientIds)

  // ── Recall & Outreach — audiences + campaigns + events ──────────────
  // Seeded after patients/appointments so the audience filters resolve to
  // realistic counts AND so the "Sent" campaign can attribute Aiden's
  // recall_campaign booking back to itself via a 'booked' event.
  await seedRecallOutreachForOrg(orgId, now, patientIds, new Map(), new Map())

  // ── Patient Communications — threads + messages ─────────────────────
  // Seeded after patients so threads can be tied to the right persona.
  // Mix of in-app + email messages, mix of inbound/outbound, one snoozed
  // thread, one with high unread count for the red-rot border state.
  await seedPatientMessagesForOrg(orgId, now, patientIds, new Set())

  // ── Reviews & Reputation — config + review requests ─────────────────
  // Seeded after patients + appointments so requests can be tied to
  // real completed visits. Mix of funnel states so the dashboard shows
  // every status pill + the per-platform breakdown.
  await seedReviewsForOrg(orgId, now, patientIds, false, new Set())

  // ── Blog — curated posts covering every state ───────────────────────
  // 2 published (bylined to demo staff), 1 plain draft, 1 AI draft pending
  // review — so /blog + the public blog index both show real content.
  await seedBlogPostsForOrg(orgId, now, new Set())

  // ── PMS Integrations — sandbox Open Dental connection ───────────────
  // Seeded last so every provider/patient/appointment exists to map. Builds
  // the connection + entity maps + sync history + write-back log (every state)
  // so /integrations showcases two-way sync without a live PMS.
  await seedDemoPms(orgId)

  return {
    organizationId: orgId,
    organizationSlug: slug,
    organizationName: name,
    created: true,
    patientCount: patientIds.length,
    appointmentCount: apptCount,
  }
}

// ── Shared lead seeds (used by both new-clinic-seed + self-heal) ─────
// Single source of truth so both code paths produce the same 6 curated
// leads covering every lifecycle state. Updates here flow to both
// freshly-seeded demos AND legacy demos on next self-heal entry.

interface LeadSeed {
  name: string
  phone: string
  email: string | null
  preferredDate: string | null
  message: string | null
  sourcePage: string | null
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  status: 'new' | 'contacted' | 'converted' | 'archived'
  hoursAgo: number
  contactedHoursAgo?: number
  convertedHoursAgo?: number
  /** true → link to Emma Lopez patient when present in the org. */
  linkToEmmaPatient?: boolean
  archivedHoursAgo?: number
  archivedReason?: string
}

const DEMO_LEAD_SEEDS: LeadSeed[] = [
  // Fresh new lead — under an hour, triggers "call within the hour" CTA
  { name: 'Olivia Chen', phone: '(415) 555-0188', email: 'olivia.c@example.com', preferredDate: null,
    message: "Looking for a family dentist for me and my two kids (5 + 8). Saw your website — love that you're warm-fuzzies about anxiety.",
    sourcePage: '/', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic', utmCampaign: null,
    status: 'new', hoursAgo: 0.5 },
  // Aging new lead — 18h, amber tint
  { name: 'Daniel Park', phone: '(415) 555-0119', email: null, preferredDate: '2026-06-15',
    message: 'Need a cleaning. Last one was probably 18 months ago. No insurance, what would the cash price be?',
    sourcePage: '/services', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
    status: 'new', hoursAgo: 18 },
  // Stale new lead — 3 days, red border, embarrassing
  { name: 'Rachel Williams', phone: '(415) 555-0123', email: 'rachel.w@example.com', preferredDate: null,
    message: 'Hi! Wisdom tooth pain on the upper right, getting worse. Can I come in this week?',
    sourcePage: '/', referrer: 'https://www.instagram.com/', utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'fall_recall',
    status: 'new', hoursAgo: 72 },
  // Contacted — staff called, waiting for follow-up
  { name: 'Marcus Johnson', phone: '(415) 555-0156', email: 'marcus.j@example.com', preferredDate: '2026-06-22',
    message: 'Need crown work, had a temporary fall out yesterday. Will need a same-week appointment if possible.',
    sourcePage: '/services', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
    status: 'contacted', hoursAgo: 36, contactedHoursAgo: 30 },
  // Converted — became Emma Lopez (persona 6)
  { name: 'Emma Lopez', phone: '(415) 555-0234', email: 'emma.l@example.com', preferredDate: null,
    message: "Hi! New to the area, looking for a regular cleaning. Heard great things from a coworker.",
    sourcePage: '/', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic', utmCampaign: null,
    status: 'converted', hoursAgo: 14 * 24, contactedHoursAgo: 13 * 24, convertedHoursAgo: 12 * 24, linkToEmmaPatient: true },
  // Archived — spam example
  { name: 'aaaaa zzzzzz', phone: '(000) 000-0000', email: 'spam@spam.test', preferredDate: null,
    message: 'BUY MY SEO SERVICES CHEAP!!! Click here for amazing rankings!!! https://spamlink.example/seo',
    sourcePage: '/', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
    status: 'archived', hoursAgo: 96, archivedHoursAgo: 95, archivedReason: 'spam' },
]

/**
 * Seed any lead from DEMO_LEAD_SEEDS that isn't already present (by
 * exact name match). Idempotent — safe to call repeatedly. Used in
 * both the new-clinic-seed path (passes `existingNames = new Set()`)
 * and the self-heal path on legacy demos.
 */
async function seedLeadsForOrg(
  orgId: string,
  now: Date,
  emmaPatientId: string | null,
  existingNames: Set<string>,
): Promise<number> {
  const hourMs = 60 * 60 * 1000
  const missing = DEMO_LEAD_SEEDS.filter((s) => !existingNames.has(s.name))
  if (missing.length === 0) return 0
  for (const l of missing) {
    await db.insert(schema.lead).values({
      id: newId('lead'),
      organizationId: orgId,
      name: l.name,
      phone: l.phone,
      email: l.email,
      preferredDate: l.preferredDate,
      message: l.message,
      sourcePage: l.sourcePage,
      referrer: l.referrer,
      utmSource: l.utmSource,
      utmMedium: l.utmMedium,
      utmCampaign: l.utmCampaign,
      status: l.status,
      convertedToPatientId: l.linkToEmmaPatient ? emmaPatientId : null,
      contactedAt: l.contactedHoursAgo !== undefined ? new Date(now.getTime() - l.contactedHoursAgo * hourMs) : null,
      convertedAt: l.convertedHoursAgo !== undefined ? new Date(now.getTime() - l.convertedHoursAgo * hourMs) : null,
      archivedAt: l.archivedHoursAgo !== undefined ? new Date(now.getTime() - l.archivedHoursAgo * hourMs) : null,
      archivedReason: l.archivedReason ?? null,
      createdAt: new Date(now.getTime() - l.hoursAgo * hourMs),
    })
  }
  return missing.length
}

/**
 * Seed Recall & Outreach (Phase A) demo content. Lays down 4 patient-source
 * audiences + 3 campaigns covering every status state (sent / scheduled /
 * draft) so the /marketing dashboard never looks empty on a fresh demo.
 *
 * Idempotency: checks existing audience + campaign names per org; only
 * inserts those that are missing. Events for the "sent" campaign are only
 * inserted when the campaign itself was newly created — re-running on a
 * topped-up demo doesn't duplicate them.
 *
 * Used by both the new-clinic-seed path AND the self-heal path on legacy
 * demos (existingAudienceNames + existingCampaignNames passed in from the
 * caller's per-org lookup).
 */
async function seedRecallOutreachForOrg(
  orgId: string,
  now: Date,
  patientIds: string[],
  existingAudiencesByName: Map<string, number>,
  existingCampaignsByName: Map<string, number>,
): Promise<{ audiencesAdded: number; campaignsAdded: number; eventsAdded: number }> {
  // Make sure the 3 system templates are in the DB. One select + 0..3
  // inserts; cheap when already-seeded.
  await seedSystemTemplates()

  const dayMs = 24 * 60 * 60 * 1000

  // Look up the system template ids by name so seeded campaigns can attach
  // a templateId for "Created from template X" provenance.
  const tplRows = await db
    .select({ id: schema.campaignTemplates.id, name: schema.campaignTemplates.name })
    .from(schema.campaignTemplates)
    .where(eq(schema.campaignTemplates.kind, 'system'))
  const tplIdByName = new Map(tplRows.map((r) => [r.name, r.id]))

  // ── Audiences ────────────────────────────────────────────────────────
  // 4 dental segments matching the patient-flag glyphs. Each audience
  // stores a `patientFilter` JSON that resolveAudience knows how to
  // materialize. recipientSource='patients' is the discriminator.
  interface AudienceSeed {
    name: string
    description: string
    patientFilter: Record<string, unknown>
  }
  const AUDIENCE_SEEDS: AudienceSeed[] = [
    {
      name: 'Recall due (6+ months)',
      description: 'Patients whose last cleaning was over 6 months ago without a future booking. Drives the Reactivation campaign.',
      patientFilter: {
        recallStatuses: ['due', 'overdue'],
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
    {
      name: 'Lapsed (lifecycle = lapsed)',
      description: 'Lifecycle stage flipped to lapsed — last visit >9 months ago. Tighter than "Recall due" — these are the cold ones.',
      patientFilter: {
        lifecycles: ['lapsed', 'at_risk'],
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
    {
      name: 'New patients (past 60 days)',
      description: 'Recently joined — for new-patient welcome sequences and check-in surveys.',
      patientFilter: {
        lifecycles: ['new'],
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
    {
      name: 'Birthday this month',
      description: 'Patients celebrating a birthday this calendar month — for the warm-monthly outreach.',
      patientFilter: {
        birthdayThisMonth: true,
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
  ]

  const audienceIdByName = new Map(existingAudiencesByName)
  let audiencesAdded = 0
  for (const seed of AUDIENCE_SEEDS) {
    if (audienceIdByName.has(seed.name)) continue
    const [row] = await db
      .insert(schema.audiences)
      .values({
        organizationId: orgId,
        name: seed.name,
        description: seed.description,
        recipientSource: 'patients',
        filter: {},
        patientFilter: seed.patientFilter,
      })
      .returning({ id: schema.audiences.id })
    audienceIdByName.set(seed.name, row.id)
    audiencesAdded++
  }

  // ── Campaigns ────────────────────────────────────────────────────────
  // 3 campaigns showcasing every lifecycle state. The sent campaign also
  // gets seeded events so the analytics panel shows real numbers.
  interface CampaignSeed {
    name: string
    templateName: string
    audienceName: string
    status: 'draft' | 'scheduled' | 'completed'
    sentDaysAgo?: number
    scheduledDaysAhead?: number
    seedEvents?: boolean
  }
  const CAMPAIGN_SEEDS: CampaignSeed[] = [
    {
      name: 'March Reactivation — come back for a cleaning',
      templateName: SYSTEM_TEMPLATES[0].name, // Reactivation
      audienceName: 'Lapsed (lifecycle = lapsed)',
      status: 'completed',
      sentDaysAgo: 5,
      seedEvents: true,
    },
    {
      name: 'May Birthday wishes',
      templateName: SYSTEM_TEMPLATES[1].name, // Birthday
      audienceName: 'Birthday this month',
      status: 'scheduled',
      scheduledDaysAhead: 2,
    },
    {
      name: 'New patient welcome — week 1 follow-up',
      templateName: SYSTEM_TEMPLATES[2].name, // Welcome
      audienceName: 'New patients (past 60 days)',
      status: 'draft',
    },
  ]

  let campaignsAdded = 0
  let eventsAdded = 0
  for (const seed of CAMPAIGN_SEEDS) {
    if (existingCampaignsByName.has(seed.name)) continue
    const tpl = tplIdByName.get(seed.templateName)
    const tplRow = SYSTEM_TEMPLATES.find((t) => t.name === seed.templateName)
    if (!tpl || !tplRow) continue
    const audienceId = audienceIdByName.get(seed.audienceName) ?? null
    const sentAt = seed.status === 'completed' && seed.sentDaysAgo
      ? new Date(now.getTime() - seed.sentDaysAgo * dayMs)
      : null
    const scheduledAt = seed.status === 'scheduled' && seed.scheduledDaysAhead
      ? new Date(now.getTime() + seed.scheduledDaysAhead * dayMs)
      : null

    const [campaign] = await db
      .insert(schema.campaigns)
      .values({
        organizationId: orgId,
        name: seed.name,
        description: tplRow.description,
        status: seed.status,
        subject: tplRow.subject,
        previewText: tplRow.previewText,
        bodyHtml: tplRow.bodyHtml,
        audienceId,
        sendChannel: 'resend',
        recipientSource: 'patients',
        templateId: tpl,
        scheduledAt,
        sentAt,
        sendStats: seed.seedEvents ? { attempted: 2, sent: 2, failed: 0 } : {},
      })
      .returning({ id: schema.campaigns.id })
    campaignsAdded++

    // Seed realistic events for the "Sent" campaign so the analytics
    // panel shows numbers. We pick Aiden (persona 5 — lapsed-returning,
    // his recall_campaign appointment becomes the 'booked' outcome) and
    // Emma (persona 6 — at_risk → opened but didn't click). The Sent
    // event predates the Open event by a few minutes; Click predates
    // Booked by an hour or so to read as a real conversion funnel.
    if (seed.seedEvents && patientIds.length > 5 && sentAt) {
      const aidenId = patientIds[5] ?? null
      const emmaId = patientIds[6] ?? null
      const aidenEmail = 'aiden.k@example.com'
      const emmaEmail = 'emma.l@example.com'
      // Sent events (one per recipient).
      if (aidenId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: aidenEmail,
          patientId: aidenId,
          type: 'sent',
          occurredAt: sentAt,
          meta: { channel: 'resend' },
        })
        eventsAdded++
      }
      if (emmaId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: emmaEmail,
          patientId: emmaId,
          type: 'sent',
          occurredAt: sentAt,
          meta: { channel: 'resend' },
        })
        eventsAdded++
      }
      // Both open (Aiden + Emma)
      const openAt = new Date(sentAt.getTime() + 2 * 60 * 60 * 1000)
      if (aidenId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: aidenEmail,
          patientId: aidenId,
          type: 'open',
          occurredAt: openAt,
          meta: {},
        })
        eventsAdded++
      }
      if (emmaId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: emmaEmail,
          patientId: emmaId,
          type: 'open',
          occurredAt: openAt,
          meta: {},
        })
        eventsAdded++
      }
      // Aiden clicks (Emma didn't).
      const clickAt = new Date(sentAt.getTime() + 3 * 60 * 60 * 1000)
      if (aidenId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: aidenEmail,
          patientId: aidenId,
          type: 'click',
          occurredAt: clickAt,
          meta: { url: 'https://acme-dental.dreamcreatestudio.com/book' },
        })
        eventsAdded++
        // Aiden booked the recall_campaign appointment that's seeded earlier.
        // Look it up + record a 'booked' event tying back to the campaign.
        const [aidenRecallAppt] = await db
          .select({ id: schema.appointment.id })
          .from(schema.appointment)
          .where(
            and(
              eq(schema.appointment.organizationId, orgId),
              eq(schema.appointment.patientId, aidenId),
              eq(schema.appointment.source, 'recall_campaign'),
            ),
          )
          .limit(1)
        if (aidenRecallAppt) {
          const bookedAt = new Date(sentAt.getTime() + 4 * 60 * 60 * 1000)
          await db.insert(schema.campaignEvents).values({
            campaignId: campaign.id,
            recipientEmail: aidenEmail,
            patientId: aidenId,
            bookedAppointmentId: aidenRecallAppt.id,
            bookedAt,
            type: 'booked',
            occurredAt: bookedAt,
            meta: {},
          })
          eventsAdded++
        }
      }
    }
  }

  return { audiencesAdded, campaignsAdded, eventsAdded }
}

/**
 * Seed Patient Communications (Phase A) demo content. Lays down 5 patient
 * threads with mixed in-app + email channel messages covering every
 * thread-state combination: open with unread (red rot), open without
 * unread, snoozed, archived, and one with no unread (the happy path).
 *
 * Idempotency: checks existing thread patient ids per org; only inserts
 * threads for patients that don't already have one. Each newly-seeded
 * thread gets a curated message sequence. Re-running on a topped-up demo
 * doesn't duplicate.
 *
 * Used by both the new-clinic-seed path AND the self-heal path on legacy
 * demos.
 */
async function seedPatientMessagesForOrg(
  orgId: string,
  now: Date,
  patientIds: string[],
  existingThreadPatientIds: Set<string>,
): Promise<{ threadsAdded: number; messagesAdded: number }> {
  const hourMs = 60 * 60 * 1000

  // Reference personas (index-aligned to demo-clinic.ts buildPatientPersonas):
  //   [0] Mia Hayes      — happy-path, closed-loop appointment scheduling
  //   [3] Marcus Johnson — outstanding balance, unconfirmed appt (red rot)
  //   [4] Sophia Iverson — confirmed appt in 22h, closed exchange
  //   [5] Aiden Kim      — lapsed-returning, snoozed thread
  //   [6] Emma Lopez     — fresh-booked, single inbound email (open)
  interface SeedThread {
    patientIdx: number
    status: 'open' | 'snoozed' | 'archived'
    snoozedInHours?: number
    messages: Array<{
      direction: 'inbound' | 'outbound'
      channel: 'in_app' | 'email'
      body: string
      hoursAgo: number
    }>
  }
  const THREAD_SEEDS: SeedThread[] = [
    // Mia — happy path, recently confirmed, closed
    {
      patientIdx: 0,
      status: 'open',
      messages: [
        { direction: 'outbound', channel: 'email', body: 'Hi Mia — just confirming your cleaning has been moved to next week per our chat. New time is on the calendar. Let us know if anything changes. — The team', hoursAgo: 72 },
        { direction: 'inbound', channel: 'email', body: 'Perfect, thank you! That works much better for me. See you then.', hoursAgo: 71 },
        { direction: 'outbound', channel: 'in_app', body: 'Got it. We\'ll send a reminder the day before.', hoursAgo: 70 },
      ],
    },
    // Marcus — RED ROT: inbound 3 days ago, no reply
    {
      patientIdx: 3,
      status: 'open',
      messages: [
        { direction: 'outbound', channel: 'in_app', body: 'Hi Marcus, your filling appointment is coming up. We\'ll see you Tuesday at 10am.', hoursAgo: 96 },
        { direction: 'inbound', channel: 'in_app', body: 'Hey, quick question about insurance pre-auth — did the request go through? My HR rep said she hadn\'t seen anything yet.', hoursAgo: 75 },
        { direction: 'inbound', channel: 'in_app', body: 'Also can I bring my partner along for the consultation? She had some questions about her own treatment.', hoursAgo: 74 },
      ],
    },
    // Sophia — confirmed appointment, recently closed.
    // Three+ historical inbound in-app messages so the composer
    // surfaces a "Sophia prefers in-app" preference label.
    {
      patientIdx: 4,
      status: 'open',
      messages: [
        { direction: 'outbound', channel: 'in_app', body: 'Hi Sophia — friendly reminder your cleaning is Friday at 3pm. Reply YES to confirm.', hoursAgo: 240 },
        { direction: 'inbound', channel: 'in_app', body: 'Yes, got it! See you Friday.', hoursAgo: 238 },
        { direction: 'inbound', channel: 'in_app', body: 'Quick question — should I avoid coffee that morning or just brush after?', hoursAgo: 168 },
        { direction: 'outbound', channel: 'in_app', body: 'Either is fine! Just no coffee in the chair 😄', hoursAgo: 167 },
        { direction: 'outbound', channel: 'in_app', body: 'Hi Sophia — confirming your cleaning tomorrow at 3pm with Maria. Reply YES to confirm or let us know if you need to reschedule.', hoursAgo: 6 },
        { direction: 'inbound', channel: 'in_app', body: 'Yes! See you tomorrow.', hoursAgo: 4 },
      ],
    },
    // Aiden — snoozed (post-rebooking, will resurface tomorrow)
    {
      patientIdx: 5,
      status: 'snoozed',
      snoozedInHours: 24,
      messages: [
        { direction: 'outbound', channel: 'email', body: 'Hi Aiden — so glad you\'re coming back in! Your appointment Wednesday at 1pm is on the books. A few first-visit-back things to know: please arrive 10 minutes early to update your medical history, and we\'ll do a quick exam alongside the cleaning since it\'s been a while.', hoursAgo: 18 },
        { direction: 'inbound', channel: 'email', body: 'Thanks, see you Wednesday!', hoursAgo: 14 },
      ],
    },
    // Emma — AMBER ROT: inbound this morning, no reply yet (high-priority unread)
    {
      patientIdx: 6,
      status: 'open',
      messages: [
        { direction: 'inbound', channel: 'email', body: 'Hi! Quick question — I booked through your website for next week but I forgot to mention I have a temporary crown on a back molar that\'s been bothering me. Could we look at that during the consult, or do I need a separate appointment?', hoursAgo: 16 },
      ],
    },
  ]

  let threadsAdded = 0
  let messagesAdded = 0

  for (const seed of THREAD_SEEDS) {
    if (seed.patientIdx >= patientIds.length) continue
    const patientId = patientIds[seed.patientIdx]
    if (existingThreadPatientIds.has(patientId)) continue

    const threadId = newId('pthread')
    const sortedMessages = [...seed.messages].sort((a, b) => b.hoursAgo - a.hoursAgo)
    const lastMessage = sortedMessages[sortedMessages.length - 1]
    const inboundAfterLastOutbound = (() => {
      // Count inbound messages that came after the last outbound (the unread
      // count). Mirrors the real recordInboundMessage behavior.
      let count = 0
      for (let i = sortedMessages.length - 1; i >= 0; i--) {
        if (sortedMessages[i].direction === 'inbound') count++
        else break
      }
      return count
    })()

    await db.insert(schema.patientThread).values({
      id: threadId,
      organizationId: orgId,
      patientId,
      status: seed.status,
      snoozedUntil: seed.snoozedInHours ? new Date(now.getTime() + seed.snoozedInHours * hourMs) : null,
      lastMessageAt: new Date(now.getTime() - lastMessage.hoursAgo * hourMs),
      lastMessageDirection: lastMessage.direction,
      lastMessageChannel: lastMessage.channel,
      unreadCountForClinic: inboundAfterLastOutbound,
      createdAt: new Date(now.getTime() - sortedMessages[0].hoursAgo * hourMs),
      updatedAt: new Date(now.getTime() - lastMessage.hoursAgo * hourMs),
    })
    threadsAdded++

    for (const m of sortedMessages) {
      await db.insert(schema.patientMessage).values({
        id: newId('pmsg'),
        threadId,
        organizationId: orgId,
        patientId,
        channel: m.channel,
        direction: m.direction,
        body: m.body,
        sentByUserId: null, // demo seeder doesn't tie to a specific staff user
        sentAt: new Date(now.getTime() - m.hoursAgo * hourMs),
      })
      messagesAdded++
    }
  }

  return { threadsAdded, messagesAdded }
}

/**
 * Idempotent top-up: ensures Sophia's thread has at least 3 inbound
 * in-app messages so the composer's "prefers in-app" label demos in
 * legacy demos (the original seed only put 1 inbound on her thread,
 * below the preference threshold). Inserts the missing historicals
 * only — running this twice is a no-op.
 */
async function topUpSophiaPreferenceMessages(
  orgId: string,
  patientIds: string[],
  now: Date,
): Promise<void> {
  const hourMs = 60 * 60 * 1000
  const sophiaId = patientIds[4]
  if (!sophiaId) return

  const [thread] = await db
    .select({ id: schema.patientThread.id })
    .from(schema.patientThread)
    .where(
      and(
        eq(schema.patientThread.organizationId, orgId),
        eq(schema.patientThread.patientId, sophiaId),
      ),
    )
    .limit(1)
  if (!thread) return

  const existingMessages = await db
    .select({ direction: schema.patientMessage.direction, channel: schema.patientMessage.channel })
    .from(schema.patientMessage)
    .where(eq(schema.patientMessage.threadId, thread.id))
  const inboundInApp = existingMessages.filter(
    (m) => m.direction === 'inbound' && m.channel === 'in_app',
  ).length
  if (inboundInApp >= 3) return // already topped up

  const fills = [
    { direction: 'outbound' as const, body: 'Hi Sophia — friendly reminder your cleaning is Friday at 3pm. Reply YES to confirm.', hoursAgo: 240 },
    { direction: 'inbound' as const, body: 'Yes, got it! See you Friday.', hoursAgo: 238 },
    { direction: 'inbound' as const, body: 'Quick question — should I avoid coffee that morning or just brush after?', hoursAgo: 168 },
    { direction: 'outbound' as const, body: 'Either is fine! Just no coffee in the chair 😄', hoursAgo: 167 },
  ]
  for (const f of fills) {
    await db.insert(schema.patientMessage).values({
      id: newId('pmsg'),
      threadId: thread.id,
      organizationId: orgId,
      patientId: sophiaId,
      channel: 'in_app',
      direction: f.direction,
      body: f.body,
      sentByUserId: null,
      sentAt: new Date(now.getTime() - f.hoursAgo * hourMs),
    })
  }
}

/**
 * Idempotent self-heal for legacy demos whose `clinic_profile.testimonials`
 * still hold the original free-text "Sarah K. / Marcus T. / Jen R." shapes
 * (no `patientId` link). Reads the seeded patient personas, rebuilds the
 * testimonial array via `buildDemoTestimonials`, and writes only when no
 * existing testimonial is patient-linked yet. Skips when the clinic has
 * already promoted any review (so a hand-curated set isn't clobbered).
 */
async function topUpLinkedDemoTestimonials(
  orgId: string,
  patientIds: string[],
): Promise<void> {
  if (patientIds.length === 0) return
  const [profile] = await db
    .select({ testimonials: schema.clinicProfile.testimonials })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  if (!profile) return
  const current = (profile.testimonials ?? []) as Array<{ patientId?: string | null }>
  const expectedLinked = DEMO_FEATURED_PATIENT_IDXS.length
  const currentLinked = current.filter((t) => !!t.patientId).length
  // Skip when the demo is already up to date OR when a real clinic has
  // curated more linked testimonials than the seed defines (don't clobber).
  if (currentLinked >= expectedLinked) return

  // Re-fetch the seeded patients by their canonical name so we can build the
  // "First L." + city display labels. We match by (firstName, lastName)
  // rather than insertion order — the personas at indices 0/1/2/3/4/5/6/7
  // are the well-known seeded shapes (Mia Hayes, Liam Brooks, …).
  const rows = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      city: schema.patient.city,
      state: schema.patient.state,
    })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
  // Index-aligned to DEMO_FEATURED_PATIENT_IDXS — keep this in sync
  // when adding new linked seeds. Slots that aren't referenced by any seed
  // can stay null-filled; buildDemoTestimonials guards on a missing match.
  const personaTargets: Array<{ firstName: string; lastName: string } | null> = [
    { firstName: 'Mia', lastName: 'Hayes' },          // [0]
    { firstName: 'Liam', lastName: 'Brooks' },        // [1]
    { firstName: 'Charlotte', lastName: 'Diaz' },     // [2]
    { firstName: 'Marcus', lastName: 'Johnson' },     // [3]
    { firstName: 'Sophia', lastName: 'Iverson' },     // [4]
    { firstName: 'Aiden', lastName: 'Kim' },          // [5]
    { firstName: 'Emma', lastName: 'Lopez' },         // [6]
    { firstName: 'Noah', lastName: 'Mitchell' },      // [7]
    null,                                             // [8]  Olivia Anderson — unused by seeds
    null,                                             // [9]  Ethan Carter   — unused
    null,                                             // [10] Isabella Evans — unused
    { firstName: 'Mason', lastName: 'Garza' },        // [11]
  ]
  const matched = personaTargets.map((t) =>
    t ? rows.find((r) => r.firstName === t.firstName && r.lastName === t.lastName) ?? null : null,
  )
  const orderedIds = matched.map((m) => m?.id ?? '')
  const orderedPersonas = matched.map((m) => ({
    firstName: m?.firstName ?? '',
    lastName: m?.lastName ?? '',
    city: m?.city ?? null,
    state: m?.state ?? null,
  }))

  await db
    .update(schema.clinicProfile)
    .set({
      testimonials: buildDemoTestimonials(orderedIds, orderedPersonas),
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, orgId))
}

/**
 * Idempotent backfill of review_request.review_text + rating on legacy
 * demos that were seeded before migration 0035 added the column. Without
 * this, every card on /reviews/received shows "this patient went straight
 * to a third-party platform" even though the public site has the text —
 * because the text lives in clinic_profile.testimonials JSON, never on
 * the review_request row that the dashboard reads from.
 *
 * Joins review_request → patient, matches the patient name to a
 * DEMO_REVIEW_TEXTS entry (via the well-known persona ordering: Mia at 0,
 * Liam at 1, …), and updates the row when review_text is currently null.
 * Real-clinic data is never touched: this only runs in the demo-clinic
 * self-heal path, and only modifies rows whose patient name exactly
 * matches a seeded persona.
 */
async function topUpDemoReviewText(orgId: string): Promise<void> {
  const rows = await db
    .select({
      reviewRequestId: schema.reviewRequest.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
    })
    .from(schema.reviewRequest)
    .innerJoin(schema.patient, eq(schema.reviewRequest.patientId, schema.patient.id))
    .where(
      and(
        eq(schema.reviewRequest.organizationId, orgId),
        eq(schema.reviewRequest.status, 'completed'),
        isNull(schema.reviewRequest.reviewText),
      ),
    )
  if (rows.length === 0) return

  // Persona name → index, matching buildPatientPersonas's order so we can
  // look up the DEMO_REVIEW_TEXTS entry by name.
  const personaIdxByName = new Map<string, number>([
    ['Mia Hayes', 0],
    ['Liam Brooks', 1],
    ['Charlotte Diaz', 2],
    ['Marcus Johnson', 3],
    ['Sophia Iverson', 4],
    ['Aiden Kim', 5],
    ['Emma Lopez', 6],
    ['Noah Mitchell', 7],
    ['Olivia Anderson', 8],
    ['Ethan Carter', 9],
    ['Isabella Evans', 10],
    ['Mason Garza', 11],
    ['Ava Fischer', 12],
    ['James Owens', 13],
  ])

  for (const row of rows) {
    const idx = personaIdxByName.get(`${row.firstName} ${row.lastName}`)
    if (idx == null) continue
    const entry = DEMO_REVIEW_TEXTS[idx]
    if (!entry) continue
    await db
      .update(schema.reviewRequest)
      .set({
        reviewText: entry.text,
        rating: entry.rating,
        updatedAt: new Date(),
      })
      .where(eq(schema.reviewRequest.id, row.reviewRequestId))
  }
}

/**
 * Seed Reviews & Reputation demo content. Lays down the clinic review
 * config (Google Place ID + Healthgrades URL) and a curated set of
 * review_request rows covering every funnel state. Idempotent —
 * checks existing config and patient ids before inserting.
 */
async function seedReviewsForOrg(
  orgId: string,
  now: Date,
  patientIds: string[],
  configExists: boolean,
  existingPatientRequestIds: Set<string>,
): Promise<{ configAdded: boolean; requestsAdded: number }> {
  const dayMs = 24 * 60 * 60 * 1000
  let configAdded = false
  let requestsAdded = 0

  // Seed config (Acme Dental's "Google Place ID" — visibly fake but
  // well-formed, so the public landing page renders the right URL even
  // though the deep link won't resolve in dev).
  if (!configExists) {
    await db.insert(schema.clinicReviewConfig).values({
      organizationId: orgId,
      googlePlaceId: 'ChIJDemo000000000_AcmeDental',
      healthgradesUrl: 'https://www.healthgrades.com/dental-practice/acme-dental-demo',
      facebookPageId: 'acme-dental-demo',
      yelpBusinessSlug: null, // opt-in only; Acme keeps it off
      minDaysBetweenRequests: 365,
      npsEnabled: 0,
      autoSendEnabled: 0,
      autoSendDelayHours: 24,
    })
    configAdded = true
  }

  // Curated review_request seeds covering every funnel state, with seven
  // `completed` rows so /reviews/received demos a realistically populated
  // table. The persona/site/timing mix below is index-aligned to demo
  // personas. Five of the seven completed rows are pre-promoted to the
  // public site via DEMO_FEATURED_PATIENT_IDXS (rendering as "✓ Featured");
  // the other two stay unfeatured so the "Feature on website" CTA on
  // /reviews/received has live targets. ALL completed rows carry full
  // review text on review_request.reviewText (sourced from DEMO_REVIEW_TEXTS)
  // so the staff member can read the patient's actual words.
  //
  //   [0] Mia        — completed Google      · 5d ago   (featured)
  //   [7] Noah       — completed Healthgrades · 12d ago (featured)
  //   [2] Charlotte  — completed Google      · 18d ago  (featured)
  //   [6] Emma       — completed Facebook    · 22d ago  (featured)
  //   [11] Mason     — completed Google      · 35d ago  (featured)
  //   [1] Liam       — completed Healthgrades · 8d ago  (NOT featured — demo CTA target)
  //   [12] Ava       — completed Google      · 28d ago  (NOT featured — demo CTA target)
  //   [3] Marcus     — sent + clicked        · 3d ago   (bouncing back)
  //   [4] Sophia     — sent                  · 1d ago   (not opened yet)
  //   [8] Olivia     — skipped (staff opted out)
  //   [9] Ethan      — failed (email bounce)
  interface ReviewSeed {
    patientIdx: number
    status: 'sent' | 'clicked' | 'completed' | 'skipped' | 'failed'
    daysAgo: number
    selectedSite?: 'google' | 'healthgrades' | 'facebook' | 'yelp'
  }
  const REVIEW_SEEDS: ReviewSeed[] = [
    // Completed — featured on the public site (review text comes from
    // DEMO_REVIEW_TEXTS keyed by patientIdx — single source of truth)
    { patientIdx: 0, status: 'completed', daysAgo: 5, selectedSite: 'google' },
    { patientIdx: 7, status: 'completed', daysAgo: 12, selectedSite: 'healthgrades' },
    { patientIdx: 2, status: 'completed', daysAgo: 18, selectedSite: 'google' },
    { patientIdx: 6, status: 'completed', daysAgo: 22, selectedSite: 'facebook' },
    { patientIdx: 11, status: 'completed', daysAgo: 35, selectedSite: 'google' },
    // Completed with text — NOT yet featured (demo targets for the
    // "Feature on website" CTA on /reviews/received). Their reviewText still
    // gets seeded so the staff member can read the patient's words before
    // deciding to feature.
    { patientIdx: 1, status: 'completed', daysAgo: 8, selectedSite: 'healthgrades' },
    { patientIdx: 12, status: 'completed', daysAgo: 28, selectedSite: 'google' },
    // Earlier funnel stages
    { patientIdx: 3, status: 'clicked', daysAgo: 3 },
    { patientIdx: 4, status: 'sent', daysAgo: 1 },
    { patientIdx: 8, status: 'skipped', daysAgo: 7 },
    { patientIdx: 9, status: 'failed', daysAgo: 4 },
  ]

  for (const seed of REVIEW_SEEDS) {
    if (seed.patientIdx >= patientIds.length) continue
    const patientId = patientIds[seed.patientIdx]
    if (existingPatientRequestIds.has(patientId)) continue

    const sentAt = seed.status === 'failed'
      ? null
      : new Date(now.getTime() - seed.daysAgo * dayMs)
    const clickedAt = seed.status === 'clicked' || seed.status === 'completed'
      ? new Date(now.getTime() - (seed.daysAgo - 0.25) * dayMs)
      : null
    const completedAt = seed.status === 'completed'
      ? new Date(now.getTime() - (seed.daysAgo - 0.5) * dayMs)
      : null

    // Patient's actual review words + rating, when this seed represents a
    // completed-with-text submission. Sourced from DEMO_REVIEW_TEXTS so the
    // /reviews/received UI shows real quote text staff can read (and the
    // featured public-site testimonials use the SAME text after promotion —
    // single source of truth).
    const reviewEntry = seed.status === 'completed' ? DEMO_REVIEW_TEXTS[seed.patientIdx] : undefined
    await db.insert(schema.reviewRequest).values({
      id: newId('revreq'),
      organizationId: orgId,
      patientId,
      appointmentId: null,
      requestedByUserId: null,
      channel: 'email',
      status: seed.status,
      sentAt,
      clickedAt,
      completedAt,
      selectedSite: seed.selectedSite ?? null,
      reviewText: reviewEntry?.text ?? null,
      rating: reviewEntry?.rating ?? null,
      token: `demo${seed.status.slice(0, 3)}${seed.patientIdx}_${Math.random().toString(36).slice(2, 10)}`,
      errorMessage: seed.status === 'failed' ? 'Email bounced (demo)' : null,
      createdAt: new Date(now.getTime() - seed.daysAgo * dayMs),
      updatedAt: new Date(now.getTime() - seed.daysAgo * dayMs),
    })
    requestsAdded++
  }

  return { configAdded, requestsAdded }
}

// ── Blog seeding (shared by new-clinic-seed + self-heal) ────────────────
// Curated set covering every state the /blog dashboard + public blog show:
// two published posts bylined to demo staff (p1 = Dr. Jordan Reyes,
// p3 = Maria Vega, RDH — the ids seeded into clinicProfile.staff), one plain
// draft, and one AI-drafted post still awaiting review (drives the
// "AI · review" badge + the publish gate). Content comes from the shared
// STARTER_BLOG_TOPICS so there's a single source of truth. Additive +
// idempotent on slug.
interface BlogPostSeed {
  slug: string
  status: 'draft' | 'scheduled' | 'published'
  source: 'manual' | 'ai_draft'
  authorStaffId: string | null
  authorName: string | null
  // p3 = Maria (hygienist) writes the gum-health post, reviewed by p1 (Dr.
  // Reyes) — exercises the public "Medically reviewed by" byline line.
  medicallyReviewedByStaffId: string | null
  publishedDaysAgo: number | null
  scheduledInDays: number | null
  coverImageUrl: string | null
  coverImageAlt?: string | null
  faq?: Array<{ q: string; a: string }>
  viewCount: number
  // idea-to-draft stub: empty body so it lands in the calendar's "Ideas" lane.
  isStub?: boolean
}

const DEMO_BLOG_PLAN: BlogPostSeed[] = [
  {
    slug: 'what-to-expect-at-your-first-visit',
    status: 'published',
    source: 'manual',
    authorStaffId: 'p1',
    authorName: 'Dr. Jordan Reyes',
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: 9,
    scheduledInDays: null,
    coverImageUrl: DEMO_OFFICE_PHOTOS[0].url,
    coverImageAlt: 'A bright, modern dental treatment room with natural light',
    viewCount: 142,
  },
  {
    slug: 'why-your-gums-matter',
    status: 'published',
    source: 'manual',
    authorStaffId: 'p3',
    authorName: 'Maria Vega, RDH',
    medicallyReviewedByStaffId: 'p1',
    publishedDaysAgo: 28,
    scheduledInDays: null,
    coverImageUrl: DEMO_OFFICE_PHOTOS[2].url,
    coverImageAlt: 'A dental hygienist reviewing gum health with a smiling patient',
    faq: [
      {
        q: 'Is it normal for my gums to bleed when I floss?',
        a: 'A little bleeding when you first start flossing is common and usually settles within a week or two. If it keeps happening, mention it at your next visit.',
      },
      {
        q: 'How often should I have my gums checked?',
        a: 'For most people, a check-up and cleaning every six months keeps gums healthy and catches any early changes.',
      },
      {
        q: 'Can gum problems be reversed?',
        a: 'Early gum inflammation (gingivitis) is very reversible with good home care and a professional cleaning. More advanced issues are managed rather than fully reversed — so earlier is always better.',
      },
    ],
    viewCount: 87,
  },
  {
    slug: 'teeth-whitening-what-actually-works',
    status: 'draft',
    source: 'manual',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: null,
    coverImageUrl: null,
    viewCount: 0,
  },
  {
    // Scheduled to auto-publish — exercises the Content Engine cron path.
    slug: 'sensitive-teeth-what-helps',
    status: 'scheduled',
    source: 'manual',
    authorStaffId: 'p1',
    authorName: 'Dr. Jordan Reyes',
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: 6,
    coverImageUrl: DEMO_OFFICE_PHOTOS[1].url,
    coverImageAlt: 'A calm dental reception area with warm wood and plants',
    viewCount: 0,
  },
  {
    // AI draft pending review (full body, awaiting an author + publish).
    slug: 'bringing-your-kids-to-the-dentist',
    status: 'draft',
    source: 'ai_draft',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: null,
    coverImageUrl: null,
    viewCount: 0,
  },
  {
    // Idea stub — lands in the calendar's "Ideas to draft" lane.
    slug: 'do-you-need-a-night-guard',
    status: 'draft',
    source: 'ai_draft',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: null,
    coverImageUrl: null,
    viewCount: 0,
    isStub: true,
  },
]

async function seedBlogPostsForOrg(orgId: string, now: Date, existingSlugs: Set<string>) {
  const topicBySlug = new Map(STARTER_BLOG_TOPICS.map((t) => [t.slug, t]))
  const dayMs = 24 * 60 * 60 * 1000
  let added = 0
  for (const plan of DEMO_BLOG_PLAN) {
    const publishedAt =
      plan.publishedDaysAgo != null ? new Date(now.getTime() - plan.publishedDaysAgo * dayMs) : null
    const scheduledFor =
      plan.scheduledInDays != null ? new Date(now.getTime() + plan.scheduledInDays * dayMs) : null
    const reviewedAt = plan.medicallyReviewedByStaffId ? publishedAt ?? now : null
    if (existingSlugs.has(plan.slug)) {
      // Backfill Track-A fields (reviewer + view count) on legacy demo posts
      // that predate them, so the demo always showcases the latest module.
      await db
        .update(schema.blogPost)
        .set({
          medicallyReviewedByStaffId: plan.medicallyReviewedByStaffId,
          medicallyReviewedAt: reviewedAt,
          viewCount: plan.viewCount,
          coverImageAlt: plan.coverImageAlt ?? null,
          faq: plan.faq ?? null,
        })
        .where(and(eq(schema.blogPost.organizationId, orgId), eq(schema.blogPost.slug, plan.slug)))
      continue
    }
    const topic = topicBySlug.get(plan.slug)
    if (!topic) continue
    await db.insert(schema.blogPost).values({
      id: newId('post'),
      organizationId: orgId,
      title: topic.title,
      slug: topic.slug,
      excerpt: topic.excerpt,
      bodyHtml: plan.isStub ? '' : sanitizeBlogHtml(topic.bodyHtml),
      category: topic.category,
      status: plan.status,
      source: plan.source,
      authorStaffId: plan.authorStaffId,
      authorName: plan.authorName,
      medicallyReviewedByStaffId: plan.medicallyReviewedByStaffId,
      medicallyReviewedAt: reviewedAt,
      coverImageUrl: plan.coverImageUrl,
      coverImageAlt: plan.coverImageAlt ?? null,
      faq: plan.faq ?? null,
      viewCount: plan.viewCount,
      scheduledFor,
      publishedAt,
      createdAt: publishedAt ?? now,
      updatedAt: publishedAt ?? now,
    })
    added++
  }
  return { added }
}

// ── Booking attribution backfill (demo) ─────────────────────────────────────
// Populates referrer/UTM on the demo's public-booking appointments so the SEO
// module's organic→booking funnel shows a realistic mix. Idempotent (only
// touches booking_widget rows that have no referrer yet). Runs on both the
// fresh-seed and self-heal paths.
async function backfillDemoBookingAttribution(orgId: string) {
  const rows = await db
    .select({ id: schema.appointment.id })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, orgId),
        eq(schema.appointment.source, 'booking_widget'),
        isNull(schema.appointment.referrer),
      ),
    )
  const mix = [
    { sourcePage: '/', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic' },
    { sourcePage: '/book', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic' },
    { sourcePage: '/', referrer: 'https://www.instagram.com/', utmSource: 'instagram', utmMedium: 'social' },
    { sourcePage: '/book', referrer: null, utmSource: null, utmMedium: null },
  ]
  for (let i = 0; i < rows.length; i++) {
    await db.update(schema.appointment).set(mix[i % mix.length]).where(eq(schema.appointment.id, rows[i].id))
  }
}

// ── Careers seeding (shared by new-clinic-seed + self-heal) ─────────────────
// Pure inserts (no selects) so the new-seed path doesn't shift the seeder
// test's select queue. Two open roles + one draft + applications across the
// whole pipeline (new/reviewing/interview/offer/hired/rejected) with aging
// spread so the rot borders + every status chip render on the demo.
async function seedDemoCareers(orgId: string, locationId: string | null, now: Date) {
  const dayMs = 24 * 60 * 60 * 1000
  const hourMs = 60 * 60 * 1000
  const hygId = newId('job')
  const fdId = newId('job')
  const dentId = newId('job')

  await db.insert(schema.jobPosting).values([
    {
      id: hygId,
      organizationId: orgId,
      locationId,
      title: 'Dental Hygienist',
      slug: 'dental-hygienist',
      role: 'hygienist',
      employmentType: 'full_time',
      description:
        'We’re looking for a warm, thorough RDH to join our hygiene team. Our patients are loyal, our schedule is well-run, and our team genuinely likes each other. You’ll own your column with modern equipment and real admin support.',
      responsibilities:
        '• Prophylaxis, SRP, and periodontal maintenance\n• Intraoral imaging + chart documentation\n• Patient education with our anti-shame approach\n• Partnering with the doctor on treatment planning',
      requirements:
        '• Active RDH license in TX\n• Local anesthesia certification preferred\n• 1+ year clinical experience (new grads welcome to apply)',
      benefits: 'Health + dental, 401(k) match, CE allowance, 4-day work week, paid holidays.',
      compMinCents: 3800,
      compMaxCents: 4800,
      compPeriod: 'hour',
      showComp: 1,
      status: 'open',
      applyMethod: 'in_app',
      postedAt: new Date(now.getTime() - 9 * dayMs),
      createdAt: new Date(now.getTime() - 9 * dayMs),
    },
    {
      id: fdId,
      organizationId: orgId,
      locationId,
      title: 'Front Desk Coordinator',
      slug: 'front-desk-coordinator',
      role: 'front_desk',
      employmentType: 'full_time',
      description:
        'The first face our patients see. You’ll own scheduling, check-in, insurance verification, and keeping the day running smoothly. Friendly, organized, and unflappable under a busy phone.',
      responsibilities:
        '• Greet + check in patients\n• Manage the schedule + recall list\n• Verify insurance + collect copays\n• Answer calls and respond to website inquiries',
      requirements: '• Front-desk or customer-service experience\n• Dental software experience a plus (we’ll train)',
      benefits: 'Health + dental, PTO, quarterly team bonuses.',
      compMinCents: 2000,
      compMaxCents: 2600,
      compPeriod: 'hour',
      showComp: 1,
      status: 'open',
      applyMethod: 'in_app',
      postedAt: new Date(now.getTime() - 5 * dayMs),
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      id: dentId,
      organizationId: orgId,
      locationId,
      title: 'Associate Dentist (part-time)',
      slug: 'associate-dentist',
      role: 'associate_dentist',
      employmentType: 'part_time',
      description:
        'Two-to-three days a week to start, with room to grow. Established patient base, strong hygiene program feeding restorative, and a collaborative, no-drama environment.',
      requirements: '• Active TX dental license\n• DEA registration\n• Comfortable with everyday restorative + we refer out complex surgical',
      benefits: 'Percentage of collections, malpractice covered, flexible schedule.',
      compMinCents: null,
      compMaxCents: null,
      compPeriod: 'year',
      showComp: 0,
      status: 'draft',
      applyMethod: 'in_app',
    },
  ])

  await db.insert(schema.jobApplication).values([
    // Fresh, unreviewed → emerald rot border + 🆕 attention.
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: hygId,
      name: 'Jordan Avery',
      email: 'jordan.avery@example.com',
      phone: '(512) 555-0142',
      linkedinUrl: 'https://www.linkedin.com/in/jordan-avery-rdh',
      coverNote:
        'Hi! I’ve been a hygienist for 6 years and I’m looking for a practice that values patient relationships over production quotas. Your site’s tone really resonated with me.',
      status: 'new',
      source: 'career_site',
      createdAt: new Date(now.getTime() - 6 * hourMs),
    },
    // Aging unreviewed (amber border).
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: fdId,
      name: 'Taylor Kim',
      email: 'taylor.kim@example.com',
      phone: '(512) 555-0188',
      status: 'new',
      source: 'career_site',
      createdAt: new Date(now.getTime() - 50 * hourMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: hygId,
      name: 'Priya Nair',
      email: 'priya.nair@example.com',
      phone: '(512) 555-0173',
      status: 'reviewing',
      source: 'career_site',
      reviewedAt: new Date(now.getTime() - 1 * dayMs),
      createdAt: new Date(now.getTime() - 3 * dayMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: hygId,
      name: 'Sam Brooks',
      email: 'sam.brooks@example.com',
      phone: '(512) 555-0155',
      status: 'interview',
      source: 'referral',
      rating: 4,
      notes: 'Strong references. Scheduling a working interview next week.',
      reviewedAt: new Date(now.getTime() - 2 * dayMs),
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: fdId,
      name: 'Riley Chen',
      email: 'riley.chen@example.com',
      phone: '(512) 555-0121',
      status: 'offer',
      source: 'career_site',
      rating: 5,
      notes: 'Great culture fit. Offer sent — awaiting response.',
      reviewedAt: new Date(now.getTime() - 4 * dayMs),
      createdAt: new Date(now.getTime() - 7 * dayMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: fdId,
      name: 'Morgan Lee',
      email: 'morgan.lee@example.com',
      status: 'hired',
      source: 'career_site',
      rating: 5,
      notes: 'Started this month — already a star.',
      reviewedAt: new Date(now.getTime() - 15 * dayMs),
      decidedAt: new Date(now.getTime() - 10 * dayMs),
      createdAt: new Date(now.getTime() - 20 * dayMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: hygId,
      name: 'Casey Doyle',
      email: 'casey.doyle@example.com',
      status: 'rejected',
      source: 'career_site',
      notes: 'Not enough recent clinical hours for this role.',
      reviewedAt: new Date(now.getTime() - 10 * dayMs),
      decidedAt: new Date(now.getTime() - 9 * dayMs),
      createdAt: new Date(now.getTime() - 12 * dayMs),
    },
  ])
}

// ── Shop seeding (catalog only; orders/coupons/memberships in later slices) ──
// Pure inserts (no selects) so the new-seed path doesn't shift the seeder
// test's select queue. 6 products across categories + statuses, 7 variants.
async function seedDemoShop(orgId: string, now: Date, patientIds: string[] = []) {
  await db
    .insert(schema.shopConfig)
    .values({
      organizationId: orgId,
      pickupEnabled: 1,
      shippingEnabled: 1,
      taxEnabled: 0,
      storefrontEnabled: 1,
      membershipEnabled: 1,
      stripeAccountStatus: 'none',
    })
    .onConflictDoNothing({ target: schema.shopConfig.organizationId })

  const whiteningId = newId('prod')
  const brushId = newId('prod')
  const flosserId = newId('prod')
  const pensId = newId('prod')
  const kidsId = newId('prod')
  const merchId = newId('prod')

  await db.insert(schema.shopProduct).values([
    {
      id: whiteningId,
      organizationId: orgId,
      name: 'Professional Whitening Kit',
      slug: 'professional-whitening-kit',
      description:
        'Dentist-dispensed take-home whitening with professional-strength gel and a comfortable tray. Noticeably whiter in about two weeks — far stronger than anything off the shelf.',
      category: 'whitening',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 1,
      position: 0,
    },
    {
      id: brushId,
      organizationId: orgId,
      name: 'Sonic Electric Toothbrush',
      slug: 'sonic-electric-toothbrush',
      description: 'The brush we recommend to every patient — sonic cleaning, 2-minute timer, and a pressure sensor so you do not brush too hard.',
      category: 'brushes',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 1,
      featured: 1,
      position: 1,
    },
    {
      id: flosserId,
      organizationId: orgId,
      name: 'Cordless Water Flosser',
      slug: 'cordless-water-flosser',
      description: 'Great for braces, implants, and anyone who finds string floss a chore. Rechargeable and travel-friendly.',
      category: 'flossers',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 0,
      position: 2,
    },
    {
      id: pensId,
      organizationId: orgId,
      name: 'Whitening Touch-Up Pens (3-pack)',
      slug: 'whitening-touch-up-pens',
      description: 'Keep your results bright between visits. Pop one in your bag for quick touch-ups.',
      category: 'whitening',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 0,
      position: 3,
    },
    {
      id: kidsId,
      organizationId: orgId,
      name: 'Kids Brush + 2-Minute Timer Set',
      slug: 'kids-brush-timer-set',
      description: 'Makes brushing fun and gets them to the full two minutes. Soft bristles sized for little mouths.',
      category: 'kids',
      images: [],
      status: 'draft',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 0,
      position: 4,
    },
    {
      id: merchId,
      organizationId: orgId,
      name: 'Branded Travel Care Kit',
      slug: 'branded-travel-care-kit',
      description: 'Travel toothbrush, mini paste, and floss in a clinic-branded zip pouch.',
      category: 'merch',
      images: [],
      status: 'archived',
      fulfillment: 'pickup',
      fsaEligible: 0,
      featured: 0,
      position: 5,
    },
  ])

  const whiteningStdVar = newId('var')
  const brushVar = newId('var')
  const flosserVar = newId('var')
  const pensVar = newId('var')
  await db.insert(schema.shopProductVariant).values([
    { id: whiteningStdVar, productId: whiteningId, organizationId: orgId, name: 'Standard', priceCents: 14900, inventoryQty: 25, position: 0 },
    { id: newId('var'), productId: whiteningId, organizationId: orgId, name: 'Sensitive formula', priceCents: 14900, inventoryQty: 12, position: 1 },
    { id: brushVar, productId: brushId, organizationId: orgId, name: 'Default', priceCents: 8900, compareAtCents: 11900, inventoryQty: 40, position: 0 },
    { id: flosserVar, productId: flosserId, organizationId: orgId, name: 'Default', priceCents: 5900, inventoryQty: 18, position: 0 },
    { id: pensVar, productId: pensId, organizationId: orgId, name: 'Default', priceCents: 2900, inventoryQty: null, position: 0 },
    { id: newId('var'), productId: kidsId, organizationId: orgId, name: 'Default', priceCents: 1900, inventoryQty: 30, position: 0 },
    { id: newId('var'), productId: merchId, organizationId: orgId, name: 'Default', priceCents: 1500, inventoryQty: null, position: 0 },
  ])

  // Orders covering pickup/ship + paid/pending states. First linked to a
  // patient when one is available (new-seed path); the rest are guest orders.
  const dayMs = 24 * 60 * 60 * 1000
  const o1 = newId('ord')
  const o2 = newId('ord')
  const o3 = newId('ord')
  await db.insert(schema.shopOrder).values([
    {
      id: o1,
      organizationId: orgId,
      patientId: patientIds[2] ?? null,
      email: 'sophia.martinez@example.com',
      name: 'Sophia Martinez',
      fulfillmentType: 'pickup',
      status: 'paid',
      fulfillmentStatus: 'ready_for_pickup',
      subtotalCents: 14900,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 14900,
      paidAt: new Date(now.getTime() - 2 * dayMs),
      createdAt: new Date(now.getTime() - 2 * dayMs),
    },
    {
      id: o2,
      organizationId: orgId,
      email: 'guest.buyer@example.com',
      name: 'Daniel Park',
      fulfillmentType: 'ship',
      status: 'paid',
      fulfillmentStatus: 'shipped',
      subtotalCents: 14800,
      shippingCents: 600,
      taxCents: 0,
      totalCents: 15400,
      trackingNumber: '9400110200000000000000',
      shippingAddress: { line1: '500 Cedar St', city: 'Austin', state: 'TX', postal_code: '78704', country: 'US' },
      paidAt: new Date(now.getTime() - 5 * dayMs),
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      id: o3,
      organizationId: orgId,
      email: 'window.shopper@example.com',
      fulfillmentType: 'pickup',
      status: 'pending',
      fulfillmentStatus: 'unfulfilled',
      subtotalCents: 2900,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 2900,
      createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    },
  ])
  await db.insert(schema.shopOrderItem).values([
    { id: `oi_${newId('x')}`, orderId: o1, organizationId: orgId, variantId: whiteningStdVar, productName: 'Professional Whitening Kit', variantName: 'Standard', unitPriceCents: 14900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o2, organizationId: orgId, variantId: brushVar, productName: 'Sonic Electric Toothbrush', variantName: null, unitPriceCents: 8900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o2, organizationId: orgId, variantId: flosserVar, productName: 'Cordless Water Flosser', variantName: null, unitPriceCents: 5900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o3, organizationId: orgId, variantId: pensVar, productName: 'Whitening Touch-Up Pens (3-pack)', variantName: null, unitPriceCents: 2900, quantity: 1 },
  ])

  // Coupons: 2 open promo codes + (when a patient exists) a single-use
  // birthday code, so the coupons page shows manual + birthday sources.
  const coupons: Array<typeof schema.shopCoupon.$inferInsert> = [
    { id: newId('coupon'), organizationId: orgId, code: 'WELCOME10', discountType: 'percent', discountValue: 10, source: 'manual', singleUse: 0 },
    { id: newId('coupon'), organizationId: orgId, code: 'SUMMER25', discountType: 'amount', discountValue: 2500, source: 'manual', singleUse: 0, minSubtotalCents: 10000, expiresAt: new Date(now.getTime() + 60 * dayMs) },
  ]
  if (patientIds[0]) {
    coupons.push({ id: newId('coupon'), organizationId: orgId, code: 'BDAY-7F3A2C', discountType: 'percent', discountValue: 15, source: 'birthday', singleUse: 1, patientId: patientIds[0], expiresAt: new Date(now.getTime() + 45 * dayMs) })
  }
  await db.insert(schema.shopCoupon).values(coupons)
}

// ── Membership plans + members (pure inserts) ───────────────────────────────
// Memberships need a patient (NOT NULL FK), so members are seeded only for the
// patientIds passed in. Plans seed regardless.
async function seedDemoMemberships(orgId: string, now: Date, patientIds: string[]) {
  const dayMs = 24 * 60 * 60 * 1000
  const smileId = newId('mplan')
  const liteId = newId('mplan')
  await db.insert(schema.membershipPlan).values([
    {
      id: smileId,
      organizationId: orgId,
      name: 'Smile Club',
      slug: 'smile-club',
      description:
        'No insurance? No problem. Your preventive care for one simple yearly fee — plus 15% off everything else. No deductibles, no claim forms, no waiting periods.',
      billingInterval: 'annual',
      priceCents: 39900,
      benefits: [
        { label: '2 cleanings per year', qty: 2 },
        { label: '2 exams per year', qty: 2 },
        { label: 'Routine X-rays' },
        { label: '1 emergency visit', qty: 1 },
      ],
      discountPercent: 15,
      status: 'active',
      featured: 1,
      position: 0,
    },
    {
      id: liteId,
      organizationId: orgId,
      name: 'Smile Club Monthly',
      slug: 'smile-club-monthly',
      description: 'The same coverage, spread across the year.',
      billingInterval: 'monthly',
      priceCents: 3900,
      benefits: [
        { label: '2 cleanings per year', qty: 2 },
        { label: '2 exams per year', qty: 2 },
        { label: 'Routine X-rays' },
      ],
      discountPercent: 15,
      status: 'active',
      featured: 0,
      position: 1,
    },
  ])

  const members: Array<{ patientId: string | undefined; status: string; benefitsUsed: Record<string, number>; offset: number }> = [
    { patientId: patientIds[0], status: 'active', benefitsUsed: { '2 cleanings per year': 1 } as Record<string, number>, offset: 250 },
    { patientId: patientIds[1], status: 'active', benefitsUsed: {} as Record<string, number>, offset: 320 },
    { patientId: patientIds[4], status: 'past_due', benefitsUsed: { '2 cleanings per year': 2, '2 exams per year': 1 } as Record<string, number>, offset: 12 },
  ].filter((m) => Boolean(m.patientId))
  if (members.length > 0) {
    await db.insert(schema.membership).values(
      members.map((m) => ({
        id: newId('mem'),
        organizationId: orgId,
        planId: smileId,
        patientId: m.patientId as string,
        status: m.status,
        stripeSubscriptionId: `sub_demo_${newId('x')}`,
        benefitsUsed: m.benefitsUsed,
        currentPeriodStart: new Date(now.getTime() - (365 - m.offset) * dayMs),
        currentPeriodEnd: new Date(now.getTime() + m.offset * dayMs),
        startedAt: new Date(now.getTime() - (365 - m.offset) * dayMs),
      })),
    )
  }
}
