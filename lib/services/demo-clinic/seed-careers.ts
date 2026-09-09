import 'server-only'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'

// Job posts and applicants, spread so every status chip renders.

// ── Careers seeding (shared by new-clinic-seed + self-heal) ─────────────────
// Pure inserts (no selects) so the new-seed path doesn't shift the seeder
// test's select queue. Two open roles + one draft + applications across the
// whole pipeline (new/reviewing/interview/offer/hired/rejected) with aging
// spread so the rot borders + every status chip render on the demo.
export async function seedDemoCareers(orgId: string, locationId: string | null, now: Date) {
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
