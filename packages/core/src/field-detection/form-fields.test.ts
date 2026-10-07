import { describe, expect, test } from "bun:test"
import type { PageBox } from "../geometry/coordinates"
import {
  type FormWidget,
  fieldTypeForWidget,
  nameTokens,
  roleHint,
  suggestFieldsFromForm,
} from "./form-fields"

const LETTER: PageBox = { x: 0, y: 0, width: 612, height: 792, rotation: 0 }
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)
const widget = (w: Partial<FormWidget>): FormWidget => ({
  kind: "text",
  name: "Text1",
  page: 1,
  rect: { x: 61.2, y: 79.2, width: 122.4, height: 39.6 },
  ...w,
})

describe("nameTokens", () => {
  test("uses the last segment and splits camelCase, separators and XFA indexes", () => {
    expect(nameTokens("form1[0].Page1[0].Buyer_SignDate[0]")).toEqual(["buyer", "sign", "date"])
    expect(nameTokens("Party A - Signature")).toEqual(["party", "a", "signature"])
  })
})

describe("fieldTypeForWidget", () => {
  test("signature widgets and checkboxes map directly", () => {
    expect(fieldTypeForWidget("signature", "anything")).toBe("SIGNATURE")
    expect(fieldTypeForWidget("checkbox", "Agree")).toBe("CHECKBOX")
    expect(fieldTypeForWidget("other", "Signature")).toBeNull()
  })

  test("text fields are typed by their name", () => {
    const t = (name: string) => fieldTypeForWidget("text", name)
    expect(t("Signature1")).toBe("SIGNATURE")
    expect(t("Tenant Sign")).toBe("SIGNATURE")
    expect(t("Date Signed")).toBe("DATE_SIGNED")
    expect(t("Signature_Date_2")).toBe("DATE_SIGNED")
    expect(t("buyerEmail")).toBe("EMAIL")
    expect(t("Initials")).toBe("INITIALS")
    expect(t("Printed Name")).toBe("NAME")
    expect(t("Signer Name")).toBe("NAME")
    expect(t("Address")).toBe("TEXT")
  })
})

describe("roleHint", () => {
  test("keeps who, drops what", () => {
    expect(roleHint("Buyer Signature")).toBe("buyer")
    expect(roleHint("form1[0].Seller_Date[0]")).toBe("seller")
    expect(roleHint("party_a_initials")).toBe("party a")
    expect(roleHint("signer2_date")).toBe("signer2")
  })

  test("generic names have no role", () => {
    expect(roleHint("Text1")).toBeNull()
    expect(roleHint("Signature 3")).toBeNull()
    expect(roleHint("Date")).toBeNull()
  })
})

describe("suggestFieldsFromForm", () => {
  test("converts the widget rect to a normalized top-left rect", () => {
    const { suggestions, skipped } = suggestFieldsFromForm(
      [widget({ name: "Buyer Signature" })],
      [LETTER],
    )
    expect(skipped).toBe(0)
    const [s] = suggestions
    expect(s?.type).toBe("SIGNATURE")
    expect(s?.roleHint).toBe("buyer")
    expect(s?.required).toBe(true)
    expect(s?.source).toBe("form")
    close(s?.x ?? -1, 0.1)
    close(s?.y ?? -1, 1 - (79.2 + 39.6) / 792)
    close(s?.width ?? -1, 0.2)
    close(s?.height ?? -1, 0.05)
  })

  test("handles rotated pages and unnormalized rects", () => {
    const rotated: PageBox = { ...LETTER, rotation: 90 }
    const flipped = widget({ rect: { x: 183.6, y: 118.8, width: -122.4, height: -39.6 } })
    const [a] = suggestFieldsFromForm([widget({})], [rotated]).suggestions
    const [b] = suggestFieldsFromForm([flipped], [rotated]).suggestions
    for (const k of ["x", "y", "width", "height"] as const) close(b?.[k] ?? -1, a?.[k] ?? -2)
    // rotation 90: displayed x comes from PDF y
    close(a?.x ?? -1, 79.2 / 792)
  })

  test("checkboxes are optional", () => {
    const [s] = suggestFieldsFromForm([widget({ kind: "checkbox" })], [LETTER]).suggestions
    expect(s?.required).toBe(false)
  })

  test("skips unsupported kinds, unknown pages, empty and off-page widgets", () => {
    const { suggestions, skipped } = suggestFieldsFromForm(
      [
        widget({ kind: "other" }),
        widget({ page: 2 }),
        widget({ rect: { x: 10, y: 10, width: 0, height: 0 } }),
        widget({ rect: { x: 700, y: 10, width: 50, height: 20 } }),
      ],
      [LETTER],
    )
    expect(suggestions).toHaveLength(0)
    expect(skipped).toBe(4)
  })

  test("crops widgets that hang off the page", () => {
    const [s] = suggestFieldsFromForm(
      [widget({ rect: { x: 580, y: 100, width: 100, height: 20 } })],
      [LETTER],
    ).suggestions
    close((s?.x ?? 0) + (s?.width ?? 0), 1)
  })

  test("sorts in reading order", () => {
    const { suggestions } = suggestFieldsFromForm(
      [
        widget({ name: "p2", page: 2 }),
        widget({ name: "bottom", rect: { x: 50, y: 100, width: 100, height: 20 } }),
        widget({ name: "top-right", rect: { x: 300, y: 700, width: 100, height: 20 } }),
        widget({ name: "top-left", rect: { x: 50, y: 700, width: 100, height: 20 } }),
      ],
      [LETTER, LETTER],
    )
    expect(suggestions.map((s) => s.sourceName)).toEqual(["top-left", "top-right", "bottom", "p2"])
  })
})
