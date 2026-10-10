import { describe, expect, test } from "bun:test"
import * as core from "@sahihi/core"
import { $Enums } from "./generated/prisma/client"

// Guards against drift between Prisma enums and the core string unions that
// the web app (which must not import Prisma) relies on.
describe("prisma enums match @sahihi/core", () => {
  const pairs: [string, readonly string[], Record<string, string>][] = [
    ["EnvelopeStatus", core.ENVELOPE_STATUSES, $Enums.EnvelopeStatus],
    ["RecipientStatus", core.RECIPIENT_STATUSES, $Enums.RecipientStatus],
    ["RecipientRole", core.RECIPIENT_ROLES, $Enums.RecipientRole],
    ["FieldType", core.FIELD_TYPES, $Enums.FieldType],
    ["SigningOrder", core.SIGNING_ORDERS, $Enums.SigningOrder],
    ["VerificationMethod", core.VERIFICATION_METHODS, $Enums.VerificationMethod],
    ["DocumentStatus", core.DOCUMENT_STATUSES, $Enums.DocumentStatus],
    ["WebhookDeliveryStatus", core.WEBHOOK_DELIVERY_STATUSES, $Enums.WebhookDeliveryStatus],
    ["ExportStatus", core.EXPORT_STATUSES, $Enums.ExportStatus],
    ["BulkSendStatus", core.BULK_SEND_STATUSES, $Enums.BulkSendStatus],
    ["BulkSendItemStatus", core.BULK_ITEM_STATUSES, $Enums.BulkSendItemStatus],
    ["RecipientDelivery", core.RECIPIENT_DELIVERIES, $Enums.RecipientDelivery],
    ["GeneratedDocumentStatus", core.GENERATED_DOCUMENT_STATUSES, $Enums.GeneratedDocumentStatus],
    ["GenerationActor", core.GENERATION_ACTORS, $Enums.GenerationActor],
    ["ProposalStatus", core.PROPOSAL_STATUSES, $Enums.ProposalStatus],
  ]
  for (const [name, coreValues, prismaEnum] of pairs) {
    test(name, () => {
      expect([...coreValues].sort()).toEqual(Object.values(prismaEnum).sort())
    })
  }
})
