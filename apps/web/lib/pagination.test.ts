import { describe, expect, test } from "bun:test"
import { pageWindow, totalPages } from "./pagination"

describe("totalPages", () => {
  test("rounds up and never returns zero", () => {
    expect(totalPages(0, 25)).toBe(1)
    expect(totalPages(25, 25)).toBe(1)
    expect(totalPages(26, 25)).toBe(2)
  })
})

describe("pageWindow", () => {
  test("small counts list every page", () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5])
  })
  test("collapses distant gaps into ellipses", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, "ellipsis-end", 10])
    expect(pageWindow(5, 10)).toEqual([1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 10])
    expect(pageWindow(10, 10)).toEqual([1, "ellipsis-start", 9, 10])
  })
  test("a one-page gap shows the page instead of an ellipsis", () => {
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 10])
    expect(pageWindow(7, 10)).toEqual([1, "ellipsis-start", 6, 7, 8, 9, 10])
  })
  test("clamps out-of-range pages", () => {
    expect(pageWindow(99, 3)).toEqual([1, 2, 3])
    expect(pageWindow(0, 3)).toEqual([1, 2, 3])
  })
})
