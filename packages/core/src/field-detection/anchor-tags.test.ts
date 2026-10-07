import { describe, expect, test } from "bun:test"
import type { PageBox, PdfRect } from "../geometry/coordinates"
import {
  ANCHOR_MIN_SIZE,
  anchorRanges,
  type PageText,
  parseAnchorTags,
  suggestFieldsFromAnchors,
} from "./anchor-tags"

const LETTER: PageBox = { x: 0, y: 0, width: 612, height: 792, rotation: 0 }
const close = (a: number | undefined, b: number) => expect(a ?? Number.NaN).toBeCloseTo(b, 6)

/** Page text laid out in one line from (x, y), each glyph 6×10 pt. Spaces get no box. */
function line(page: number, text: string, x = 72, y = 700): PageText {
  const boxes = new Map<number, PdfRect>()
  ;[...text].forEach((ch, i) => {
    if (ch !== " ") boxes.set(i, { x: x + i * 6, y, width: 6, height: 10 })
  })
  return { page, text, boxes }
}

describe("parseAnchorTags", () => {
  test("reads role, type and option", () => {
    const { tags, invalid } = parseAnchorTags(
      "Sign {{s1:signature}} on {{ Buyer : date }} and {{s2:checkbox:required}} {{x:text:optional}}",
    )
    expect(invalid).toBe(0)
    expect(tags.map((t) => [t.role, t.type, t.required])).toEqual([
      ["s1", "SIGNATURE", true],
      ["buyer", "DATE_SIGNED", true],
      ["s2", "CHECKBOX", true],
      ["x", "TEXT", false],
    ])
    expect(tags[0]).toMatchObject({ start: 5, end: 21 })
  })

  test("aliases", () => {
    const { tags } = parseAnchorTags("{{a:sig}}{{a:init}}{{a:check}}{{a:name}}{{a:email}}")
    expect(tags.map((t) => t.type)).toEqual(["SIGNATURE", "INITIALS", "CHECKBOX", "NAME", "EMAIL"])
    expect(tags[2]?.required).toBe(false)
  })

  test("unknown types and options are invalid; malformed text is ignored", () => {
    const { tags, invalid } = parseAnchorTags(
      "{{s1:stamp}} {{s1:date:maybe}} {s1:date} {{s1}} {{:date}}",
    )
    expect(tags).toHaveLength(0)
    expect(invalid).toBe(2)
  })
})

describe("anchorRanges", () => {
  test("ranges of valid tags only", () => {
    expect(anchorRanges("a {{s1:sig}} b {{s1:stamp}} {{s2:date}}")).toEqual([
      [2, 12],
      [28, 39],
    ])
    expect(anchorRanges("no tags here")).toEqual([])
  })
})

describe("suggestFieldsFromAnchors", () => {
  test("grows the field from the anchor's bottom-left to the type's minimum size", () => {
    const { suggestions, skipped } = suggestFieldsFromAnchors(
      [line(1, "Sign: {{s1:signature}}")],
      [LETTER],
    )
    expect(skipped).toBe(0)
    const [s] = suggestions
    expect(s).toMatchObject({
      type: "SIGNATURE",
      page: 1,
      required: true,
      roleHint: "s1",
      source: "anchor",
      sourceName: "{{s1:signature}}",
    })
    const min = ANCHOR_MIN_SIZE.SIGNATURE
    close(s?.x, (72 + 6 * 6) / 612)
    close(s?.width, min.width / 612)
    close(s?.height, min.height / 792)
    // bottom edge on the anchor's bottom edge (PDF y = 700)
    close((s?.y ?? 0) + (s?.height ?? 0), 1 - 700 / 792)
  })

  test("a long anchor keeps its own width", () => {
    const text = "{{a-very-long-role-name-here:checkbox}}"
    const [s] = suggestFieldsFromAnchors([line(1, text)], [LETTER]).suggestions
    close(s?.width, (text.length * 6) / 612)
  })

  test("uses the displayed size on rotated pages", () => {
    const rotated: PageBox = { ...LETTER, rotation: 90 }
    const [s] = suggestFieldsFromAnchors([line(1, "{{s1:date}}")], [rotated]).suggestions
    // displayed width is the PDF height on a 90° page
    close(s?.width, Math.max(10 / 792, ANCHOR_MIN_SIZE.DATE_SIGNED.width / 792))
  })

  test("stays on the page near the edges", () => {
    const [s] = suggestFieldsFromAnchors(
      [line(1, "{{s1:signature}}", 590, 780)],
      [LETTER],
    ).suggestions
    expect((s?.x ?? 2) + (s?.width ?? 2)).toBeLessThanOrEqual(1 + 1e-9)
    expect(s?.y ?? -1).toBeGreaterThanOrEqual(0)
  })

  test("skips tags without glyph boxes, invalid tags and unknown pages", () => {
    const noBoxes: PageText = { page: 1, text: "{{s1:date}}", boxes: new Map() }
    const { suggestions, skipped } = suggestFieldsFromAnchors(
      [noBoxes, line(1, "{{s1:stamp}}"), line(3, "{{s1:date}}")],
      [LETTER],
    )
    expect(suggestions).toHaveLength(0)
    expect(skipped).toBe(3)
  })

  test("sorts in reading order across pages", () => {
    const { suggestions } = suggestFieldsFromAnchors(
      [line(2, "{{s1:date}}"), line(1, "{{s2:date}}", 72, 100), line(1, "{{s1:name}}", 72, 600)],
      [LETTER, LETTER],
    )
    expect(suggestions.map((s) => [s.page, s.type])).toEqual([
      [1, "NAME"],
      [1, "DATE_SIGNED"],
      [2, "DATE_SIGNED"],
    ])
  })
})
