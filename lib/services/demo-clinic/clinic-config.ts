import 'server-only'
import { DEFAULT_VISIT_TYPES, OTHER_VISIT_TYPE_ID, type VisitType } from '@/lib/types/visit-types'

// Practice configuration: insurance carriers, payment methods, financing,
// cancellation policy, portal toggles, email automations, intake, visit types,
// and the site copy overrides.

// Universal PPO carrier list shown in the public site's Insurance section
// + populated into the verifier-form carrier dropdown. Covers the major
// US dental PPO + dental-rider medical payers most family practices
// accept. Clinics replace this with their actual accepted list via
// /settings/clinic; the self-heal block ONLY backfills when null or
// shorter than the current default (legacy demos predating list growth
// get topped up; clinic-edited lists stay untouched).
export const DEMO_INSURANCE_CARRIERS: string[] = [
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

// Dream Dental demo payment-method list — matches DEFAULT_PAYMENT_METHODS in shape
// but is duplicated here so the seeded demo doesn't drift if the universal
// fallback ever moves. Same 5 entries every US dental practice can claim.
export const DEMO_PAYMENT_METHODS: string[] = [
  'Cash',
  'Credit & debit cards',
  'HSA / FSA cards',
  'Apple Pay & Google Pay',
  'Bank transfer',
]

// Two demo financing partners — the two most common in US dental
// (CareCredit + Sunbit). applyUrl points at each company's homepage (NOT
// a hotlink-protected affiliate URL we don't control) so the demo render
// stays stable.
export const DEMO_FINANCING_PARTNERS = [
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
export const DEMO_CANCELLATION_POLICY =
  "We ask for 24 hours notice when you need to cancel or reschedule. Life happens, so we'll always try to work with you — just call or message us as soon as you know. If you no-show without letting us know, we may ask for a small deposit to hold your next visit. We promise to be reasonable about it."

// Patient-portal settings for the demo — exercises the clinic-customizable
// copy paths (welcome message / announcement / aftercare note) so "View as
// patient" and the settings Preview both showcase the full surface. Feature
// flags stay at the defaults (payments off — the demo has no live Stripe
// Connect account).
export const DEMO_PORTAL_SETTINGS = {
  copy: {
    welcomeHeadline: null,
    welcomeMessage: "We're glad you're here. However long it's been — no judgment, ever.",
    announcement: 'New: book, reschedule, and pay right from this portal.',
    aftercareNote:
      'A little sensitivity after a cleaning or filling is normal for a day or two.\nStick to soft foods tonight, rinse gently with warm salt water, and skip anything too hot or icy.\nIf anything feels genuinely wrong, call us — that is what we are here for.',
  },
  // Showcase the after-hours auto-reply (uses the warm built-in default).
  autoReply: {
    enabled: true,
    message: null,
  },
} as const

// A couple of clinic-customized automated emails (Settings → Automations →
// Emails) so the hub showcases the "Customized" state next to the defaults.
// Only the overridden slots are stored — the rest fall back to the built-in
// copy; resolveEmailAutomations merges these over the registry defaults on read.
export const DEMO_EMAIL_AUTOMATIONS = {
  booking_confirmation: {
    subject: "You're all set at {{clinicName}} 🦷",
    body: "Hi {{firstName}}, we're looking forward to seeing you for your {{appointmentType}} visit. Here are the details:",
  },
  review_request: {
    body: 'Thanks so much for coming in! If you have a spare minute, we would be grateful if you shared how your visit went — it genuinely helps other families find us.',
  },
} as const

// Insurance-card photo pair + a concern photo for the demo's intake submission,
// so the file-upload + insurance-card render paths showcase on the submission
// viewer / patient timeline. Public Unsplash URLs (resolvable, non-PHI).
export const DEMO_INTAKE_FILE_DATA = {
  insurance_card: [
    { url: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=900&q=80', name: 'front.jpg', contentType: 'image/jpeg', side: 'front' as const },
    { url: 'https://images.unsplash.com/photo-1556742400-b5b7c5121f90?w=900&q=80', name: 'back.jpg', contentType: 'image/jpeg', side: 'back' as const },
  ],
  concern_photo: [
    { url: 'https://images.unsplash.com/photo-1606265752439-1f18756aa8ed?w=900&q=80', name: 'tooth.jpg', contentType: 'image/jpeg' },
  ],
} as const

// A pre-generated AI pre-visit summary for the showcase submission (no AI call
// in the demo). Mirrors what summarizeSubmission would produce.
export const DEMO_INTAKE_SUMMARY = {
  summary: 'Returning adult patient here for a cleaning with a sensitive upper molar to evaluate; a little dental anxiety.',
  alerts: ['Mild dental anxiety — likes a heads-up before each step', 'Reports sensitivity on an upper right molar'],
} as const

// Hand-written Spanish translation of the default intake template (keyed to its
// field/section ids) so the demo showcases the language toggle without an AI
// call. Missing keys fall back to English via localizeSchema.
export const DEMO_FORM_ES: Record<string, string> = {
  's:patient_info': 'Sobre usted', 'sd:patient_info': 'Lo básico — lo usamos para iniciar su expediente.',
  'f:first_name': 'Nombre', 'f:last_name': 'Apellido', 'f:date_of_birth': 'Fecha de nacimiento',
  'f:email': 'Correo electrónico', 'f:phone': 'Teléfono', 'f:address_line1': 'Dirección',
  'f:city': 'Ciudad', 'f:state': 'Estado', 'f:postal_code': 'Código postal',
  's:insurance': 'Seguro', 'sd:insurance': 'Omítalo si paga de su bolsillo — lo resolvemos en la cita.',
  'f:insurance_card': 'Tome una foto de su tarjeta de seguro',
  'h:insurance_card': 'Frente y reverso — extraemos los datos para que no tenga que escribirlos.',
  'f:insurance_provider': 'Compañía de seguro', 'f:insurance_policy_number': 'Número de póliza / miembro',
  'f:insurance_group_number': 'Número de grupo',
  's:medical': 'Historial médico', 'sd:medical': 'Cualquier cosa que debamos saber antes de tratarlo.',
  'f:conditions': '¿Tiene actualmente alguna de las siguientes?',
  'o:conditions:0': 'Diabetes', 'o:conditions:1': 'Presión alta', 'o:conditions:2': 'Problema cardíaco',
  'o:conditions:3': 'Embarazo', 'o:conditions:4': 'Ansiedad o pánico', 'o:conditions:5': 'Ninguna de las anteriores',
  'f:has_allergies': '¿Tiene alguna alergia?', 'f:allergies': '¿A qué es alérgico? (medicamentos, látex, etc.)',
  'f:medications': 'Medicamentos que toma con regularidad',
  's:dental': 'Historial dental', 'f:last_visit': '¿Cuándo fue su última visita dental?',
  'f:concerns': '¿Algo específico que le gustaría que revisáramos?',
  'f:concern_photo': '¿Tiene una foto de lo que le molesta?',
  'f:anxiety_level': '¿Cómo se siente generalmente con las visitas al dentista?',
  'o:anxiety_level:0': 'Totalmente cómodo', 'o:anxiety_level:1': 'Un poco nervioso',
  'o:anxiety_level:2': 'Ansioso — vaya despacio conmigo', 'o:anxiety_level:3': 'Me da pavor',
  's:consent': 'Consentimiento', 'sd:consent': 'Reconocimiento estándar para poder atenderlo.',
  'f:privacy_notice': 'Aviso de Prácticas de Privacidad',
  'f:hipaa': 'Reconozco haber recibido el Aviso de Prácticas de Privacidad (HIPAA).',
  'f:signature': 'Firma', 'h:signature': 'Escriba su nombre completo para firmar.',
}

// Clinic-ops demo settings — exercises the new Practice setup controls.
// Three chairs so the demo can take simultaneous bookings; a custom 60-min
// "Implant consult" type on top of the standard catalog so the visit-type
// editor + duration→slot math both showcase a clinic-added entry.
export const DEMO_CHAIR_COUNT = 3
export const DEMO_RECALL_DEFAULT_MONTHS = 6
// Consultation carries a $50 deposit + root canal carries prep instructions so
// the Settings → Visit types editor, the reminder-email prep block, and the
// booking-deposit surfaces all demo a configured example.
export const DEMO_VISIT_TYPES: VisitType[] = [
  ...DEFAULT_VISIT_TYPES.filter((t) => t.id !== OTHER_VISIT_TYPE_ID).map((t) => {
    if (t.id === 'consultation') return { ...t, depositCents: 5000 }
    if (t.id === 'root_canal')
      return { ...t, prepInstructions: 'Eat a normal meal beforehand and take any regular medications as usual. Plan for about 90 minutes with us.' }
    return { ...t }
  }),
  {
    id: 'implant_consult',
    label: 'Implant consult',
    durationMinutes: 60,
    bookablePublic: true,
    bookablePortal: false,
    depositCents: 0,
    prepInstructions: 'Bring any recent X-rays or referral paperwork you have — it helps us give you real answers on day one.',
  },
  ...DEFAULT_VISIT_TYPES.filter((t) => t.id === OTHER_VISIT_TYPE_ID),
]

// A couple of hand-voiced copy overrides — enough for the Pages manager to
// show the real customized-vs-default contrast without rewriting the site.
export const DEMO_COPY_OVERRIDES = {
  'home.contactTitle': 'Come say hi — no pressure, ever',
  'about.cta.heading': 'Ready when you are',
}

// The demo's customized contact form — the stock fields plus one select, so
// the Website → Forms surface shows a real "Customized" pill (the insurance
// check form stays on its defaults for the contrasting state).
export const DEMO_CONTACT_LEAD_FORM = {
  contact: [
    { id: 'name', type: 'text', label: 'Full name', required: true, systemKey: 'name' },
    { id: 'phone', type: 'tel', label: 'Phone', required: true, systemKey: 'phone' },
    { id: 'email', type: 'email', label: 'Email', required: false, systemKey: 'email' },
    { id: 'preferredDate', type: 'date', label: 'Preferred date', required: false, systemKey: 'preferredDate' },
    {
      id: 'message',
      type: 'textarea',
      label: 'Message or reason for visit',
      placeholder: 'e.g. Annual cleaning, tooth pain, new patient…',
      required: false,
      systemKey: 'message',
    },
    {
      id: 'demo_hear_about',
      type: 'select',
      label: 'How did you hear about us?',
      required: false,
      options: ['A friend or family member', 'Google search', 'Insurance directory', 'Drove past the office'],
    },
  ],
}
