import 'server-only'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { slugify } from '@/lib/utils'
import type {
  JobRole,
  EmploymentType,
  JobStatus,
  ApplicationStatus,
  JobPostingRow,
  ApplicationRow,
} from '@/lib/types/careers'

/**
 * Careers — job postings on the clinic's own branded site (the trunk) +
 * a lightweight built-in ATS. Each open role renders at
 * {slug}.../careers/[jobSlug] with JobPosting JSON-LD so Google for Jobs
 * and Indeed index it for free (no partner API needed). Applications land
 * in a triage pipeline that mirrors the Leads queue.
 *
 * Client-safe types + labels + JSON-LD live in lib/types/careers.ts.
 * Scope: permanent + part-time hires for a single practice. NOT a temp/gig
 * marketplace (Cloud Dentistry's lane) — that's a different beast.
 */

export type {
  JobRole,
  EmploymentType,
  JobStatus,
  ApplicationStatus,
  JobPostingRow,
  ApplicationRow,
} from '@/lib/types/careers'
export {
  ROLE_LABELS,
  EMPLOYMENT_LABELS,
  APPLICATION_PIPELINE,
  formatComp,
  jobPostingJsonLd,
} from '@/lib/types/careers'

export function newJobId(): string {
  return `job_${randomBytes(10).toString('hex')}`
}
export function newApplicationId(): string {
  return `app_${randomBytes(10).toString('hex')}`
}

// ── Job postings (admin) ────────────────────────────────────────────────

async function applicantCounts(jobIds: string[]): Promise<Map<string, { total: number; fresh: number }>> {
  const out = new Map<string, { total: number; fresh: number }>()
  if (jobIds.length === 0) return out
  const rows = await db
    .select({ jobId: schema.jobApplication.jobPostingId, status: schema.jobApplication.status, c: count() })
    .from(schema.jobApplication)
    .where(inArray(schema.jobApplication.jobPostingId, jobIds))
    .groupBy(schema.jobApplication.jobPostingId, schema.jobApplication.status)
  for (const r of rows) {
    const cur = out.get(r.jobId) ?? { total: 0, fresh: 0 }
    const n = Number(r.c)
    cur.total += n
    if (r.status === 'new') cur.fresh += n
    out.set(r.jobId, cur)
  }
  return out
}

function toJobRow(j: typeof schema.jobPosting.$inferSelect, counts: { total: number; fresh: number }): JobPostingRow {
  return {
    id: j.id,
    title: j.title,
    slug: j.slug,
    role: j.role as JobRole,
    employmentType: j.employmentType as EmploymentType,
    description: j.description,
    responsibilities: j.responsibilities,
    requirements: j.requirements,
    benefits: j.benefits,
    compMinCents: j.compMinCents,
    compMaxCents: j.compMaxCents,
    compPeriod: j.compPeriod as 'hour' | 'year',
    showComp: j.showComp === 1,
    status: j.status as JobStatus,
    applyMethod: j.applyMethod as 'in_app' | 'external',
    externalApplyUrl: j.externalApplyUrl,
    validThrough: j.validThrough,
    postedAt: j.postedAt,
    createdAt: j.createdAt,
    applicantCount: counts.total,
    newApplicantCount: counts.fresh,
  }
}

export async function listJobs(organizationId: string): Promise<JobPostingRow[]> {
  const jobs = await db
    .select()
    .from(schema.jobPosting)
    .where(eq(schema.jobPosting.organizationId, organizationId))
    .orderBy(desc(schema.jobPosting.createdAt))
  const counts = await applicantCounts(jobs.map((j) => j.id))
  return jobs.map((j) => toJobRow(j, counts.get(j.id) ?? { total: 0, fresh: 0 }))
}

export async function getJob(organizationId: string, id: string): Promise<JobPostingRow | null> {
  const [j] = await db
    .select()
    .from(schema.jobPosting)
    .where(and(eq(schema.jobPosting.organizationId, organizationId), eq(schema.jobPosting.id, id)))
    .limit(1)
  if (!j) return null
  const counts = await applicantCounts([j.id])
  return toJobRow(j, counts.get(j.id) ?? { total: 0, fresh: 0 })
}

