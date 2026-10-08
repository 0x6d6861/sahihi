import { describe, expect, test } from "bun:test"
import {
  FILE_STATUSES,
  fileKindsFor,
  GroupItemsSchema,
  ListFilesQuerySchema,
  MAX_MOVE_ITEMS,
  MoveItemsSchema,
  mergeNewestFirst,
  parseFileStatus,
  uniqueFolderName,
} from "./files"

describe("All files status (ADR 0038)", () => {
  test("envelope stages first, then document states", () => {
    expect(FILE_STATUSES).toEqual([
      "envelope:drafts",
      "envelope:active",
      "envelope:completed",
      "envelope:closed",
      "document:READY",
      "document:FAILED",
    ])
    expect(parseFileStatus("envelope:active")).toEqual({ kind: "envelope", stage: "active" })
    expect(parseFileStatus("document:FAILED")).toEqual({ kind: "document", status: "FAILED" })
  })

  test("a status narrows the list to its type", () => {
    expect(fileKindsFor({})).toEqual(["document", "envelope", "template"])
    expect(fileKindsFor({ type: "template" })).toEqual(["template"])
    expect(fileKindsFor({ status: "envelope:drafts" })).toEqual(["envelope"])
    expect(fileKindsFor({ type: "envelope", status: "envelope:drafts" })).toEqual(["envelope"])
    // A template has no status: nothing matches.
    expect(fileKindsFor({ type: "template", status: "document:READY" })).toEqual([])
  })

  test("the query refuses unknown types and statuses and pages past the cap", () => {
    expect(ListFilesQuerySchema.safeParse({ type: "folder" }).success).toBe(false)
    expect(ListFilesQuerySchema.safeParse({ status: "envelope:READY" }).success).toBe(false)
    expect(ListFilesQuerySchema.safeParse({ page: "41" }).success).toBe(false)
    expect(ListFilesQuerySchema.parse({ color: "1570d1" }).color).toBe("#1570D1")
  })
})

describe("mergeNewestFirst", () => {
  const at = (id: string, day: number) => ({ id, createdAt: new Date(2026, 9, day) })

  test("merges the typed lists newest first and slices the page", () => {
    const docs = [at("d3", 9), at("d1", 3)]
    const envelopes = [at("e2", 8), at("e1", 2)]
    const templates = [at("t1", 5)]
    const all = [docs, envelopes, templates]
    expect(mergeNewestFirst(all, 1, 3).map((x) => x.id)).toEqual(["d3", "e2", "t1"])
    expect(mergeNewestFirst(all, 2, 3).map((x) => x.id)).toEqual(["d1", "e1"])
    expect(mergeNewestFirst(all, 3, 3)).toEqual([])
  })

  test("ties sort by id, descending, like the type lists", () => {
    expect(mergeNewestFirst([[at("a", 1)], [at("b", 1)]], 1, 5).map((x) => x.id)).toEqual([
      "b",
      "a",
    ])
  })
})

describe("MoveItemsSchema (ADR 0039)", () => {
  test("takes any mix of kinds and a folder or the root", () => {
    const items = [
      { kind: "document", id: "d1" },
      { kind: "folder", id: "f1" },
    ]
    expect(MoveItemsSchema.safeParse({ items, folderId: "f2" }).success).toBe(true)
    expect(MoveItemsSchema.safeParse({ items, folderId: null }).success).toBe(true)
  })

  test("refuses empty, oversized and duplicate lists", () => {
    const one = { kind: "envelope", id: "e1" }
    expect(MoveItemsSchema.safeParse({ items: [], folderId: null }).success).toBe(false)
    expect(MoveItemsSchema.safeParse({ items: [one, one], folderId: null }).success).toBe(false)
    const many = Array.from({ length: MAX_MOVE_ITEMS + 1 }, (_, i) => ({
      kind: "document",
      id: `d${i}`,
    }))
    expect(MoveItemsSchema.safeParse({ items: many, folderId: null }).success).toBe(false)
  })

  test("the same id may appear under two kinds", () => {
    const items = [
      { kind: "document", id: "x" },
      { kind: "template", id: "x" },
    ]
    expect(MoveItemsSchema.safeParse({ items, folderId: null }).success).toBe(true)
  })
})

describe("grouping into a new folder (ADR 0039)", () => {
  test("needs the file dropped on and at least one more item", () => {
    const one = [{ kind: "document", id: "d1" }]
    const two = [...one, { kind: "envelope", id: "e1" }]
    expect(GroupItemsSchema.safeParse({ items: one, parentId: null }).success).toBe(false)
    expect(GroupItemsSchema.safeParse({ items: two, parentId: "f1" }).success).toBe(true)
  })

  test("uniqueFolderName counts up past names in use, ignoring case", () => {
    expect(uniqueFolderName("New folder", ["Leases"])).toBe("New folder")
    expect(uniqueFolderName("New folder", ["new folder", "New folder 2"])).toBe("New folder 3")
  })
})
