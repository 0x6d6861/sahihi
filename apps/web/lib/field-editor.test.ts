import { describe, expect, test } from "bun:test"
import { FieldInputSchema } from "@sahihi/core"
import {
  type EditorField,
  type EditorState,
  editorReducer,
  fieldsFromSaved,
  initialState,
  keyToAction,
  localPoint,
  NUDGE_STEP,
  placementRect,
  toFieldsPayload,
} from "./field-editor"
import { DEFAULT_FIELD_SIZE } from "./field-geometry"

const place = (s: EditorState, from: { x: number; y: number }, to = from) =>
  editorReducer(s, {
    type: "place",
    envelopeDocumentId: "d1",
    page: 1,
    recipientId: "r1",
    fieldType: "SIGNATURE",
    from,
    to,
  })

const only = (s: EditorState): EditorField => {
  const [f] = s.fields
  if (!f) throw new Error("no field")
  return f
}

describe("placement", () => {
  test("a click drops the default size centred on the point; a drag draws the rect", () => {
    const click = placementRect("SIGNATURE", { x: 0.5, y: 0.5 }, { x: 0.505, y: 0.5 })
    expect(click.width).toBeCloseTo(DEFAULT_FIELD_SIZE.SIGNATURE?.width ?? 0)
    expect(click.x + click.width / 2).toBeCloseTo(0.505)
    expect(placementRect("TEXT", { x: 0.6, y: 0.4 }, { x: 0.2, y: 0.3 })).toEqual({
      x: 0.2,
      y: 0.3,
      width: expect.closeTo(0.4) as unknown as number,
      height: expect.closeTo(0.1) as unknown as number,
    })
  })
  test("placing selects the new field, bumps the revision and stays on the page", () => {
    const s = place(initialState([]), { x: 0.99, y: 0.99 })
    const f = only(s)
    expect(s.selected).toBe(f.key)
    expect(s.revision).toBe(1)
    expect(f.x + f.width).toBeLessThanOrEqual(1)
    expect(f.y + f.height).toBeLessThanOrEqual(1)
    expect(f.required).toBe(true)
  })
  test("checkboxes start optional", () => {
    const s = editorReducer(initialState([]), {
      type: "place",
      envelopeDocumentId: "d1",
      page: 2,
      recipientId: "r1",
      fieldType: "CHECKBOX",
      from: { x: 0.5, y: 0.5 },
      to: { x: 0.5, y: 0.5 },
    })
    expect(only(s)).toMatchObject({ page: 2, required: false })
  })
})

describe("editing", () => {
  test("move and nudge clamp to the page", () => {
    let s = place(initialState([]), { x: 0.5, y: 0.5 })
    const key = only(s).key
    s = editorReducer(s, { type: "move", key, dx: 5, dy: -5 })
    expect(only(s).x + only(s).width).toBeCloseTo(1)
    expect(only(s).y).toBe(0)
    const y = only(s).y
    s = editorReducer(s, { type: "nudge", key, dirX: 0, dirY: 1, big: true })
    expect(only(s).y).toBeCloseTo(y + NUDGE_STEP * 10)
  })
  test("delete clears the selection; select alone doesn't count as a change", () => {
    let s = place(initialState([]), { x: 0.5, y: 0.5 })
    const key = only(s).key
    const selectedOff = editorReducer(s, { type: "select", key: null })
    expect(selectedOff.revision).toBe(s.revision)
    s = editorReducer(s, { type: "delete", key })
    expect(s.fields).toEqual([])
    expect(s.selected).toBeNull()
  })
  test("unknown keys are no-ops", () => {
    const s = initialState([])
    expect(editorReducer(s, { type: "delete", key: "nope" })).toBe(s)
    expect(editorReducer(s, { type: "move", key: "nope", dx: 1, dy: 1 })).toBe(s)
  })
  test("syncRecipients drops fields of removed or viewer recipients", () => {
    let s = place(initialState([]), { x: 0.2, y: 0.2 })
    s = editorReducer(s, {
      type: "place",
      envelopeDocumentId: "d1",
      page: 1,
      recipientId: "r2",
      fieldType: "TEXT",
      from: { x: 0.5, y: 0.5 },
      to: { x: 0.5, y: 0.5 },
    })
    const synced = editorReducer(s, { type: "syncRecipients", allowed: ["r1"] })
    expect(synced.fields.map((f) => f.recipientId)).toEqual(["r1"])
    expect(synced.selected).toBeNull()
    expect(editorReducer(synced, { type: "syncRecipients", allowed: ["r1"] })).toBe(synced)
  })
})

describe("import", () => {
  const imported = (x: number, page = 1): Omit<EditorField, "key"> => ({
    recipientId: "r1",
    envelopeDocumentId: "d1",
    type: "TEXT",
    page,
    required: true,
    x,
    y: 0.5,
    width: 0.2,
    height: 0.05,
  })

  test("adds fields, skipping ones on top of an existing or earlier imported field", () => {
    let s = editorReducer(initialState([]), { type: "import", fields: [imported(0.1)] })
    expect(s.fields).toHaveLength(1)
    expect(s.revision).toBe(1)
    s = editorReducer(s, {
      type: "import",
      fields: [imported(0.11), imported(0.5), imported(0.51), imported(0.1, 2)],
    })
    expect(s.fields.map((f) => [f.page, f.x])).toEqual([
      [1, 0.1],
      [1, 0.5],
      [2, 0.1],
    ])
    expect(new Set(s.fields.map((f) => f.key)).size).toBe(3)
  })

  test("importing only duplicates changes nothing", () => {
    const s = editorReducer(initialState([]), { type: "import", fields: [imported(0.1)] })
    expect(editorReducer(s, { type: "import", fields: [imported(0.1)] })).toBe(s)
  })
})

describe("payload", () => {
  test("round-trips saved fields and passes FieldInputSchema", () => {
    const fields = fieldsFromSaved([
      {
        recipientId: "r1",
        envelopeDocumentId: "d1",
        type: "SIGNATURE",
        page: 1,
        required: true,
        label: null,
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.05,
      },
    ])
    const { fields: body } = toFieldsPayload([
      ...fields,
      { ...(fields[0] as EditorField), key: "k2", label: "  Initial here " },
    ])
    expect(body[0]).toEqual({
      recipientId: "r1",
      envelopeDocumentId: "d1",
      type: "SIGNATURE",
      page: 1,
      required: true,
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.05,
    })
    expect(body[1]?.label).toBe("Initial here")
    for (const f of body) expect(FieldInputSchema.safeParse(f).success).toBe(true)
  })
})

describe("keyboard", () => {
  test("maps keys to actions for the selected field", () => {
    expect(keyToAction("Escape", false, null)).toEqual({ type: "select", key: null })
    expect(keyToAction("ArrowLeft", false, null)).toBeNull()
    expect(keyToAction("Delete", false, "k")).toEqual({ type: "delete", key: "k" })
    expect(keyToAction("Backspace", false, "k")).toEqual({ type: "delete", key: "k" })
    expect(keyToAction("ArrowUp", true, "k")).toEqual({
      type: "nudge",
      key: "k",
      dirX: 0,
      dirY: -1,
      big: true,
    })
    expect(keyToAction("a", false, "k")).toBeNull()
  })
})

describe("localPoint", () => {
  test("normalizes and clamps local offsets", () => {
    expect(localPoint(300, 400, 600, 800)).toEqual({ x: 0.5, y: 0.5 })
    expect(localPoint(-10, 900, 600, 800)).toEqual({ x: 0, y: 1 })
  })
})
