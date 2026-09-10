import 'server-only'
import { type ClinicService, type ClinicStat } from '@/lib/types/clinic-content'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'

// The demo practice's service list and dashboard stat tiles, including the
// pre-generated AI "customized" copy that shows the customized-vs-default
// contrast without calling a model.

// Demo content — pulled out so the create path and the self-heal path
// for already-seeded demos share one source of truth.
//
// The first stat uses the `dynamic: 'review_count'` flag — the public
// template substitutes `value` with the live count of completed
// `review_request` rows at render time. "happy patients" is the
// ambiguous label (implies positive without claiming a star count we
// can't verify). The demo seeds 7 completed reviews, so this renders as
// "7" on a freshly-seeded demo and grows as platform admins click through.
export const DEMO_STATS = [
  { id: 'st_reviews', value: '0', label: 'happy reviews', dynamic: 'review_count' as const },
  { id: 'st2', value: 'Same-week', label: 'appointments available' },
  { id: 'st3', value: 'Most', label: 'insurance accepted' },
]

// The demo's services reference the shared service library by slug — a mix of core
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

// Hand-written per-clinic AI customization blobs for each Dream Dental demo service.
// These mirror what `customizeServiceForClinic` would produce — same shape,
// same structure (process-step count + FAQ count match the canonical seed),
// warm Dream-Dental-flavored voice, no fabricated prices. Authored by hand to avoid
// hitting the Anthropic API on every resync (the resync runs on EVERY deploy
// via scripts/resync-demo.mjs — see CLAUDE.md "Deployment & operations").
// The detail-page resolver prefers these over canonical+tokens (1B path)
// whenever they're present + reference the right librarySlug. Real clinics
// in production get real AI rewrites via the generate-on-select picker.
const DEMO_CUSTOMIZED_GENERATED_AT = '2026-06-02T14:00:00Z'
const DEMO_CUSTOMIZED_MODEL_ID = 'claude-sonnet-4-6'

export const DEMO_CUSTOMIZED: Record<string, NonNullable<ClinicService['customized']>> = {
  'family-dental-care': {
    heroBullets: [
      'One welcoming dental home for every age',
      'Same-day scheduling so the whole family can come together',
      'Gentle, judgment-free care for adults and little ones',
      'Plain-English explanations, no scare tactics',
    ],
    body:
      "At Dream Dental, we look after the people who matter to you — toddlers learning to brush, teens between school and sports, parents juggling everything, grandparents getting back into a routine. We tailor each visit to the person in the chair and make it easy to book the whole household on the same morning. Families across Austin pick Dream Dental because it just fits real life.",
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
      "Regular exams are how we keep dentistry simple and affordable — small things stay small. At Dream Dental, your exam runs at your pace: we show you what we see, explain what it means in plain English, and let you decide what's next without ever pushing you. Austin patients tell us it's the first dental exam they've actually enjoyed.",
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
      "Even the most disciplined brushing can't get to the hardened buildup along the gumline — that's what a professional cleaning is for. At Dream Dental our hygienists are gentle, calm, and happy to go slowly. You'll leave with a cleaner mouth and a few simple, judgment-free pointers to keep it that way until next time.",
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
      "Coffee, tea, red wine, and time all leave their mark. Professional whitening at Dream Dental lifts years of stains far more effectively than store-bought strips — and we tailor the final shade so it looks bright and natural, never theatrical. Austin patients love how it feels: a noticeable change you'd actually want to show off.",
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
      "Clear aligners straighten teeth without anyone needing to notice. At Dream Dental we design a custom series of smooth, removable trays that gently guide your teeth into place — so you can eat what you like, brush normally, and smile through the whole process with confidence. Plenty of Austin adults have finally fixed something that bothered them for decades.",
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
      "A missing tooth is more than a gap — it can shift neighboring teeth and slowly weaken the jawbone underneath. A dental implant replaces the whole tooth, root and all, for a result that looks, feels, and functions like the real thing. At Dream Dental we walk you through every step calmly, so the process feels manageable and the result lasts.",
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
      "\"Surgery\" sounds scary, but most oral procedures are routine, well-practiced, and far more comfortable than people expect. At Dream Dental we explain everything in plain language, offer sedation when it helps, and keep you calm and pain-free from the moment you sit down to the moment you walk out.",
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
      "For patients with strong dental anxiety — or longer procedures you'd rather not remember — IV sedation offers a deeply relaxed, comfortable experience. At Dream Dental sedation is administered and monitored by trained clinicians, so you can get the care you need while staying calm and safe from start to finish.",
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
