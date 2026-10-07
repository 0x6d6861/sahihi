import { describe, expect, test } from "bun:test"
import {
  LABEL_COLOR_PRESETS,
  labelColorName,
  normalizeLabelColor,
  normalizeTagName,
  tagKey,
  uniqueTags,
} from "./labels"

describe("tag names", () => {
  test("trim and collapse whitespace", () => {
    expect(normalizeTagName("  Q3   2026 ")).toBe("Q3 2026")
  })
  test("the key ignores case and spacing", () => {
    expect(tagKey(" NDA ")).toBe("nda")
    expect(tagKey("Client  A")).toBe(tagKey("client a"))
  })
  test("uniqueTags drops blanks and case-insensitive repeats, first spelling wins", () => {
    expect(uniqueTags(["NDA", " nda", "", "  ", "Lease", "lease "])).toEqual(["NDA", "Lease"])
  })
})

describe("label colours", () => {
  test("hex in, uppercase #RRGGBB out; opaque alpha dropped", () => {
    expect(normalizeLabelColor("1570d1")).toBe("#1570D1")
    expect(normalizeLabelColor(" #1570D180 ")).toBe("#1570D180")
    expect(normalizeLabelColor("#1570D1FF")).toBe("#1570D1")
    for (const bad of ["", "#fff", "red", "#12345", "rgb(0 0 0)", "#GGGGGG"]) {
      expect(normalizeLabelColor(bad)).toBeNull()
    }
  })
  test("presets are valid and named", () => {
    for (const p of LABEL_COLOR_PRESETS) expect(normalizeLabelColor(p.color)).toBe(p.color)
    expect(labelColorName("#1570d1")).toBe("Blue")
    expect(labelColorName("#123456")).toBe("#123456")
  })
})
