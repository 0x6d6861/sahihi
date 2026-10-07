import { describe, expect, test } from "bun:test"
import {
  clampRect,
  displayedSize,
  fromPdfRect,
  isValidRect,
  type NormalizedRect,
  normalizeRotation,
  type PageBox,
  type Rotation,
  toPdfPlacement,
  toPdfRect,
} from "./coordinates"

const A4 = { x: 0, y: 0, width: 595, height: 842 }
const page = (rotation: Rotation, extra: Partial<PageBox> = {}): PageBox => ({
  ...A4,
  rotation,
  ...extra,
})
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

describe("toPdfRect", () => {
  test("rotation 0 flips the y axis", () => {
    // top-left corner field, 10% x 5%
    const r = toPdfRect({ x: 0, y: 0, width: 0.1, height: 0.05 }, page(0))
    close(r.x, 0)
    close(r.y, 842 - 0.05 * 842) // sits at the TOP in PDF space
    close(r.width, 59.5)
    close(r.height, 42.1)
  })

  test("rotation 90: displayed top-left maps to unrotated bottom-left", () => {
    // Clockwise 90° rotation moves the unrotated bottom-left corner to the displayed top-left.
    const r = toPdfRect({ x: 0, y: 0, width: 0.1, height: 0.1 }, page(90))
    close(r.x, 0)
    close(r.y, 0)
    // displayed width = 842 (H), displayed height = 595 (W)
    close(r.width, 0.1 * 595)
    close(r.height, 0.1 * 842)
  })

  test("rotation 180: displayed top-left maps to unrotated bottom-right", () => {
    const r = toPdfRect({ x: 0, y: 0, width: 0.1, height: 0.1 }, page(180))
    close(r.x + r.width, 595)
    close(r.y, 0)
  })

  test("rotation 270: displayed top-left maps to unrotated top-right", () => {
    const r = toPdfRect({ x: 0, y: 0, width: 0.1, height: 0.1 }, page(270))
    close(r.x + r.width, 595)
    close(r.y + r.height, 842)
  })

  test("crop box offset is applied", () => {
    const r = toPdfRect({ x: 0, y: 0, width: 0.5, height: 0.5 }, page(0, { x: 20, y: 30 }))
    close(r.x, 20)
    close(r.y, 30 + 421)
  })
})

describe("fromPdfRect is the inverse of toPdfRect", () => {
  const rect: NormalizedRect = { x: 0.12, y: 0.63, width: 0.3, height: 0.07 }
  for (const rot of [0, 90, 180, 270] as const) {
    test(`rotation ${rot}`, () => {
      const p = page(rot, { x: 10, y: 15 })
      const back = fromPdfRect(toPdfRect(rect, p), p)
      close(back.x, rect.x)
      close(back.y, rect.y)
      close(back.width, rect.width)
      close(back.height, rect.height)
    })
  }
})

describe("toPdfPlacement keeps content upright", () => {
  // Apply pdf-lib's CCW rotation around (x, y) to the image's corners and
  // check they land exactly on the field rect.
  const corners = (pl: ReturnType<typeof toPdfPlacement>) => {
    const t = (pl.rotate * Math.PI) / 180
    const pts = [
      [0, 0],
      [pl.width, 0],
      [0, pl.height],
      [pl.width, pl.height],
    ].map(([dx = 0, dy = 0]) => [
      pl.x + dx * Math.cos(t) - dy * Math.sin(t),
      pl.y + dx * Math.sin(t) + dy * Math.cos(t),
    ])
    const xs = pts.map((p) => p[0] as number)
    const ys = pts.map((p) => p[1] as number)
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    }
  }

  const rect: NormalizedRect = { x: 0.2, y: 0.7, width: 0.35, height: 0.06 }
  for (const rot of [0, 90, 180, 270] as const) {
    test(`rotation ${rot}`, () => {
      const p = page(rot)
      const target = toPdfRect(rect, p)
      const c = corners(toPdfPlacement(rect, p))
      expect(c.minX).toBeCloseTo(target.x, 4)
      expect(c.maxX).toBeCloseTo(target.x + target.width, 4)
      expect(c.minY).toBeCloseTo(target.y, 4)
      expect(c.maxY).toBeCloseTo(target.y + target.height, 4)
    })
  }
})

describe("helpers", () => {
  test("normalizeRotation", () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(0)).toBe(0)
  })
  test("displayedSize swaps for 90/270", () => {
    expect(displayedSize(page(90))).toEqual({ width: 842, height: 595 })
    expect(displayedSize(page(180))).toEqual({ width: 595, height: 842 })
  })
  test("clampRect keeps the field on the page", () => {
    const r = clampRect({ x: 0.95, y: -0.2, width: 0.2, height: 0.1 })
    expect(isValidRect(r)).toBe(true)
    close(r.x, 0.8)
    close(r.y, 0)
  })
})