async function uniqueJobSlug(organizationId: string, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || 'role'
  const existing = await db
    .select({ slug: schema.jobPosting.slug, id: schema.jobPosting.id })
    .from(schema.jobPosting)
    .where(eq(schema.jobPosting.organizationId, organizationId))
  const taken = new Set(existing.filter((e) => e.id !== excludeId).map((e) => e.slug))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

export interface JobInput {
  title: string
  role: JobRole
  employmentType: EmploymentType
  description: string
  responsibilities?: string | null
  requirements?: string | null
  benefits?: string | null
  compMinCents?: number | null
  compMaxCents?: number | null
  compPeriod?: 'hour' | 'year'
  showComp?: boolean
  status?: JobStatus
  applyMethod?: 'in_app' | 'external'
  externalApplyUrl?: string | null
}

export async function createJob(organizationId: string, input: JobInput): Promise<string> {
  const id = newJobId()
  const slug = await uniqueJobSlug(organizationId, input.title)
  const status = input.status ?? 'draft'
  await db.insert(schema.jobPosting).values({
    id,
    organizationId,
    title: input.title,
    slug,
    role: input.role,
    employmentType: input.employmentType,
    description: input.description,
    responsibilities: input.responsibilities ?? null,
    requirements: input.requirements ?? null,
    benefits: input.benefits ?? null,
    compMinCents: input.compMinCents ?? null,
    compMaxCents: input.compMaxCents ?? null,
    compPeriod: input.compPeriod ?? 'hour',
    showComp: input.showComp === false ? 0 : 1,
    status,
    applyMethod: input.applyMethod ?? 'in_app',
    externalApplyUrl: input.externalApplyUrl ?? null,
    postedAt: status === 'open' ? new Date() : null,
  })
  return id
}

export async function updateJob(organizationId: string, id: string, input: JobInput): Promise<void> {
  const slug = await uniqueJobSlug(organizationId, input.title, id)
  await db
    .update(schema.jobPosting)
    .set({
      title: input.title,
      slug,
      role: input.role,
      employmentType: input.employmentType,
      description: input.description,
      responsibilities: input.responsibilities ?? null,
      requirements: input.requirements ?? null,
      benefits: input.benefits ?? null,
      compMinCents: input.compMinCents ?? null,
      compMaxCents: input.compMaxCents ?? null,
      compPeriod: input.compPeriod ?? 'hour',
      showComp: input.showComp === false ? 0 : 1,
      applyMethod: input.applyMethod ?? 'in_app',
      externalApplyUrl: input.externalApplyUrl ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.jobPosting.organizationId, organizationId), eq(schema.jobPosting.id, id)))
}

export async function setJobStatus(organizationId: string, id: string, status: JobStatus): Promise<void> {
  await db
    .update(schema.jobPosting)
    .set({
      status,
      postedAt: status === 'open' ? new Date() : undefined,
      closedAt: status === 'closed' || status === 'filled' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.jobPosting.organizationId, organizationId), eq(schema.jobPosting.id, id)))
}

export async function deleteJob(organizationId: string, id: string): Promise<void> {
  await db
    .delete(schema.jobPosting)
    .where(and(eq(schema.jobPosting.organizationId, organizationId), eq(schema.jobPosting.id, id)))
}

export interface CareersStats {
  openRoles: number
  totalApplicants: number
  newApplicants: number
}

export async function getCareersStats(organizationId: string): Promise<CareersStats> {
  const [openRow] = await db
    .select({ c: count() })
    .from(schema.jobPosting)
    .where(and(eq(schema.jobPosting.organizationId, organizationId), eq(schema.jobPosting.status, 'open')))
  const appRows = await db
    .select({ status: schema.jobApplication.status, c: count() })
    .from(schema.jobApplication)
    .where(eq(schema.jobApplication.organizationId, organizationId))
    .groupBy(schema.jobApplication.status)
  let total = 0
  let fresh = 0
  for (const r of appRows) {
    const n = Number(r.c)
    total += n
    if (r.status === 'new') fresh += n
  }
  return { openRoles: Number(openRow?.c ?? 0), totalApplicants: total, newApplicants: fresh }
}

// ── Public (clinic site) ──────────────────────────────────────────────────

export async function getOpenJobs(organizationId: string): Promise<JobPostingRow[]> {
  const jobs = await db
    .select()
    .from(schema.jobPosting)
    .where(and(eq(schema.jobPosting.organizationId, organizationId), eq(schema.jobPosting.status, 'open')))
    .orderBy(desc(schema.jobPosting.postedAt))
  return jobs.map((j) => toJobRow(j, { total: 0, fresh: 0 }))
}

export async function getOpenJobBySlug(organizationId: string, slug: string): Promise<JobPostingRow | null> {
  const [j] = await db
    .select()
    .from(schema.jobPosting)
    .where(
      and(
        eq(schema.jobPosting.organizationId, organizationId),
        eq(schema.jobPosting.slug, slug),
        eq(schema.jobPosting.status, 'open'),
      ),
    )
    .limit(1)
  return j ? toJobRow(j, { total: 0, fresh: 0 }) : null
}

