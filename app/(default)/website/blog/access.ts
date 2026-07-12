import 'server-only'

/**
 * Shared access rules for the posts manager. One definition for all five
 * surfaces (list / editor / calendar / preview / actions) — the clinic +
 * platform allowance and the role rule can never drift apart again.
 * The platform org authors the public marketing blog through this manager.
 */

export function postsAccessRedirect(ctx: { tenantType: string }): string | null {
  if (ctx.tenantType === 'patient') return '/patient/dashboard'
  if (ctx.tenantType !== 'clinic' && ctx.tenantType !== 'platform') return '/dashboard'
  return null
}

export function assertPostsEditor(ctx: { tenantType: string; role: string }): void {
  if (ctx.tenantType !== 'clinic' && ctx.tenantType !== 'platform') {
    throw new Error('The blog is only available for clinic and platform staff.')
  }
  if (ctx.role === 'patient') {
    throw new Error('Patients cannot edit the blog.')
  }
}
