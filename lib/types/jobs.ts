export const JOB_TYPES = ['full-time', 'part-time', 'contract', 'freelance', 'internship'] as const
export type JobType = (typeof JOB_TYPES)[number]