// ── Applications (ATS) ──────────────────────────────────────────────────

export interface CreateApplicationInput {
  organizationId: string
  jobPostingId: string
  name: string
  email: string
  phone?: string | null
  resumeUrl?: string | null
  linkedinUrl?: string | null
  coverNote?: string | null
  source?: string
}

export async function createApplication(input: CreateApplicationInput): Promise<string> {
  const id = newApplicationId()
  await db.insert(schema.jobApplication).values({
    id,
    organizationId: input.organizationId,
    jobPostingId: input.jobPostingId,
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    resumeUrl: input.resumeUrl ?? null,
    linkedinUrl: input.linkedinUrl ?? null,
    coverNote: input.coverNote ?? null,
    source: input.source ?? 'career_site',
  })
  return id
}

export async function listApplications(
  organizationId: string,
  filters: { status?: ApplicationStatus | 'all'; jobId?: string } = {},
): Promise<ApplicationRow[]> {
  const where = [eq(schema.jobApplication.organizationId, organizationId)]
  if (filters.status && filters.status !== 'all') where.push(eq(schema.jobApplication.status, filters.status))
  if (filters.jobId) where.push(eq(schema.jobApplication.jobPostingId, filters.jobId))
  const rows = await db
    .select({
      id: schema.jobApplication.id,
      jobPostingId: schema.jobApplication.jobPostingId,
      jobTitle: schema.jobPosting.title,
      name: schema.jobApplication.name,
      email: schema.jobApplication.email,
      phone: schema.jobApplication.phone,
      resumeUrl: schema.jobApplication.resumeUrl,
      linkedinUrl: schema.jobApplication.linkedinUrl,
      coverNote: schema.jobApplication.coverNote,
      status: schema.jobApplication.status,
      source: schema.jobApplication.source,
      rating: schema.jobApplication.rating,
      notes: schema.jobApplication.notes,
      createdAt: schema.jobApplication.createdAt,
    })
    .from(schema.jobApplication)
    .innerJoin(schema.jobPosting, eq(schema.jobApplication.jobPostingId, schema.jobPosting.id))
    .where(and(...where))
    .orderBy(desc(schema.jobApplication.createdAt))
  const now = Date.now()
  return rows.map((r) => ({
    id: r.id,
    jobPostingId: r.jobPostingId,
    jobTitle: r.jobTitle,
    name: r.name,
    email: r.email,
    phone: r.phone,
    resumeUrl: r.resumeUrl,
    linkedinUrl: r.linkedinUrl,
    coverNote: r.coverNote,
    status: r.status as ApplicationStatus,
    source: r.source,
    rating: r.rating,
    notes: r.notes,
    createdAt: r.createdAt,
    ageHours: Math.round((now - r.createdAt.getTime()) / (60 * 60 * 1000)),
  }))
}

export async function getApplicationCounts(
  organizationId: string,
): Promise<Record<ApplicationStatus | 'all', number>> {
  const rows = await db
    .select({ status: schema.jobApplication.status, c: count() })
    .from(schema.jobApplication)
    .where(eq(schema.jobApplication.organizationId, organizationId))
    .groupBy(schema.jobApplication.status)
  const out = { new: 0, reviewing: 0, interview: 0, offer: 0, hired: 0, rejected: 0, archived: 0, all: 0 } as Record<
    ApplicationStatus | 'all',
    number
  >
  for (const r of rows) {
    const n = Number(r.c)
    out.all += n
    out[r.status as ApplicationStatus] = n
  }
  return out
}

export async function setApplicationStatus(
  organizationId: string,
  id: string,
  status: ApplicationStatus,
): Promise<void> {
  const now = new Date()
  const decided = status === 'hired' || status === 'rejected'
  await db
    .update(schema.jobApplication)
    .set({
      status,
      reviewedAt: status === 'new' ? null : now,
      decidedAt: decided ? now : null,
      updatedAt: now,
    })
    .where(and(eq(schema.jobApplication.organizationId, organizationId), eq(schema.jobApplication.id, id)))
}

export async function updateApplicationNotes(
  organizationId: string,
  id: string,
  fields: { notes?: string | null; rating?: number | null },
): Promise<void> {
  await db
    .update(schema.jobApplication)
    .set({ notes: fields.notes, rating: fields.rating, updatedAt: new Date() })
    .where(and(eq(schema.jobApplication.organizationId, organizationId), eq(schema.jobApplication.id, id)))
}
