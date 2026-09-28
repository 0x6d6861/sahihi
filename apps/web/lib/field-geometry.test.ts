import { describe, expect, test } from "bun:test"
import {
  displayedToLocalRect,
  localToDisplayedPoint,
  moveRect,
  rectAtPoint,
  rectFromDrag,
  toNormalizedPoint,
} from "./field-geometry"

describe("field geometry", () => {
  const page = { left: 100, top: 50, width: 600, height: 800 }
  test("pointer to normalized point", () => {
    expect(toNormalizedPoint(400, 450, page)).toEqual({ x: 0.5, y: 0.5 })
    expect(toNormalizedPoint(0, 0, page)).toEqual({ x: 0, y: 0 })
  })
  test("drag in any direction yields a positive rect", () => {
    const r = rectFromDrag({ x: 0.6, y: 0.4 }, { x: 0.2, y: 0.3 })
    expect(r.x).toBeCloseTo(0.2)
    expect(r.width).toBeCloseTo(0.4)
    expect(r.height).toBeCloseTo(0.1)
  })
  test("click near the edge keeps the field on the page", () => {
    const r = rectAtPoint({ x: 0.99, y: 0.99 }, "SIGNATURE")
    expect(r.x + r.width).toBeLessThanOrEqual(1)
    expect(r.y + r.height).toBeLessThanOrEqual(1)
  })
  test("moving past the edge clamps", () => {
    expect(moveRect({ x: 0.5, y: 0.5, width: 0.2, height: 0.1 }, 1, 1)).toEqual({
      x: 0.8,
      y: 0.9,
      width: 0.2,
      height: 0.1,
    })
  })
})

describe("displayed ⇄ overlay-local frames", () => {
  // Independent reference (same derivation as packages/pdf fixtures.test.ts): where a local point
  // on the unrotated page appears once the page is turned clockwise by /Rotate.
  const reference = (u: number, v: number, rot: 0 | 90 | 180 | 270) =>
    rot === 0
      ? { x: u, y: v }
      : rot === 90
        ? { x: 1 - v, y: u }
        : rot === 180
          ? { x: 1 - u, y: 1 - v }
          : { x: v, y: 1 - u }
  const rects = [
    { x: 0.01, y: 0.005, width: 0.2, height: 0.055 },
    { x: 0.6, y: 0.7, width: 0.25, height: 0.12 },
  ]
  for (const rot of [0, 90, 180, 270] as const) {
    test(`/Rotate ${rot}: local rect corners land on the displayed rect`, () => {
      for (const r of rects) {
        const l = displayedToLocalRect(r, rot)
        const corners = [
          [l.x, l.y],
          [l.x + l.width, l.y],
          [l.x, l.y + l.height],
          [l.x + l.width, l.y + l.height],
        ].map(([u, v]) => reference(u as number, v as number, rot))
        const xs = corners.map((c) => c.x)
        const ys = corners.map((c) => c.y)
        expect(Math.min(...xs)).toBeCloseTo(r.x, 9)
        expect(Math.min(...ys)).toBeCloseTo(r.y, 9)
        expect(Math.max(...xs)).toBeCloseTo(r.x + r.width, 9)
        expect(Math.max(...ys)).toBeCloseTo(r.y + r.height, 9)
      }
    })
    test(`/Rotate ${rot}: pointer mapping matches the reference`, () => {
      for (const [u, v] of [
        [0.1, 0.2],
        [0.9, 0.05],
      ] as const) {
        const p = localToDisplayedPoint({ x: u, y: v }, rot)
        const ref = reference(u, v, rot)
        expect(p.x).toBeCloseTo(ref.x, 12)
        expect(p.y).toBeCloseTo(ref.y, 12)
      }
    })
  }
})
