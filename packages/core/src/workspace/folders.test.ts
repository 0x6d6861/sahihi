import { describe, expect, test } from "bun:test"
import {
  checkFolderMove,
  folderPath,
  MAX_FOLDER_DEPTH,
  periodStart,
  subtreeHeight,
} from "./folders"

// a ─ b ─ c,  d (root)
const tree = new Map<string, string | null>([
  ["a", null],
  ["b", "a"],
  ["c", "b"],
  ["d", null],
])

describe("folderPath", () => {
  test("lists ancestors root first, ending with the folder", () => {
    expect(folderPath("c", tree)).toEqual(["a", "b", "c"])
    expect(folderPath("d", tree)).toEqual(["d"])
  })

  test("unknown ids give an empty path; cycles stop", () => {
    expect(folderPath("zzz", tree)).toEqual([])
    const loop = new Map<string, string | null>([
      ["x", "y"],
      ["y", "x"],
    ])
    expect(folderPath("x", loop)).toEqual(["y", "x"])
  })
})

describe("subtreeHeight", () => {
  test("counts levels below and including the folder", () => {
    expect(subtreeHeight("a", tree)).toBe(3)
    expect(subtreeHeight("c", tree)).toBe(1)
  })
})

describe("checkFolderMove", () => {
  test("refuses moving a folder into itself or a descendant", () => {
    expect(checkFolderMove("a", "a", tree)).toBe("cycle")
    expect(checkFolderMove("a", "c", tree)).toBe("cycle")
  })

  test("allows moves to the root and to unrelated folders", () => {
    expect(checkFolderMove("c", null, tree)).toBeNull()
    expect(checkFolderMove("a", "d", tree)).toBeNull()
    expect(checkFolderMove("new", "c", tree)).toBeNull()
  })

  test("refuses nesting deeper than MAX_FOLDER_DEPTH", () => {
    const chain = new Map<string, string | null>()
    for (let i = 0; i < MAX_FOLDER_DEPTH; i++) chain.set(`f${i}`, i === 0 ? null : `f${i - 1}`)
    expect(checkFolderMove("new", `f${MAX_FOLDER_DEPTH - 2}`, chain)).toBeNull()
    expect(checkFolderMove("new", `f${MAX_FOLDER_DEPTH - 1}`, chain)).toBe("too-deep")
    chain.set("g", null)
    chain.set("h", "g")
    expect(checkFolderMove("g", `f${MAX_FOLDER_DEPTH - 2}`, chain)).toBe("too-deep")
  })
})

describe("periodStart", () => {
  const now = new Date("2026-10-07T12:00:00Z")

  test("rolling windows", () => {
    expect(periodStart("7d", now).toISOString()).toBe("2026-09-30T12:00:00.000Z")
    expect(periodStart("30d", now).toISOString()).toBe("2026-09-07T12:00:00.000Z")
  })

  test("year starts on 1 January (UTC)", () => {
    expect(periodStart("year", now).toISOString()).toBe("2026-01-01T00:00:00.000Z")
  })
})
