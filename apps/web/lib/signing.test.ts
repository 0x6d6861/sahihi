import { describe, expect, test } from "bun:test"
import { CONSENT_VERSION, SubmitSigningSchema } from "@sahihi/core"
import {
  autoFieldPreview,
  buildSubmitValues,
  completion,
  inkBounds,
  isAcceptablePng,
  MAX_SIGNATURE_DATA_URL_LENGTH,
  nextFieldToFill,
  orderFields,
  type SignerField,
  type SignerValues,
} from "./signing"

const f = (id: string, over: Partial<SignerField>): SignerField => ({
  id,
  envelopeDocumentId: "d1",
  type: "SIGNATURE",
  page: 1,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.05,
  required: true,
  ...over,
})
const PNG = "data:image/png;base64,iVBORw0KGgo="

const fields: SignerField[] = [
  f("sig2", { page: 2, y: 0.8 }),
  f("date", { type: "DATE_SIGNED", page: 1, y: 0.9 }),
  f("text", { type: "TEXT", page: 1, y: 0.5 }),
  f("box", { type: "CHECKBOX", page: 1, y: 0.5, x: 0.05, required: false }),
  f("sig1", { page: 1, y: 0.2 }),
  f("note", { type: "TEXT", page: 2, y: 0.9, required: false }),
]

describe("orderFields", () => {
  test("page, then top-to-bottom, then left-to-right", () => {
    expect(orderFields(fields).map((x) => x.id)).toEqual([
      "sig1",
      "box",
      "text",
      "date",
      "sig2",
      "note",
    ])
  })
})

describe("completion & next field", () => {
  test("counts required signer-filled fields only (auto and optional excluded)", () => {
    expect(completion(fields, {})).toEqual({ done: 0, total: 3 })
    const values: SignerValues = {
      sig1: { kind: "image", dataUrl: PNG },
      text: { kind: "text", value: "  " },
    }
    expect(completion(fields, values)).toEqual({ done: 1, total: 3 })
  })

  test("walks required fields in reading order, wraps, then offers optional text", () => {
    expect(nextFieldToFill(fields, {})?.id).toBe("sig1")
    expect(nextFieldToFill(fields, {}, "sig1")?.id).toBe("text")
    expect(nextFieldToFill(fields, {}, "sig2")?.id).toBe("sig1") // wraps
    const allRequired: SignerValues = {
      sig1: { kind: "image", dataUrl: PNG },
      sig2: { kind: "image", dataUrl: PNG },
      text: { kind: "text", value: "Nairobi" },
    }
    expect(nextFieldToFill(fields, allRequired)?.id).toBe("note")
    expect(
      nextFieldToFill(fields, { ...allRequired, note: { kind: "text", value: "ok" } }),
    ).toBeNull()
  })
})

describe("buildSubmitValues", () => {
  test("omits auto fields and empty text, matches the field kind, passes the API schema", () => {
    const values: SignerValues = {
      sig1: { kind: "image", dataUrl: PNG },
      text: { kind: "text", value: "  Nairobi  " },
      note: { kind: "text", value: "   " },
      box: { kind: "checkbox", checked: true },
      date: { kind: "text", value: "1999-01-01" }, // ignored: server fills it
      sig2: { kind: "text", value: "wrong kind" }, // ignored: kind mismatch
    }
    const out = buildSubmitValues(fields, values)
    expect(out).toEqual([
      { kind: "text", fieldId: "text", value: "Nairobi" },
      { kind: "checkbox", fieldId: "box", checked: true },
      { kind: "image", fieldId: "sig1", dataUrl: PNG },
    ])
    expect(
      SubmitSigningSchema.safeParse({ consent: true, consentVersion: CONSENT_VERSION, values: out })
        .success,
    ).toBe(true)
  })
})

describe("previews & PNG checks", () => {
  test("auto-field previews", () => {
    const r = { name: "Wanjiku Kamau", email: "w@example.test" }
    expect(autoFieldPreview("NAME", r)).toBe("Wanjiku Kamau")
    expect(autoFieldPreview("EMAIL", { ...r, email: null })).toBe("")
    expect(autoFieldPreview("DATE_SIGNED", r, new Date("2026-09-26T21:00:00Z"))).toBe("2026-09-26")
  })
  test("PNG data URLs within the API cap", () => {
    expect(isAcceptablePng(PNG)).toBe(true)
    expect(isAcceptablePng("data:image/jpeg;base64,xx")).toBe(false)
    expect(isAcceptablePng("data:image/png;base64,")).toBe(false)
    expect(
      isAcceptablePng(`data:image/png;base64,${"A".repeat(MAX_SIGNATURE_DATA_URL_LENGTH)}`),
    ).toBe(false)
  })
})

describe("inkBounds", () => {
  const image = (w: number, h: number, ink: [number, number][], rgb = [20, 20, 60]) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (const [x, y] of ink) {
      const i = (y * w + x) * 4
      d.set([rgb[0] as number, rgb[1] as number, rgb[2] as number, 255], i)
    }
    return d
  }
  test("tight box around inked pixels", () => {
    expect(
      inkBounds(
        image(10, 6, [
          [2, 1],
          [7, 4],
        ]),
        10,
        6,
      ),
    ).toEqual({ x: 2, y: 1, width: 6, height: 4 })
  })
  test("blank, transparent or pure-white images have no ink", () => {
    expect(inkBounds(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull()
    expect(inkBounds(image(4, 4, [[1, 1]], [255, 255, 255]), 4, 4)).toBeNull()
  })
})
