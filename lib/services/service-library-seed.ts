// Canonical Tend-style service catalog — the shared baseline every clinic
// starts from. Pure data (no DB, no 'server-only'): safe to import from both
// server modules (the seeder, the page) and client-renderable demos / tests.
//
// Content rules (per DESIGN.md + the 1A spec):
//  • Anti-shame, warm, plain-English dental voice. No marketing-bro vocabulary.
//  • NO fabricated pricing — cost FAQs describe the estimate-first process and
//    point at insurance verification, never an invented dollar figure.
//  • Universal-but-warm: no clinic-specific medical claims. `{clinic}` / `{city}`
//    tokens stand in for per-clinic customization (substituted at render in 1A;
//    AI-rewritten in 1B).
//  • Core vs special is purely a nav taxonomy — both render the SAME detail
//    skeleton. Category drives /services grouping + nav-dropdown placement +
//    offer-ribbon eligibility.

import type { ServiceLibraryEntry } from '@/lib/types/clinic-content'

// A universal, honest cost answer reused across every service's FAQ. No dollar
// figures — the promise is a clear estimate up front + insurance checked first.
const COST_ANSWER =
  "Cost depends on your specific treatment plan — every mouth is different. " +
  "We'll check your insurance first, then give you a clear, itemized estimate " +
  "before anything begins, so there are no surprises. If cost is a concern, " +
  'tell us — we can talk through options and payment plans.'

