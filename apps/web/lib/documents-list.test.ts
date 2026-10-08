import { describe, expect, test } from "bun:test"
import {
  documentsApiQuery,
  documentsHref,
  folderMeta,
  folderPathLabel,
  folderSummary,
  foldersApiQuery,
  hasFilters,
  parseDocumentsView,
  searchesEverywhere,
} from "./documents-list"

describe("parseDocumentsView", () => {
  test("keeps known values and drops the rest", () => {
    expect(
      parseDocumentsView({
        folder: "f1",
        q: "  nda ",
        status: "READY",
        sender: "u1",
        period: "30d",
        page: "2",
        layout: "grid",
      }),
    ).toEqual({
      folder: "f1",
      q: "nda",
      status: "READY",
      sender: "u1",
      period: "30d",
      page: 2,
      layout: "grid",
    })
    expect(
      parseDocumentsView({
        status: "UPLOADING",
        period: "2d",
        page: "abc",
        q: ["a", "b"],
        layout: "tiles",
      }),
    ).toEqual({
      folder: undefined,
      q: undefined,
      status: undefined,
      sender: undefined,
      period: undefined,
      page: undefined,
      layout: undefined,
    })
  })
})

describe("documentsHref", () => {
  const view = { folder: "f1", q: "nda", status: "READY" as const, page: 3 }

  test("changing a filter resets the page", () => {
    expect(documentsHref(view, { status: undefined })).toBe("/documents?folder=f1&q=nda")
  })

  test("paging keeps the filters", () => {
    expect(documentsHref(view, { page: 4 })).toBe("/documents?folder=f1&q=nda&status=READY&page=4")
  })

  test("opening another folder clears the search but keeps other filters", () => {
    expect(documentsHref(view, { folder: "f2" })).toBe("/documents?folder=f2&status=READY")
    expect(documentsHref({ tag: "NDA", color: "#D73337", period: "7d" }, { folder: "f2" })).toBe(
      "/documents?folder=f2&period=7d",
    )
    expect(documentsHref({}, { folder: undefined })).toBe("/documents")
  })

  test("the grid layout survives folders, filters and paging", () => {
    const grid = { ...view, layout: "grid" as const }
    expect(documentsHref(grid, { folder: "f2" })).toBe(
      "/documents?folder=f2&status=READY&layout=grid",
    )
    expect(documentsHref(grid, { page: 4 })).toContain("&page=4&layout=grid")
    expect(documentsHref(grid, { layout: undefined, page: grid.page })).toBe(
      "/documents?folder=f1&q=nda&status=READY&page=3",
    )
  })
})

describe("documentsApiQuery", () => {
  test("maps URL names to API names", () => {
    expect(documentsApiQuery({ folder: "f1", sender: "u1", period: "7d", layout: "grid" })).toBe(
      "page=1&folderId=f1&senderId=u1&period=7d",
    )
  })
})

describe("tag and colour", () => {
  test("read from the URL; unknown colours are dropped", () => {
    expect(parseDocumentsView({ tag: " NDA ", color: "d73337" })).toMatchObject({
      tag: "NDA",
      color: "#D73337",
    })
    expect(parseDocumentsView({ color: "red" }).color).toBeUndefined()
  })
  test("go to the API and search every folder", () => {
    const view = { folder: "f1", tag: "NDA", color: "#1570D1" }
    expect(documentsApiQuery(view)).toBe("page=1&folderId=f1&tag=NDA&color=1570D1")
    expect(documentsHref(view)).toBe("/documents?folder=f1&tag=NDA&color=1570D1")
    expect(searchesEverywhere(view)).toBe(true)
    expect(hasFilters({ tag: "x" })).toBe(true)
    expect(foldersApiQuery(view)).toBe("tag=NDA&color=1570D1")
    expect(foldersApiQuery({ folder: "f1", status: "READY" })).toBe("parentId=f1")
    expect(foldersApiQuery({})).toBe("")
  })
})

test("hasFilters and folderPathLabel", () => {
  expect(hasFilters({ folder: "f1", page: 2 })).toBe(false)
  expect(hasFilters({ period: "year" })).toBe(true)
  expect(folderPathLabel([{ name: "Contracts" }, { name: "Leases" }])).toBe("Contracts / Leases")
})

describe("folder meta line", () => {
  test("counts only what isn't zero; empty when both are", () => {
    expect(folderSummary(3, 1)).toBe("3 documents, 1 folder")
    expect(folderSummary(0, 2)).toBe("2 folders")
    expect(folderSummary(0, 0)).toBe("Empty")
  })

  test("search results say where the folder lives instead", () => {
    expect(folderMeta({ documentCount: 1, folderCount: 0 })).toBe("1 document")
    expect(folderMeta({ documentCount: 1, folderCount: 0, path: [] })).toBe("In Documents")
    expect(
      folderMeta({
        documentCount: 0,
        folderCount: 0,
        path: [{ name: "Clients" }, { name: "Acme" }],
      }),
    ).toBe("In Clients / Acme")
  })
})
