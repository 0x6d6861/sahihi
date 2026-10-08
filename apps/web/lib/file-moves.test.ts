import { describe, expect, test } from "bun:test"
import {
  canDrop,
  canGroup,
  dragLabel,
  dragSet,
  groupedTitle,
  itemKey,
  type MovableItem,
  movedTitle,
  rangeKeys,
  toggleKey,
  undoMoves,
} from "./file-moves"

const doc: MovableItem = { kind: "document", id: "d1", name: "Lease.pdf", folderId: null }
const env: MovableItem = { kind: "envelope", id: "e1", name: "Lease", folderId: "f0" }
const folder: MovableItem = { kind: "folder", id: "f1", name: "Leases", folderId: null }
const items = [folder, doc, env]

describe("selection", () => {
  test("toggleKey adds and removes", () => {
    const one = toggleKey(new Set(), "document:d1")
    expect([...one]).toEqual(["document:d1"])
    expect([...toggleKey(one, "document:d1")]).toEqual([])
  })

  test("rangeKeys spans the anchor and the key in page order, either direction", () => {
    const order = ["a", "b", "c", "d"]
    expect(rangeKeys(order, "b", "d")).toEqual(["b", "c", "d"])
    expect(rangeKeys(order, "d", "b")).toEqual(["b", "c", "d"])
    expect(rangeKeys(order, null, "c")).toEqual(["c"])
    expect(rangeKeys(order, "gone", "c")).toEqual(["c"])
    expect(rangeKeys(order, "a", "gone")).toEqual([])
  })

  test("dragSet takes the selection only when the grabbed item is in it", () => {
    const selected = new Set([itemKey(env), itemKey(folder)])
    expect(dragSet(selected, env, items)).toEqual([folder, env])
    expect(dragSet(selected, doc, items)).toEqual([doc])
  })
})

describe("canDrop", () => {
  const archive = { folderId: "f9", name: "Archive", path: ["f9"] }

  test("a folder can't drop into itself or below itself", () => {
    expect(canDrop([folder], { folderId: "f1", name: "Leases", path: ["f1"] })).toBe(false)
    expect(canDrop([folder, doc], { folderId: "f2", name: "Sub", path: ["f1", "f2"] })).toBe(false)
    expect(canDrop([folder], archive)).toBe(true)
  })

  test("nothing to do when everything is already there", () => {
    expect(canDrop([doc], { folderId: null, name: "All files", path: [] })).toBe(false)
    expect(canDrop([env], { folderId: "f0", name: "F0", path: ["f0"] })).toBe(false)
    expect(canDrop([doc, env], { folderId: "f0", name: "F0", path: ["f0"] })).toBe(true)
    expect(canDrop([], archive)).toBe(false)
  })
})

describe("labels", () => {
  test("one item by name, several by count; the root by name", () => {
    expect(dragLabel([doc])).toBe("“Lease.pdf”")
    expect(dragLabel([doc, env])).toBe("2 items")
    expect(movedTitle([doc], { folderId: "f9", name: "Archive", path: ["f9"] })).toBe(
      "Moved “Lease.pdf” to Archive",
    )
    expect(movedTitle([doc, env], { folderId: null, name: "All files", path: [] })).toBe(
      "Moved 2 items to the top level",
    )
  })
})

describe("undoMoves", () => {
  test("one move per original folder", () => {
    expect(
      undoMoves([
        { kind: "document", id: "d1", folderId: null },
        { kind: "envelope", id: "e1", folderId: "f0" },
        { kind: "folder", id: "f1", folderId: null },
      ]),
    ).toEqual([
      {
        folderId: null,
        items: [
          { kind: "document", id: "d1" },
          { kind: "folder", id: "f1" },
        ],
      },
      { folderId: "f0", items: [{ kind: "envelope", id: "e1" }] },
    ])
  })
})

describe("canGroup", () => {
  test("drops onto another item that may move", () => {
    expect(canGroup([doc], env, true)).toBe(true)
    expect(canGroup([doc, folder], env, true)).toBe(true)
  })

  test("not onto itself, onto something locked, or with nothing dragged", () => {
    expect(canGroup([doc, env], env, true)).toBe(false)
    expect(canGroup([doc], env, false)).toBe(false)
    expect(canGroup([], env, true)).toBe(false)
  })

  test("groupedTitle names the folder and counts everything in it", () => {
    expect(groupedTitle("New folder", 2)).toBe("Made “New folder” with 2 items")
  })
})
