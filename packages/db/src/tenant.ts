import type { Prisma } from "./generated/prisma/client"

/**
 * Tenant scoping helpers. EVERY query on a tenant-owned model from an
 * authenticated route must go through one of these (or include the
 * organizationId filter explicitly). See docs/security.md → "Tenant isolation".
 */
export function forOrganization(organizationId: string) {
  return {
    document: (where: Prisma.DocumentWhereInput = {}): Prisma.DocumentWhereInput => ({
      ...where,
      organizationId,
      deletedAt: null,
    }),
    envelope: (where: Prisma.EnvelopeWhereInput = {}): Prisma.EnvelopeWhereInput => ({
      ...where,
      organizationId,
    }),
    template: (where: Prisma.TemplateWhereInput = {}): Prisma.TemplateWhereInput => ({
      ...where,
      organizationId,
    }),
  }
}
