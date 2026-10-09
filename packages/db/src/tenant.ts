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
    folder: (where: Prisma.FolderWhereInput = {}): Prisma.FolderWhereInput => ({
      ...where,
      organizationId,
    }),
    tag: (where: Prisma.TagWhereInput = {}): Prisma.TagWhereInput => ({ ...where, organizationId }),
    template: (where: Prisma.TemplateWhereInput = {}): Prisma.TemplateWhereInput => ({
      ...where,
      organizationId,
    }),
    webhookEndpoint: (
      where: Prisma.WebhookEndpointWhereInput = {},
    ): Prisma.WebhookEndpointWhereInput => ({ ...where, organizationId }),
    bulkSend: (where: Prisma.BulkSendWhereInput = {}): Prisma.BulkSendWhereInput => ({
      ...where,
      organizationId,
    }),
    apiKey: (where: Prisma.ApiKeyWhereInput = {}): Prisma.ApiKeyWhereInput => ({
      ...where,
      organizationId,
    }),
    dataExport: (where: Prisma.DataExportWhereInput = {}): Prisma.DataExportWhereInput => ({
      ...where,
      organizationId,
    }),
    notification: (where: Prisma.NotificationWhereInput = {}): Prisma.NotificationWhereInput => ({
      ...where,
      organizationId,
    }),
    webhookDelivery: (
      where: Prisma.WebhookDeliveryWhereInput = {},
    ): Prisma.WebhookDeliveryWhereInput => ({ ...where, organizationId }),
    generatedDocument: (
      where: Prisma.GeneratedDocumentWhereInput = {},
    ): Prisma.GeneratedDocumentWhereInput => ({ ...where, organizationId }),
  }
}
