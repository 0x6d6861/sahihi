import { describe, expect, test } from "bun:test"
import {
  assignSuggestions,
  type FieldSuggestion,
  iou,
  mergeSuggestions,
  roleNumber,
  withoutDuplicates,
} from "./field-suggestions"

const at = (x: number, page = 1) => ({ page, x, y: 0.5, width: 0.2, height: 0.05 })
const suggestion = (x: number, source: FieldSuggestion["source"], y = 0.5): FieldSuggestion => ({
  ...at(x),
  y,
  type: "TEXT",
  required: true,
  roleHint: null,
  source,
  sourceName: source,
})

describe("iou", () => {
  test("identical, apart and partly overlapping rects", () => {
    const r = { x: 0, y: 0, width: 0.2, height: 0.2 }
    expect(iou(r, r)).toBe(1)
    expect(iou(r, { ...r, x: 0.5 })).toBe(0)
    expect(iou(r, { ...r, x: 0.1 })).toBeCloseTo(1 / 3, 6)
  })
})

describe("withoutDuplicates", () => {
  test("drops fields on top of existing or earlier incoming ones, per page", () => {
    const kept = withoutDuplicates([at(0.1)], [at(0.11), at(0.5), at(0.51), at(0.1, 2)])
    expect(kept.map((f) => [f.page, f.x])).toEqual([
      [1, 0.5],
      [2, 0.1],
    ])
  })
})

describe("mergeSuggestions", () => {
  test("earlier lists win on overlap; result is in reading order", () => {
    const merged = mergeSuggestions(
      [suggestion(0.1, "anchor", 0.8)],
      [suggestion(0.11, "form", 0.8), suggestion(0.5, "form", 0.2)],
    )
    expect(merged.map((s) => [s.source, s.y])).toEqual([
      ["form", 0.2],
      ["anchor", 0.8],
    ])
  })
})

describe("roleNumber", () => {
  test("numbered roles", () => {
    expect(["s1", "S2", "signer3", "signer 4", "party 5", "6"].map(roleNumber)).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
    expect(["s0", "buyer", "s1a", "", "signer"].map(roleNumber)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ])
  })
})

describe("assignSuggestions", () => {
  const hints = (...h: (string | null)[]) => h.map((roleHint) => ({ roleHint }))

  test("maps distinct named roles to recipients in order", () => {
    expect(
      assignSuggestions(hints("seller", "buyer", "seller", null), ["r1", "r2"], "active"),
    ).toEqual(["r1", "r2", "r1", "active"])
  })

  test("named roles beyond the recipient list go to the fallback", () => {
    expect(assignSuggestions(hints("a", "b", "c"), ["r1", "r2"], "active")).toEqual([
      "r1",
      "r2",
      "active",
    ])
  })

  test("a single named role (or none) means everything goes to the active recipient", () => {
    expect(assignSuggestions(hints("buyer", "buyer", null), ["r1", "r2"], "r2")).toEqual([
      "r2",
      "r2",
      "r2",
    ])
  })

  test("numbered roles go to that position, whatever order they appear in", () => {
    expect(assignSuggestions(hints("s2", "s1", "s3", null), ["r1", "r2"], "active")).toEqual([
      "r2",
      "r1",
      "active",
      "active",
    ])
    expect(assignSuggestions(hints("s2"), ["r1", "r2"], "r1")).toEqual(["r2"])
  })

  test("a mix of numbered and named roles falls back to order of appearance", () => {
    expect(assignSuggestions(hints("buyer", "s1"), ["r1", "r2"], "active")).toEqual(["r1", "r2"])
  })
})
