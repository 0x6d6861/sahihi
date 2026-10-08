import { describe, expect, test } from "bun:test"
import {
  clearSearchOnFolderChange,
  type FolderScope,
  foldersApiQuery,
  parseFolderScope,
  searchesEverywhere,
  setFolderScope,
} from "./folder-scope"

describe("folder scope in the URL", () => {
  test("parseFolderScope trims, normalizes the colour and drops what it doesn't know", () => {
    expect(parseFolderScope({ folder: " f1 ", tag: "Lease", color: "ff0000" })).toEqual({
      folder: "f1",
      tag: "Lease",
      color: "#FF0000",
    })
    expect(parseFolderScope({ folder: ["a", "b"], color: "red" })).toEqual({
      folder: undefined,
      tag: undefined,
      color: undefined,
    })
  })

  test("search, tag and colour look everywhere; a folder alone doesn't", () => {
    expect(searchesEverywhere({ folder: "f1" })).toBe(false)
    expect(searchesEverywhere({ tag: "x" })).toBe(true)
  })

  test("opening another folder clears search, tag and colour unless the patch sets them", () => {
    const view: FolderScope = { folder: "a", q: "lease", tag: "x", color: "#FF0000" }
    const next = { ...view, folder: "b" }
    clearSearchOnFolderChange(view, { folder: "b" }, next)
    expect(next).toEqual({ folder: "b", q: undefined, tag: undefined, color: undefined })

    const kept = { ...view, folder: "b", tag: "y" }
    clearSearchOnFolderChange(view, { folder: "b", tag: "y" }, kept)
    expect(kept.tag).toBe("y")
  })

  test("setFolderScope writes the colour without its #, under the page's folder key", () => {
    const qs = new URLSearchParams()
    setFolderScope(qs, { folder: "f1", color: "#00FF00" }, "folderId")
    expect(qs.toString()).toBe("folderId=f1&color=00FF00")
  })

  test("foldersApiQuery lists one level, or searches every folder", () => {
    expect(foldersApiQuery({ folder: "f1" })).toBe("parentId=f1")
    expect(foldersApiQuery({ folder: "f1", q: "lease" })).toBe("q=lease")
    expect(foldersApiQuery({})).toBe("")
  })
})
