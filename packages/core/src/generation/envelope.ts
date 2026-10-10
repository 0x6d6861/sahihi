import { fromPdfRect, type PageBox, type PdfRect } from "../geometry/coordinates"
import type { ApiFieldInput } from "../integrations/public-api"
import type { RecipientInput } from "../shared/schemas"
import type { GeneratedDocumentData, GeneratedFieldType } from "./model"

/** A field where the renderer put it (`ComposedField` in `@sahihi/pdf`). */
export interface RenderedField {
  roleKey: string
  fieldType: GeneratedFieldType
  required: boolean
  label: string | undefined
  /** 1-based */
  page: number
  rect: PdfRect
}

/**
 * Turns a finalised document's roles and rendered fields into the recipients and fields of its
 * DRAFT envelope (one document, index 0). Roles become recipients in their listed order; field
 * rects are converted to the normalized, top-left format with `fromPdfRect` (docs/coordinates.md).
 * Run `generationPreflight` first: this assumes every signer has a name and a valid email.
 */
export function envelopeDraftFromGenerated(
  data: GeneratedDocumentData,
  fields: readonly RenderedField[],
  pages: readonly PageBox[],
): { recipients: RecipientInput[]; fields: ApiFieldInput[] } {
  const index = new Map(data.roles.map((r, i) => [r.key, i]))
  const recipients: RecipientInput[] = data.roles.map((r) => ({
    name: r.name ?? "",
    email: r.email ?? "",
    role: r.recipientRole,
    order: 1,
    verification: "LINK",
    delivery: "EMAIL",
  }))
  return {
    recipients,
    fields: fields.map((f) => {
      const recipient = index.get(f.roleKey)
      const page = pages[f.page - 1]
      if (recipient === undefined) throw new Error(`Unknown role "${f.roleKey}"`)
      if (!page) throw new Error(`Field on missing page ${f.page}`)
      return {
        recipient,
        document: 0,
        type: f.fieldType,
        page: f.page,
        required: f.required,
        ...(f.label ? { label: f.label } : {}),
        ...fromPdfRect(f.rect, page),
      }
    }),
  }
}
