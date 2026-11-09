'use client'

import { createContext, useContext } from 'react'

/**
 * What the clinic-site 404 needs to know about the clinic that RESOLVED.
 *
 * Next hands a `not-found.tsx` no params, so the slug-level boundary cannot
 * tell "this clinic does not exist" from "this clinic exists and the page
 * does not". The site layout (which has resolved the clinic) wraps its
 * children in this provider — the boundary renders inside that subtree — so
 * a bad URL inside a live site gets the clinic's own 404 with the way home,
 * its phone and the booking door, while an unknown slug (no provider) keeps
 * the neutral "Clinic not found".
 */
export interface ClinicNotFoundInfo {
  name: string
  brand: string | null
  logoUrl: string | null
  phone: string | null
  homeHref: string
  bookHref: string
}

const Ctx = createContext<ClinicNotFoundInfo | null>(null)

export function ClinicNotFoundProvider({
  value,
  children,
}: {
  value: ClinicNotFoundInfo | null
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useClinicNotFound(): ClinicNotFoundInfo | null {
  return useContext(Ctx)
}
