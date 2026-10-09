import {
  type FieldInput,
  type FieldType,
  type NormalizedRect,
  withoutDuplicates,
} from "@sahihi/core"
import { moveRect, type Point, rectAtPoint, rectFromDrag } from "./field-geometry"

/**
 * Pure state for the field-placement editor. The React layer dispatches these actions; the reducer
 * owns every rule (clamping, which recipients may own fields, keyboard steps). Rects are always
 * NORMALIZED (docs/coordinates.md).
 */

export interface EditorField extends NormalizedRect {
  /** Client-only identity. The API recreates rows on every save, so ids aren't stable. */
  key: string
  recipientId: string
  /** The envelope document it sits on; `page` is within it (ADR 0037). */
  envelopeDocumentId: string
  type: FieldType
  page: number
  required: boolean
  label?: string
  /**
   * Placed by finalising an AI-generated document, on a line its PDF prints: it can be selected
   * but not moved, resized, changed or deleted, and isn't sent on save (the API keeps it).
   */
  locked?: boolean
}

export interface EditorState {
  fields: EditorField[]
  selected: string | null
  /** Bumped on every change that should be autosaved (not on selection changes). */
  revision: number
}

/** A drag shorter than this (in page fractions) is treated as a click. */
export const CLICK_TOLERANCE = 0.01
/** Arrow-key nudge in page fractions; Shift multiplies by 10. */
export const NUDGE_STEP = 0.002

let seq = 0
export const fieldKey = () => `f${++seq}`

export type EditorAction =
  | {
      type: "place"
      envelopeDocumentId: string
      page: number
      recipientId: string
      fieldType: FieldType
      from: Point
      to: Point
    }
  | { type: "move"; key: string; dx: number; dy: number }
  | { type: "setRect"; key: string; rect: NormalizedRect }
  | { type: "nudge"; key: string; dirX: -1 | 0 | 1; dirY: -1 | 0 | 1; big: boolean }
  | {
      type: "update"
      key: string
      patch: Partial<Pick<EditorField, "required" | "label" | "recipientId">>
    }
  | { type: "delete"; key: string }
  | { type: "select"; key: string | null }
  | { type: "syncRecipients"; allowed: string[] }
  /** Add detected fields (ADR 0020). Ones on top of an existing field are skipped. */
  | { type: "import"; fields: Omit<EditorField, "key">[] }

export function initialState(fields: EditorField[]): EditorState {
  return { fields, selected: null, revision: 0 }
}

const changed = (s: EditorState, fields: EditorField[], selected = s.selected): EditorState => ({
  fields,
  selected,
  revision: s.revision + 1,
})

const mapField = (s: EditorState, key: string, fn: (f: EditorField) => EditorField) =>
  s.fields.some((f) => f.key === key && !f.locked)
    ? changed(
        s,
        s.fields.map((f) => (f.key === key ? fn(f) : f)),
      )
    : s

/** Placement: a real drag draws the rect; a click (or tiny drag) drops the type's default size. */
export function placementRect(fieldType: FieldType, from: Point, to: Point): NormalizedRect {
  const isClick =
    Math.abs(to.x - from.x) < CLICK_TOLERANCE && Math.abs(to.y - from.y) < CLICK_TOLERANCE
  return isClick ? rectAtPoint(to, fieldType) : rectFromDrag(from, to)
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case "place": {
      const key = fieldKey()
      const field: EditorField = {
        key,
        recipientId: a.recipientId,
        envelopeDocumentId: a.envelopeDocumentId,
        type: a.fieldType,
        page: a.page,
        required: a.fieldType !== "CHECKBOX",
        ...placementRect(a.fieldType, a.from, a.to),
      }
      return changed(s, [...s.fields, field], key)
    }
    case "move":
      return mapField(s, a.key, (f) => ({ ...f, ...moveRect(f, a.dx, a.dy) }))
    case "setRect":
      return mapField(s, a.key, (f) => ({ ...f, ...a.rect }))
    case "nudge": {
      const step = NUDGE_STEP * (a.big ? 10 : 1)
      return mapField(s, a.key, (f) => ({ ...f, ...moveRect(f, a.dirX * step, a.dirY * step) }))
    }
    case "update":
      return mapField(s, a.key, (f) => ({ ...f, ...a.patch }))
    case "delete":
      if (!s.fields.some((f) => f.key === a.key && !f.locked)) return s
      return changed(
        s,
        s.fields.filter((f) => f.key !== a.key),
        s.selected === a.key ? null : s.selected,
      )
    case "select":
      return s.selected === a.key ? s : { ...s, selected: a.key }
    case "import": {
      // Duplicates are judged per document: the same rect on another document is a different field.
      const docs = new Set(a.fields.map((f) => f.envelopeDocumentId))
      const added = withoutDuplicates(
        s.fields.filter((f) => docs.has(f.envelopeDocumentId)),
        a.fields,
      ).map((f) => ({ ...f, key: fieldKey() }))
      return added.length ? changed(s, [...s.fields, ...added], null) : s
    }
    case "syncRecipients": {
      // Recipients were removed or turned into viewers: their fields go too (the API does the same).
      // Locked fields stay: the API refuses to remove their recipients.
      const allowed = new Set(a.allowed)
      const kept = s.fields.filter((f) => f.locked || allowed.has(f.recipientId))
      if (kept.length === s.fields.length) return s
      const selected = kept.some((f) => f.key === s.selected) ? s.selected : null
      return changed(s, kept, selected)
    }
  }
}

/** Saved fields (from `GET /envelopes/:id`) → editor fields. */
export function fieldsFromSaved(
  saved: (NormalizedRect & {
    recipientId: string
    envelopeDocumentId: string
    type: FieldType
    page: number
    required: boolean
    label?: string | null
    locked?: boolean
  })[],
): EditorField[] {
  return saved.map((f) => ({
    key: fieldKey(),
    recipientId: f.recipientId,
    envelopeDocumentId: f.envelopeDocumentId,
    type: f.type,
    page: f.page,
    required: f.required,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    ...(f.label ? { label: f.label } : {}),
    ...(f.locked ? { locked: true } : {}),
  }))
}

/** Body for `PUT /envelopes/:id/fields`. Locked fields are left out: the API keeps them. */
export function toFieldsPayload(fields: EditorField[]): { fields: FieldInput[] } {
  return {
    fields: fields
      .filter((f) => !f.locked)
      .map((f) => ({
        recipientId: f.recipientId,
        envelopeDocumentId: f.envelopeDocumentId,
        type: f.type,
        page: f.page,
        required: f.required,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        ...(f.label?.trim() ? { label: f.label.trim() } : {}),
      })),
  }
}

/** Keyboard → action for the selected field, or null if the key isn't ours. */
export function keyToAction(
  key: string,
  shift: boolean,
  selected: string | null,
): EditorAction | null {
  if (key === "Escape") return { type: "select", key: null }
  if (!selected) return null
  if (key === "Delete" || key === "Backspace") return { type: "delete", key: selected }
  const dir: Record<string, [-1 | 0 | 1, -1 | 0 | 1]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  const d = dir[key]
  return d ? { type: "nudge", key: selected, dirX: d[0], dirY: d[1], big: shift } : null
}

/** Pointer position in an element's LOCAL box (unaffected by CSS rotate/scale) → 0–1 point. */
export function localPoint(offsetX: number, offsetY: number, width: number, height: number): Point {
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return { x: clamp(offsetX / width), y: clamp(offsetY / height) }
}
