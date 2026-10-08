import {
  AUTO_FIELD_TYPES,
  type FieldType,
  type FieldValueInput,
  IMAGE_FIELD_TYPES,
  type NormalizedRect,
} from "@sahihi/core"

/**
 * Pure state helpers for the public signing surface. The server stays authoritative: it re-checks
 * required fields and fills DATE_SIGNED / NAME / EMAIL itself (docs/signing-flow.md → Signing surface).
 */

export interface SignerField extends NormalizedRect {
  id: string
  /** The envelope document it sits on (ADR 0037); `page` is within it. */
  envelopeDocumentId: string
  type: FieldType
  page: number
  required: boolean
  label?: string | null
}

/** What the signer has entered so far, keyed by field id. */
export type SignerValue =
  | { kind: "image"; dataUrl: string }
  | { kind: "text"; value: string }
  | { kind: "checkbox"; checked: boolean }
export type SignerValues = Record<string, SignerValue | undefined>

/** Same cap as FieldValueSchema (base64 characters of the data URL). */
export const MAX_SIGNATURE_DATA_URL_LENGTH = 700_000

export const isAutoField = (f: { type: FieldType }) => AUTO_FIELD_TYPES.includes(f.type)
export const isImageField = (f: { type: FieldType }) => IMAGE_FIELD_TYPES.includes(f.type)

/** Reading order: page, then top to bottom, then left to right. */
export function orderFields<T extends SignerField>(fields: T[]): T[] {
  return [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
}

/** A field the signer has completed (auto fields always count as complete). */
export function isFilled(field: SignerField, values: SignerValues): boolean {
  if (isAutoField(field)) return true
  const v = values[field.id]
  if (!v) return false
  switch (v.kind) {
    case "image":
      return v.dataUrl.length > 0
    case "text":
      return v.value.trim().length > 0
    case "checkbox":
      return v.checked
  }
}

/** Progress over required, signer-filled fields. */
export function completion(fields: SignerField[], values: SignerValues) {
  const required = fields.filter((f) => f.required && !isAutoField(f))
  return { done: required.filter((f) => isFilled(f, values)).length, total: required.length }
}

/**
 * The next field to fill after `currentId` in reading order: required ones first, then optional
 * ones, wrapping around. Null when nothing is left to do.
 */
export function nextFieldToFill(
  fields: SignerField[],
  values: SignerValues,
  currentId: string | null = null,
): SignerField | null {
  const ordered = orderFields(fields).filter((f) => !isAutoField(f))
  const start = currentId ? ordered.findIndex((f) => f.id === currentId) + 1 : 0
  const rotated = [...ordered.slice(start), ...ordered.slice(0, start)]
  return (
    rotated.find((f) => f.required && !isFilled(f, values)) ??
    rotated.find((f) => !f.required && !isFilled(f, values) && f.type !== "CHECKBOX") ??
    null
  )
}

/** `values` for `POST /sign/:token/submit`. Auto fields are omitted; the server fills them. */
export function buildSubmitValues(fields: SignerField[], values: SignerValues): FieldValueInput[] {
  const out: FieldValueInput[] = []
  for (const f of fields) {
    if (isAutoField(f)) continue
    const v = values[f.id]
    if (!v) continue
    if (v.kind === "image" && isImageField(f) && v.dataUrl) {
      out.push({ kind: "image", fieldId: f.id, dataUrl: v.dataUrl })
    } else if (v.kind === "text" && f.type === "TEXT" && v.value.trim()) {
      out.push({ kind: "text", fieldId: f.id, value: v.value.trim().slice(0, 500) })
    } else if (v.kind === "checkbox" && f.type === "CHECKBOX") {
      out.push({ kind: "checkbox", fieldId: f.id, checked: v.checked })
    }
  }
  return out
}

/** Preview text for auto-filled fields (the server writes the real values on submit). */
export function autoFieldPreview(
  type: FieldType,
  recipient: { name: string; email: string | null },
  today: Date = new Date(),
): string {
  switch (type) {
    case "NAME":
      return recipient.name
    case "EMAIL":
      return recipient.email ?? ""
    case "DATE_SIGNED":
      return today.toISOString().slice(0, 10)
    default:
      return ""
  }
}

/** A PNG data URL the API will accept. */
export function isAcceptablePng(dataUrl: string): boolean {
  return (
    dataUrl.startsWith("data:image/png;base64,") &&
    dataUrl.length <= MAX_SIGNATURE_DATA_URL_LENGTH &&
    dataUrl.length > "data:image/png;base64,".length
  )
}

/**
 * Bounding box of the "inked" pixels in RGBA image data: alpha above `alphaMin` and not near-white
 * (so uploaded scans on white paper trim too). Null when the image is blank. Used to crop captured
 * signatures before they're sent, so they fill their field when stamped.
 */
export function inkBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  { alphaMin = 16, whiteMin = 245 }: { alphaMin?: number; whiteMin?: number } = {},
): { x: number; y: number; width: number; height: number } | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = data[i + 3] as number
      if (a <= alphaMin) continue
      const white =
        (data[i] as number) >= whiteMin &&
        (data[i + 1] as number) >= whiteMin &&
        (data[i + 2] as number) >= whiteMin
      if (white) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}
