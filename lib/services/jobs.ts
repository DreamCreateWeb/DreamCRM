import 'server-only'
import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { slugify } from '@/lib/utils'
import { JOB_TYPES } from '@/lib/types/jobs'

export { JOB_TYPES }

export const JobInput = z.object({
  title: z.string().min(1).max(200),
  companyName: z.string().min(1).max(200),
  description: z.string().max(10_000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  type: z.enum(JOB_TYPES).default('full-time'),
  remote: z.boolean().optional().default(false),
  salaryMinCents: z.number().int().min(0).optional().nullable(),
  salaryMaxCents: z.number().int().min(0).optional().nullable(),
})

export async function listJobs(opts: { search?: string; type?: string; sort?: string } = {}) {
  const filters = [eq(schema.jobs.active, true)]
  if (opts.search) {
    filters.push(
      or(
        ilike(schema.jobs.title, `%${opts.search}%`),
        ilike(schema.companies.name, `%${opts.search}%`)
      )!
    )
  }
  if (opts.type) filters.push(eq(schema.jobs.type, opts.type))

  return db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      slug: schema.jobs.slug,
      description: schema.jobs.description,
      location: schema.jobs.location,
      type: schema.jobs.type,
      remote: schema.jobs.remote,
      salaryMinCents: schema.jobs.salaryMinCents,
      salaryMaxCents: schema.jobs.salaryMaxCents,
      createdAt: schema.jobs.createdAt,
      companyId: schema.companies.id,
      companyName: schema.companies.name,
      companyLogo: schema.companies.logoUrl,
      companySlug: schema.companies.slug,
    })
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
    .where(and(...filters))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(100)
}

export async function getJobBySlug(slug: string) {
  const rows = await db
    .select({
      job: schema.jobs,
      company: schema.companies,
    })
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
    .where(eq(schema.jobs.slug, slug))
    .limit(1)
  return rows[0] ?? null
}

async function ensureCompany(name: string) {
  const slug = slugify(name)
  const existing = await db.select().from(schema.companies).where(eq(schema.companies.slug, slug)).limit(1)
  if (existing[0]) return existing[0]
  const [row] = await db.insert(schema.companies).values({ name, slug }).returning()
  return row
}

export async function createJob(input: z.infer<typeof JobInput>, userId: string) {
  const data = JobInput.parse(input)
  const company = await ensureCompany(data.companyName)
  const slugBase = slugify(`${data.title}-${company.slug}`)
  let slug = slugBase
  let i = 1
  while ((await db.select().from(schema.jobs).where(eq(schema.jobs.slug, slug)).limit(1))[0]) {
    slug = `${slugBase}-${i++}`
  }
  const [row] = await db
    .insert(schema.jobs)
    .values({
      title: data.title,
      slug,
      description: data.description ?? null,
      location: data.location ?? null,
      type: data.type,
      remote: data.remote ?? false,
      salaryMinCents: data.salaryMinCents ?? null,
      salaryMaxCents: data.salaryMaxCents ?? null,
      companyId: company.id,
      postedById: userId,
    })
    .returning()
  return row
}

export async function getCompany(slug: string) {
  const rows = await db.select().from(schema.companies).where(eq(schema.companies.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function listCompanyJobs(companyId: number) {
  return db.select().from(schema.jobs).where(eq(schema.jobs.companyId, companyId)).orderBy(desc(schema.jobs.createdAt))
}