export const SERVICE_LIBRARY_SEED: ServiceLibraryEntry[] = [
  // ── CORE ──────────────────────────────────────────────────────────────
  {
    slug: 'family-dental-care',
    name: 'Family Dental Care',
    category: 'core',
    icon: '👨‍👩‍👧',
    shortDescription:
      'One welcoming dental home for every age — from first teeth to retirement.',
    heroBullets: [
      'Care for the whole family, all in one place',
      'Gentle, kid-friendly first visits',
      'Same-day scheduling for busy households',
      'A calm, judgment-free room for every age',
    ],
    body:
      "At {clinic}, family dentistry means one trusted place for everyone you " +
      "love — toddlers, teens, parents, and grandparents alike. We tailor every " +
      "visit to the person in the chair, keep things calm and unhurried, and make " +
      "it easy to book the whole family on the same day. For families in {city}, " +
      "it's dental care that fits real life.",
    processSteps: [
      {
        title: 'A warm welcome',
        body:
          "We get to know your family, review health histories, and answer any " +
          "questions before we look at a single tooth.",
      },
      {
        title: 'A gentle exam for each person',
        body:
          "Each family member gets an age-appropriate exam — playful and " +
          "reassuring for little ones, thorough and straightforward for adults.",
      },
      {
        title: 'A cleaning and plain-English findings',
        body:
          "We clean, polish, and walk you through anything we noticed in language " +
          "that actually makes sense — no jargon, no scare tactics.",
      },
      {
        title: 'A simple plan for next time',
        body:
          "We map out recall visits and any follow-up care so the whole household " +
          "stays on track, and we make the next appointment easy to book.",
      },
    ],
    faq: [
      {
        question: 'At what age should my child first see a dentist?',
        answer:
          "Most kids do well with a first visit around their first birthday or " +
          "when their first tooth appears. Early visits are short, friendly, and " +
          "mostly about getting comfortable.",
      },
      {
        question: 'Can the whole family be seen on the same day?',
        answer:
          "Yes — that's the whole point of a family practice. Just let us know " +
          "when you book and we'll do our best to group your appointments.",
      },
      {
        question: "It's been years since my last visit. Will I be judged?",
        answer:
          "Never. Whether it's been six months or six years, you'll be met with " +
          "warmth, not lectures. We meet you exactly where you are.",
      },
      {
        question: 'Do you take my insurance?',
        answer:
          "We accept most major PPO plans. Send us your carrier and plan name and " +
          "we'll verify your coverage before your visit.",
      },
      {
        question: 'How much will our visits cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['dental-exams', 'dental-hygiene', 'dental-emergency'],
  },
  {
    slug: 'dental-exams',
    name: 'Dental Exams',
    category: 'core',
    icon: '🔎',
    shortDescription:
      'A thorough, gentle checkup that catches small problems before they grow.',
    heroBullets: [
      'Comprehensive oral health check',
      'Low-radiation digital X-rays when needed',
      'Oral cancer screening included',
      'Clear, plain-English explanations',
    ],
    body:
      "A regular exam is the single best way to keep dentistry simple and " +
      "affordable — small issues are easy to fix, big ones are not. At {clinic}, " +
      "your exam is unhurried and genuinely educational: we show you what we see, " +
      "explain what it means, and never pressure you into anything.",
    processSteps: [
      {
        title: 'Review your history',
        body:
          "We start by talking through your health history, any changes since your " +
          "last visit, and anything that's been bothering you.",
      },
      {
        title: 'A careful look',
        body:
          "We examine your teeth, gums, bite, and soft tissues — including a " +
          "quick, painless oral cancer screening.",
      },
      {
        title: 'Images only when they help',
        body:
          "If we need a closer look, we take low-radiation digital X-rays and " +
          "review them with you right on the screen.",
      },
      {
        title: 'Your findings, explained',
        body:
          "We walk you through everything we found and lay out your options — " +
          "no jargon, no pressure, just a clear picture of where things stand.",
      },
    ],
    faq: [
      {
        question: 'How often should I have a dental exam?',
        answer:
          "Most people do well with an exam and cleaning every six months, but we'll " +
          "recommend a schedule that fits your individual needs.",
      },
      {
        question: 'Are dental X-rays safe?',
        answer:
          "Modern digital X-rays use very low radiation — far less than older film. " +
          "We only take them when they'll genuinely help us care for you.",
      },
      {
        question: 'Does a dental exam hurt?',
        answer:
          "Not at all. An exam is gentle and non-invasive. If anything ever feels " +
          "uncomfortable, just tell us and we'll pause.",
      },
      {
        question: 'What if you find a problem?',
        answer:
          "We'll explain exactly what we found, why it matters, and your options — " +
          "then leave the decision to you. There's never any pressure.",
      },
      {
        question: 'How much does an exam cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['dental-hygiene', 'cavity-treatment', 'family-dental-care'],
  },
  {
    slug: 'dental-hygiene',
    name: 'Hygiene & Cleaning',
    category: 'core',
    icon: '✨',
    shortDescription:
      'A professional cleaning that leaves your smile fresh, healthy, and bright.',
    heroBullets: [
      'Gentle, thorough professional cleaning',
      'Removes plaque and tartar buildup',
      'Personalized at-home care tips',
      'A noticeably fresher, smoother smile',
    ],
    body:
      "Even the best brushing can't remove hardened tartar — that's what a " +
      "professional cleaning is for. At {clinic}, our hygienists are gentle, " +
      "unhurried, and happy to go at your pace. You'll leave with a cleaner " +
      "mouth and a simple plan to keep it that way between visits.",
    processSteps: [
      {
        title: 'A quick check-in',
        body:
          "Your hygienist reviews your history and asks about any sensitivity or " +
          "concerns so the cleaning is tailored to you.",
      },
      {
        title: 'Remove plaque and tartar',
        body:
          "We carefully clear away buildup along the gumline and between teeth — " +
          "the part you can't reach at home.",
      },
      {
        title: 'Polish and floss',
        body:
          "A gentle polish leaves your teeth smooth and bright, followed by a " +
          "thorough flossing.",
      },
      {
        title: 'Personalized home tips',
        body:
          "We share simple, judgment-free pointers tailored to your mouth so the " +
          "results last until your next visit.",
      },
    ],
    faq: [
      {
        question: 'How often should I get my teeth cleaned?',
        answer:
          "Twice a year works for most people. If you're prone to buildup or gum " +
          "issues, we may suggest coming in a little more often.",
      },
      {
        question: 'Will the cleaning hurt?',
        answer:
          "Cleanings are usually very comfortable. If your gums are sensitive, tell " +
          "us — we can go gently and help you feel at ease.",
      },
      {
        question: 'My gums bleed when I floss. Is that normal?',
        answer:
          "A little bleeding often means your gums need more consistent care, not " +
          "less. We'll show you what's going on and how to turn it around.",
      },
      {
        question: 'Will my teeth look whiter after a cleaning?',
        answer:
          "A cleaning removes surface stains and buildup, so your smile will look " +
          "fresher and brighter. For a bigger change, ask us about whitening.",
      },
      {
        question: 'How much does a cleaning cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['dental-exams', 'perio-treatment', 'teeth-whitening'],
  },
  {
    slug: 'dental-emergency',
    name: 'Emergency Care',
    category: 'core',
    icon: '🚨',
    shortDescription:
      'Fast, calm relief when something hurts — same-day care when you need it.',
    heroBullets: [
      'Same-day emergency appointments',
      'Fast relief from dental pain',
      'Gentle care for anxious patients',
      'Clear next steps, start to finish',
    ],
    body:
      "A toothache or a broken tooth is stressful enough — getting seen " +
      "shouldn't add to it. At {clinic}, we keep room in the schedule for " +
      "urgent problems and treat every emergency with calm, focused care. " +
      "If you're in pain anywhere in {city}, call us — we'll get you comfortable.",
    processSteps: [
      {
        title: 'Call us right away',
        body:
          "Tell us what's happening and we'll get you in as soon as possible — " +
          "often the same day.",
      },
      {
        title: 'Get comfortable first',
        body:
          "Our first priority is relief. We'll address your pain and help you " +
          "settle before anything else.",
      },
      {
        title: 'Find the cause',
        body:
          "We examine the area, take an image if needed, and pinpoint exactly " +
          "what's wrong.",
      },
      {
        title: 'Treat and plan',
        body:
          "We handle what we can right away and lay out a clear plan for any " +
          "follow-up care — so you leave knowing what's next.",
      },
    ],
    faq: [
      {
        question: 'What counts as a dental emergency?',
        answer:
          "Severe or lasting pain, a knocked-out or broken tooth, swelling, or " +
          "bleeding that won't stop are all worth a call. When in doubt, reach out.",
      },
      {
        question: 'My tooth got knocked out — what do I do?',
        answer:
          "Gently rinse it (hold it by the crown, not the root), keep it in milk or " +
          "your cheek, and call us immediately. Acting fast gives the best chance of " +
          "saving it.",
      },
      {
        question: 'Can you see me today?',
        answer:
          "We hold time in the schedule for urgent problems and will do everything " +
          "we can to see you the same day. Call us and we'll find a way.",
      },
      {
        question: "I'm scared of the dentist but I'm in pain. Can you help?",
        answer:
          "Absolutely. Tell us you're anxious when you call — we'll go slowly, " +
          "explain every step, and focus first on getting you out of pain.",
      },
      {
        question: 'How much will emergency treatment cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['cavity-treatment', 'endodontics', 'wisdom-teeth'],
  },
  {
    slug: 'orthodontics',
    name: 'Orthodontics',
    category: 'core',
    icon: '🦷',
    shortDescription:
      'Straighten your smile and balance your bite — for kids, teens, and adults.',
    heroBullets: [
      'Options for every age',
      'Healthier bite, easier cleaning',
      'A confident, even smile',
      'A clear plan and timeline up front',
    ],
    body:
      "Straight teeth aren't just about looks — a balanced bite is easier to " +
      "clean and gentler on your jaw for life. At {clinic}, we'll assess your " +
      "smile, explain your options in plain language, and build a plan around " +
      "the result you want and the life you lead.",
    processSteps: [
      {
        title: 'A smile assessment',
        body:
          "We look at your teeth, bite, and jaw, take any images we need, and " +
          "listen to what you'd like to change.",
      },
      {
        title: 'Your options, explained',
        body:
          "We walk you through the approaches that fit your case — from clear " +
          "aligners to braces — with honest pros, cons, and timelines.",
      },
      {
        title: 'Steady, comfortable progress',
        body:
          "Once treatment begins, we see you for short check-ins to keep things " +
          "on track and comfortable.",
      },
      {
        title: 'Protect your new smile',
        body:
          "When you're done, we fit you with a retainer and show you how to keep " +
          "your results for the long haul.",
      },
    ],
    faq: [
      {
        question: 'Am I too old for orthodontics?',
        answer:
          "It's never too late. Plenty of our orthodontic patients are adults — and " +
          "modern options make treatment more discreet than ever.",
      },
      {
        question: 'How long does treatment take?',
        answer:
          "It varies with your case — anywhere from a few months to a couple of " +
          "years. We'll give you a realistic timeline before you start.",
      },
      {
        question: 'Braces or clear aligners — which is better?',
        answer:
          "Both work beautifully; the right choice depends on your bite and your " +
          "lifestyle. We'll help you weigh them honestly.",
      },
      {
        question: 'Does orthodontic treatment hurt?',
        answer:
          "You may feel mild pressure after an adjustment, but it's temporary and " +
          "manageable. Most people adjust quickly.",
      },
      {
        question: 'How much does orthodontic treatment cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['clear-aligners', 'dental-exams', 'teeth-whitening'],
  },
  {
    slug: 'clear-aligners',
    name: 'Invisalign & Clear Aligners',
    category: 'core',
    icon: '😬',
    shortDescription:
      'Straighten your teeth discreetly with clear, removable aligners.',
    heroBullets: [
      'Nearly invisible while you wear them',
      'Removable for eating and brushing',
      'No metal brackets or wires',
      'A custom plan mapped to your smile',
    ],
    body:
      "Clear aligners straighten your teeth without anyone needing to notice. " +
      "At {clinic}, we design a custom series of smooth, removable trays that " +
      "gently guide your teeth into place — so you can eat what you like, brush " +
      "normally, and smile with confidence the whole way through.",
    processSteps: [
      {
        title: 'See if aligners fit your case',
        body:
          "We assess your smile and bite and let you know honestly whether clear " +
          "aligners are a great fit for what you want to change.",
      },
      {
        title: 'A digital preview',
        body:
          "Using a digital scan, we map out your tooth movements — many patients " +
          "get to preview their projected result before starting.",
      },
      {
        title: 'Wear and switch your trays',
        body:
          "You wear each set of aligners as directed and switch to the next on " +
          "schedule, with brief check-ins to keep things on track.",
      },
      {
        title: 'Reveal and retain',
        body:
          "When your trays have done their work, we fit you with a retainer to " +
          "keep your new smile right where it belongs.",
      },
    ],
    faq: [
      {
        question: 'How long do I have to wear my aligners each day?',
        answer:
          "For best results, most people wear them 20–22 hours a day — taking them " +
          "out mainly to eat, drink, and brush.",
      },
      {
        question: 'Will people be able to tell I\'m wearing them?',
        answer:
          "Clear aligners are very discreet. Most people won't notice them unless " +
          "you point them out.",
      },
      {
        question: 'Can I eat normally with aligners?',
        answer:
          "Yes — you simply remove them to eat and drink, then brush and pop them " +
          "back in. No food restrictions.",
      },
      {
        question: 'Are aligners as effective as braces?',
        answer:
          "For many cases, absolutely. For more complex bites, braces may be the " +
          "better tool. We'll give you a straight answer about your case.",
      },
      {
        question: 'How much do clear aligners cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['orthodontics', 'teeth-whitening', 'veneers'],
  },
  {
    slug: 'teeth-whitening',
    name: 'Teeth Whitening',
    category: 'core',
    icon: '🦷',
    shortDescription:
      'Brighten your smile safely with professional whitening — in-office or at home.',
    heroBullets: [
      'Noticeably brighter, fast',
      'Professional-strength and safe',
      'In-office or take-home options',
      'Results tailored to your smile',
    ],
    body:
      "Coffee, tea, and time leave their mark on every smile. Professional " +
      "whitening at {clinic} lifts years of stains far more effectively — and " +
      "more safely — than store-bought strips. We'll help you choose between a " +
      "fast in-office treatment and a custom take-home kit, and tailor the " +
      "result so it looks bright but natural.",
    processSteps: [
      {
        title: 'A quick whitening consult',
        body:
          "We check that your teeth and gums are healthy and talk through the " +
          "shade you're hoping to reach.",
      },
      {
        title: 'Choose your approach',
        body:
          "We'll recommend in-office whitening for fast results or a custom " +
          "take-home kit for whitening on your own schedule — your call.",
      },
      {
        title: 'Brighten your smile',
        body:
          "For in-office treatment, we protect your gums and apply a " +
          "professional-strength gel. For take-home, we fit custom trays and show " +
          "you exactly how to use them.",
      },
      {
        title: 'Keep it bright',
        body:
          "We share simple tips to maintain your results and slow down future " +
          "staining so your smile stays fresh.",
      },
    ],
    faq: [
      {
        question: 'Is professional whitening safe for my teeth?',
        answer:
          "Yes. Done professionally, whitening is safe and well-studied. We protect " +
          "your gums and tailor the strength to keep you comfortable.",
      },
      {
        question: 'How much whiter will my teeth get?',
        answer:
          "Most people see a noticeable, several-shade improvement. Results vary " +
          "with the type of staining, and we'll set honest expectations up front.",
      },
      {
        question: 'Will whitening make my teeth sensitive?',
        answer:
          "Some people feel temporary sensitivity that fades within a day or two. " +
          "We can adjust the treatment to keep it comfortable.",
      },
      {
        question: 'How long do the results last?',
        answer:
          "With good habits, results can last many months to a few years. Occasional " +
          "touch-ups keep your smile at its brightest.",
      },
      {
        question: 'Why not just use whitening strips from the store?',
        answer:
          "Store strips are weaker and fit poorly, so results are uneven and slow. " +
          "Professional whitening is stronger, more even, and supervised for safety.",
      },
      {
        question: 'How much does whitening cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['dental-hygiene', 'veneers', 'clear-aligners'],
  },
  {
    slug: 'veneers',
    name: 'Veneers',
    category: 'core',
    icon: '💎',
    shortDescription:
      'Transform chips, gaps, and stains with custom, natural-looking veneers.',
    heroBullets: [
      'Hide chips, gaps, and deep stains',
      'Custom-shaped to suit your face',
      'Natural-looking, durable results',
      'A smile designed around you',
    ],
    body:
      "Veneers are thin, custom shells that fit over the front of your teeth to " +
      "reshape your smile in one cohesive step. At {clinic}, we design them " +
      "around your face and your goals so the result looks like the best " +
      "version of your own smile — not someone else's.",
    processSteps: [
      {
        title: 'Design your smile together',
        body:
          "We listen to what you'd like to change and plan a look that's natural, " +
          "balanced, and right for your face.",
      },
      {
        title: 'Prepare and preview',
        body:
          "We gently prepare the teeth and take precise impressions so your " +
          "veneers fit perfectly — often with a preview of the final look.",
      },
      {
        title: 'Craft your veneers',
        body:
          "Your custom veneers are made to match the shape and shade we designed, " +
          "with temporaries to wear in the meantime if needed.",
      },
      {
        title: 'Reveal your new smile',
        body:
          "We bond your veneers in place, fine-tune the fit and bite, and send you " +
          "out with a smile you'll want to show off.",
      },
    ],
    faq: [
      {
        question: 'Will veneers look natural?',
        answer:
          "That's the goal. We design veneers around your face and color them to " +
          "look like healthy, natural teeth — subtle, not fake.",
      },
      {
        question: 'How long do veneers last?',
        answer:
          "With good care, veneers can last many years. We'll show you simple habits " +
          "to protect them and keep them looking great.",
      },
      {
        question: 'Is getting veneers painful?',
        answer:
          "Most people find the process comfortable, and we keep you numb and at " +
          "ease for any prep work. Tell us if you're anxious — we'll go gently.",
      },
      {
        question: 'Are veneers right for me?',
        answer:
          "Veneers are great for chips, gaps, and stubborn stains, but they aren't " +
          "the only option. We'll give you an honest take during your consult.",
      },
      {
        question: 'How much do veneers cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['teeth-whitening', 'dental-implants', 'clear-aligners'],
  },
  {
    slug: 'dental-implants',
    name: 'Dental Implants',
    category: 'core',
    icon: '🦴',
    shortDescription:
      'Replace missing teeth with a permanent, natural-feeling solution.',
    heroBullets: [
      'Looks and feels like a natural tooth',
      'Protects your jawbone and neighbors',
      'A long-lasting, stable solution',
      'A clear plan from start to finish',
    ],
    body:
      "A missing tooth is more than a gap — it can shift neighboring teeth and " +
      "weaken the jawbone over time. A dental implant replaces the whole tooth, " +
      "root and all, for a result that looks, feels, and works like the real " +
      "thing. At {clinic}, we guide you through every step with clear, " +
      "unhurried care.",
    processSteps: [
      {
        title: 'Plan your implant',
        body:
          "We assess your jaw and surrounding teeth with precise imaging and map " +
          "out a plan tailored to your mouth.",
      },
      {
        title: 'Place the implant',
        body:
          "We gently place a small titanium post that acts as the new tooth root, " +
          "keeping you comfortable throughout.",
      },
      {
        title: 'Heal and integrate',
        body:
          "Over a few months, the implant fuses naturally with your bone to form a " +
          "rock-solid foundation. We check in along the way.",
      },
      {
        title: 'Add your new tooth',
        body:
          "Once healed, we attach a custom crown that matches your natural teeth — " +
          "so it blends right in.",
      },
    ],
    faq: [
      {
        question: 'Do dental implants hurt?',
        answer:
          "The procedure is done with anesthesia and most people are surprised how " +
          "comfortable it is. Any soreness afterward is usually mild and short-lived.",
      },
      {
        question: 'How long do implants last?',
        answer:
          "With good care, implants can last decades — often a lifetime. They're one " +
          "of the most durable tooth-replacement options available.",
      },
      {
        question: 'Why choose an implant over a bridge or denture?',
        answer:
          "Implants stand on their own without altering neighboring teeth and help " +
          "preserve your jawbone. We'll walk you through every option honestly.",
      },
      {
        question: 'How long does the whole process take?',
        answer:
          "Because the implant needs time to fuse with your bone, the full process " +
          "usually spans a few months. We'll give you a clear timeline up front.",
      },
      {
        question: 'How much do dental implants cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['oral-surgery', 'veneers', 'wisdom-teeth'],
  },

  // ── SPECIAL ───────────────────────────────────────────────────────────
  {
    slug: 'oral-surgery',
    name: 'Oral Surgery',
    category: 'special',
    icon: '🪥',
    shortDescription:
      'Expert surgical care delivered gently, with comfort options every step.',
    heroBullets: [
      'Experienced, gentle surgical care',
      'Sedation and comfort options',
      'Clear pre- and post-op guidance',
      'A calm, reassuring environment',
    ],
    body:
      "The word “surgery” sounds daunting, but most oral procedures are " +
      "routine, well-practiced, and far more comfortable than people expect. At " +
      "{clinic}, we explain everything in plain language, offer sedation when it " +
      "helps, and stay focused on keeping you calm and pain-free from start to finish.",
    processSteps: [
      {
        title: 'Consultation and planning',
        body:
          "We review your imaging, talk through the procedure, and answer every " +
          "question so you know exactly what to expect.",
      },
      {
        title: 'Choose your comfort level',
        body:
          "From local anesthesia to sedation, we help you pick the comfort option " +
          "that's right for you and your anxiety.",
      },
      {
        title: 'A precise, gentle procedure',
        body:
          "Our team performs your procedure efficiently and carefully, checking in " +
          "with you throughout.",
      },
      {
        title: 'Recovery, supported',
        body:
          "We send you home with clear aftercare instructions and stay available " +
          "for any questions as you heal.",
      },
    ],
    faq: [
      {
        question: 'Will I be awake during oral surgery?',
        answer:
          "That's up to you. Many procedures are done with local anesthesia, but " +
          "sedation options are available if you'd rather be more relaxed or asleep.",
      },
      {
        question: 'How long is recovery?',
        answer:
          "Most people recover from routine procedures within a few days. We'll give " +
          "you specific aftercare guidance for your situation.",
      },
      {
        question: 'Is oral surgery painful?',
        answer:
          "You'll be numb during the procedure, and we'll help you manage any " +
          "soreness afterward. Most people find it far easier than they feared.",
      },
      {
        question: "I'm very anxious about surgery. Can you help?",
        answer:
          "Yes. Tell us how you're feeling — we'll explain each step, offer sedation, " +
          "and go at a pace that keeps you comfortable.",
      },
      {
        question: 'How much does oral surgery cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['wisdom-teeth', 'dental-implants', 'iv-sedation'],
  },
  {
    slug: 'endodontics',
    name: 'Endodontics / Root Canal',
    category: 'special',
    icon: '🩺',
    shortDescription:
      'Save a damaged tooth and end the pain — root canals made comfortable.',
    heroBullets: [
      'Stops tooth pain at the source',
      'Saves your natural tooth',
      'More comfortable than its reputation',
      'Gentle, modern technique',
    ],
    body:
      "Root canals have an unfair reputation — done with modern technique, the " +
      "procedure is the thing that ends your pain, not the thing that causes it. " +
      "At {clinic}, a root canal clears infection from inside the tooth and saves " +
      "it from extraction, all while keeping you numb and comfortable throughout.",
    processSteps: [
      {
        title: 'Diagnose the problem',
        body:
          "We examine the tooth and take an image to confirm the source of your " +
          "pain and explain what we find.",
      },
      {
        title: 'Numb and comfortable',
        body:
          "We thoroughly numb the area so you stay comfortable — most people feel " +
          "relief, not pain, during the procedure.",
      },
      {
        title: 'Clean and seal',
        body:
          "We gently remove the infected tissue from inside the tooth, clean the " +
          "space, and seal it to prevent reinfection.",
      },
      {
        title: 'Restore the tooth',
        body:
          "We finish with a filling or crown so your tooth is strong, protected, " +
          "and ready for everyday use.",
      },
    ],
    faq: [
      {
        question: 'Does a root canal hurt?',
        answer:
          "This surprises people: a root canal relieves pain. You'll be fully numb, " +
          "and most patients say it feels much like getting a routine filling.",
      },
      {
        question: 'Why not just pull the tooth?',
        answer:
          "Keeping your natural tooth is almost always better for your bite and " +
          "jaw. A root canal lets you save it instead of replacing it.",
      },
      {
        question: 'How long does a root canal take?',
        answer:
          "Many root canals are completed in one or two visits, depending on the " +
          "tooth. We'll let you know what to expect for your case.",
      },
      {
        question: 'What does recovery feel like?',
        answer:
          "Mild tenderness for a day or two is normal and usually eases with " +
          "over-the-counter pain relief. Most people return to normal quickly.",
      },
      {
        question: 'How much does a root canal cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['dental-emergency', 'cavity-treatment', 'oral-surgery'],
  },
  {
    slug: 'perio-treatment',
    name: 'Perio Gum Treatment',
    category: 'special',
    icon: '🌿',
    shortDescription:
      'Treat and reverse gum disease to protect your smile for the long haul.',
    heroBullets: [
      'Stops and reverses gum disease',
      'Protects the bone around your teeth',
      'Fresher breath and healthier gums',
      'Gentle, non-surgical options first',
    ],
    body:
      "Gum disease is quiet but serious — it's the leading cause of tooth loss " +
      "in adults, and it's strongly linked to overall health. The good news: " +
      "caught early, it's very treatable. At {clinic}, we focus on gentle, " +
      "conservative care that gets your gums healthy and keeps them that way.",
    processSteps: [
      {
        title: 'Measure your gum health',
        body:
          "We carefully assess your gums and the bone around your teeth to " +
          "understand exactly what's going on.",
      },
      {
        title: 'A deep, gentle cleaning',
        body:
          "We clean below the gumline to remove the bacteria and tartar that " +
          "drive gum disease — comfortably and thoroughly.",
      },
      {
        title: 'Help your gums heal',
        body:
          "We may recommend targeted treatments and a tailored home routine to " +
          "help your gums recover and reattach.",
      },
      {
        title: 'Keep gums healthy',
        body:
          "We set you up with a maintenance schedule so the improvement lasts and " +
          "the disease doesn't return.",
      },
    ],
    faq: [
      {
        question: 'How do I know if I have gum disease?',
        answer:
          "Bleeding, swollen, or receding gums and persistent bad breath are common " +
          "signs. Many people have no symptoms early on, which is why exams matter.",
      },
      {
        question: 'Can gum disease be reversed?',
        answer:
          "Early gum disease is often reversible with treatment and good home care. " +
          "More advanced cases can be managed to protect your teeth.",
      },
      {
        question: 'Is gum treatment painful?',
        answer:
          "We keep you comfortable throughout, numbing the area for deeper " +
          "cleanings. Most people find it very manageable.",
      },
      {
        question: 'Why does gum health matter for the rest of my body?',
        answer:
          "Gum disease is linked to conditions like heart disease and diabetes. " +
          "Healthy gums are part of a healthy you.",
      },
      {
        question: 'How much does gum treatment cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['dental-hygiene', 'dental-exams', 'dental-implants'],
  },
  {
    slug: 'sleep-apnea',
    name: 'Sleep Apnea Therapy',
    category: 'special',
    icon: '😴',
    shortDescription:
      'Sleep better and breathe easier with a comfortable dental appliance.',
    heroBullets: [
      'A comfortable alternative to CPAP',
      'Quieter nights, better rest',
      'Custom-fit oral appliance',
      'Coordinated with your physician',
    ],
    body:
      "If you snore loudly or wake up tired no matter how long you slept, your " +
      "breathing during sleep may be the culprit. For many people with mild to " +
      "moderate sleep apnea, a custom oral appliance is a comfortable, " +
      "CPAP-free way to keep the airway open. At {clinic}, we'll work alongside " +
      "your physician to help you rest.",
    processSteps: [
      {
        title: 'Talk through your sleep',
        body:
          "We listen to your symptoms — snoring, fatigue, restless nights — and " +
          "discuss whether an oral appliance could help.",
      },
      {
        title: 'Coordinate your diagnosis',
        body:
          "Sleep apnea is diagnosed by a physician. We'll help coordinate testing " +
          "so therapy is based on a proper diagnosis.",
      },
      {
        title: 'A custom-fit appliance',
        body:
          "We take precise impressions and fit a comfortable appliance that gently " +
          "holds your airway open while you sleep.",
      },
      {
        title: 'Fine-tune and follow up',
        body:
          "We adjust the fit for comfort and effectiveness and check in to make " +
          "sure you're sleeping — and feeling — better.",
      },
    ],
    faq: [
      {
        question: 'How is an oral appliance different from CPAP?',
        answer:
          "An oral appliance is a small, custom mouthpiece — no mask, hose, or " +
          "machine. Many people find it easier to tolerate for mild to moderate apnea.",
      },
      {
        question: 'Do I need a sleep study first?',
        answer:
          "Sleep apnea must be diagnosed by a physician, often via a sleep study. " +
          "We'll help coordinate that step before fitting an appliance.",
      },
      {
        question: 'Is the appliance comfortable to wear?',
        answer:
          "It's custom-made for your mouth, so most people adjust quickly. We " +
          "fine-tune the fit until it feels right.",
      },
      {
        question: 'Will it stop my snoring?',
        answer:
          "Many people see a real reduction in snoring, since the appliance helps " +
          "keep the airway open. Results vary, and we'll set honest expectations.",
      },
      {
        question: 'How much does sleep apnea therapy cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['dental-exams', 'therapeutic-injectables', 'family-dental-care'],
  },
  {
    slug: 'therapeutic-injectables',
    name: 'Therapeutic Injectables',
    category: 'special',
    icon: '💉',
    shortDescription:
      'Relief for jaw tension, clenching, and TMJ discomfort from your dental team.',
    heroBullets: [
      'Eases jaw clenching and tension',
      'Relief for TMJ discomfort',
      'Administered by trained clinicians',
      'A personalized, conservative approach',
    ],
    body:
      "Therapeutic injectables aren't just cosmetic — used carefully, they can " +
      "relax overworked jaw muscles and ease the headaches and soreness that " +
      "come with clenching and grinding. At {clinic}, our trained clinicians " +
      "use them as one conservative tool for managing TMJ and facial tension, " +
      "always as part of a thoughtful plan.",
    processSteps: [
      {
        title: 'Understand your symptoms',
        body:
          "We talk through your jaw pain, headaches, or clenching and examine the " +
          "muscles involved to see if injectables could help.",
      },
      {
        title: 'Build a tailored plan',
        body:
          "If it's a good fit, we map out a conservative approach — sometimes " +
          "alongside a night guard or other therapy.",
      },
      {
        title: 'A quick, precise treatment',
        body:
          "The treatment itself is brief. We administer it precisely to target the " +
          "muscles driving your discomfort.",
      },
      {
        title: 'Review and adjust',
        body:
          "We follow up to see how you're feeling and adjust the plan to keep you " +
          "comfortable over time.",
      },
    ],
    faq: [
      {
        question: 'How can injectables help with jaw pain?',
        answer:
          "By relaxing overactive jaw muscles, injectables can reduce the clenching " +
          "and grinding that cause soreness, headaches, and TMJ discomfort.",
      },
      {
        question: 'Is the treatment painful?',
        answer:
          "Most people describe only a quick pinch. The treatment is fast and " +
          "well-tolerated.",
      },
      {
        question: 'How long do the effects last?',
        answer:
          "Effects typically last a few months. We'll recommend a schedule that " +
          "keeps you comfortable.",
      },
      {
        question: 'Is this a cosmetic treatment?',
        answer:
          "Here, the focus is therapeutic — easing jaw tension and TMJ symptoms. " +
          "We'll always explain the goal and your options clearly.",
      },
      {
        question: 'How much do therapeutic injectables cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['sleep-apnea', 'dental-exams', 'oral-surgery'],
  },
  {
    slug: 'cavity-treatment',
    name: 'Cavity Treatment',
    category: 'special',
    icon: '🦷',
    shortDescription:
      'Gentle, tooth-colored fillings that stop decay and restore your tooth.',
    heroBullets: [
      'Stops decay before it spreads',
      'Natural, tooth-colored fillings',
      'Quick and comfortable',
      'Protects your tooth long-term',
    ],
    body:
      "Cavities are one of the most common — and most fixable — dental problems. " +
      "Treated early, a filling is quick, comfortable, and nearly invisible. At " +
      "{clinic}, we use tooth-colored materials that blend right in and keep " +
      "you at ease the whole time, so a cavity never has to be a big deal.",
    processSteps: [
      {
        title: 'Find and confirm the cavity',
        body:
          "We identify decay during your exam, sometimes with an image, and show " +
          "you exactly what we're seeing.",
      },
      {
        title: 'Numb the area',
        body:
          "We gently numb the tooth so you stay completely comfortable throughout " +
          "the treatment.",
      },
      {
        title: 'Clean and fill',
        body:
          "We remove the decay and fill the space with a natural-looking, " +
          "tooth-colored material that restores the tooth.",
      },
      {
        title: 'Check your bite',
        body:
          "We make sure the filling feels right when you bite down and polish it " +
          "smooth before you go.",
      },
    ],
    faq: [
      {
        question: 'Does getting a filling hurt?',
        answer:
          "We numb the tooth first, so the procedure itself is comfortable. Most " +
          "people are surprised how easy it is.",
      },
      {
        question: 'Will the filling be noticeable?',
        answer:
          "We use tooth-colored fillings that match your natural enamel, so they " +
          "blend in and are hard to spot.",
      },
      {
        question: 'What happens if I leave a cavity untreated?',
        answer:
          "Decay only spreads, and a small cavity can grow into a bigger problem " +
          "needing a root canal or crown. Treating it early keeps things simple.",
      },
      {
        question: 'How can I prevent cavities?',
        answer:
          "Consistent brushing and flossing, regular cleanings, and limiting sugary " +
          "snacks go a long way. We'll share tips tailored to you.",
      },
      {
        question: 'How much does a filling cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['dental-exams', 'endodontics', 'dental-hygiene'],
  },
  {
    slug: 'wisdom-teeth',
    name: 'Wisdom Tooth Extractions',
    category: 'special',
    icon: '🦷',
    shortDescription:
      'Comfortable removal of problem wisdom teeth, with sedation options.',
    heroBullets: [
      'Relief from crowding and pain',
      'Sedation and comfort options',
      'Experienced, gentle removal',
      'Clear recovery guidance',
    ],
    body:
      "Wisdom teeth often arrive without enough room, leading to crowding, pain, " +
      "or infection. Removing them is one of the most common procedures in " +
      "dentistry. At {clinic}, we make it as smooth as possible — with comfort " +
      "options during the procedure and clear, supportive guidance for an easy " +
      "recovery.",
    processSteps: [
      {
        title: 'Evaluate your wisdom teeth',
        body:
          "We take an image to see how your wisdom teeth are positioned and explain " +
          "whether removal is the right call.",
      },
      {
        title: 'Plan for comfort',
        body:
          "We discuss anesthesia and sedation options so your procedure is as " +
          "relaxed and pain-free as possible.",
      },
      {
        title: 'Gentle removal',
        body:
          "Our team removes the teeth efficiently and carefully, keeping you " +
          "comfortable from start to finish.",
      },
      {
        title: 'Recover with support',
        body:
          "We send you home with clear aftercare instructions and stay available " +
          "for any questions while you heal.",
      },
    ],
    faq: [
      {
        question: 'Do I really need my wisdom teeth removed?',
        answer:
          "Not always — it depends on whether they have room and are causing " +
          "problems. We'll give you an honest recommendation based on your X-rays.",
      },
      {
        question: 'Will I be asleep for the procedure?',
        answer:
          "You can choose. Many extractions are done with local anesthesia, but " +
          "sedation is available if you'd prefer to be more relaxed or asleep.",
      },
      {
        question: 'How long is recovery?',
        answer:
          "Most people feel much better within a few days. We'll give you specific " +
          "aftercare tips to make recovery smooth.",
      },
      {
        question: 'Is wisdom tooth removal painful?',
        answer:
          "You'll be numb during the procedure, and we'll help you manage any " +
          "soreness afterward. It's usually easier than people expect.",
      },
      {
        question: 'How much does wisdom tooth removal cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['oral-surgery', 'iv-sedation', 'dental-emergency'],
  },
  {
    slug: 'iv-sedation',
    name: 'Dental IV Sedation',
    category: 'special',
    icon: '🛌',
    shortDescription:
      'Deep relaxation for anxious patients and longer procedures.',
    heroBullets: [
      'Deep, comfortable relaxation',
      'Ideal for dental anxiety',
      'Great for longer procedures',
      'Monitored by trained clinicians',
    ],
    body:
      "For patients with significant dental anxiety — or for longer procedures " +
      "you'd rather not remember — IV sedation offers a deeply relaxed, " +
      "comfortable experience. At {clinic}, sedation is administered and " +
      "monitored by trained clinicians, so you can get the care you need while " +
      "feeling calm and safe throughout.",
    processSteps: [
      {
        title: 'Review your health and goals',
        body:
          "We go over your medical history and what you're hoping for so we can " +
          "plan sedation safely around you.",
      },
      {
        title: 'Prepare for your visit',
        body:
          "We give you simple pre-appointment instructions and arrange for someone " +
          "to drive you home afterward.",
      },
      {
        title: 'Relax during treatment',
        body:
          "Sedation is administered and carefully monitored while we complete your " +
          "treatment — many patients barely remember it.",
      },
      {
        title: 'Recover comfortably',
        body:
          "We make sure you're stable and comfortable before you leave, with clear " +
          "guidance for the rest of the day.",
      },
    ],
    faq: [
      {
        question: 'Will I be unconscious with IV sedation?',
        answer:
          "You'll be deeply relaxed and may drift in and out, but it's not the same " +
          "as general anesthesia. Many people simply don't remember the procedure.",
      },
      {
        question: 'Is IV sedation safe?',
        answer:
          "Administered and monitored by trained clinicians, sedation is very safe. " +
          "We review your health history carefully and watch you closely throughout.",
      },
      {
        question: 'Who is a good candidate for IV sedation?',
        answer:
          "It's ideal for people with strong dental anxiety, a sensitive gag reflex, " +
          "or longer procedures. We'll help you decide if it's right for you.",
      },
      {
        question: 'Will I need someone to drive me home?',
        answer:
          "Yes — because the effects linger for a while, you'll need a trusted " +
          "person to drive you home and stay with you afterward.",
      },
      {
        question: 'How much does IV sedation cost?',
        answer: COST_ANSWER,
      },
    ],
    relatedSlugs: ['oral-surgery', 'wisdom-teeth', 'dental-implants'],
  },
]
