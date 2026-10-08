import { describe, expect, test } from "bun:test"
import {
  fileStatusLabel,
  filesApiQuery,
  filesHref,
  hasFileFilters,
  parseFilesView,
} from "./files-list"

describe("All files view (URL, ADR 0038)", () => {
  test("keeps known values and drops the rest", () => {
    expect(
      parseFilesView({
        folder: "f1",
        q: " lease ",
        type: "envelope",
        status: "envelope:active",
        owner: "u1",
        period: "30d",
        tag: "NDA",
        color: "1570d1",
        page: "2",
        layout: "grid",
      }),
    ).toEqual({
      folder: "f1",
      q: "lease",
      type: "envelope",
      status: "envelope:active",
      owner: "u1",
      period: "30d",
      tag: "NDA",
      color: "#1570D1",
      page: 2,
      layout: "grid",
    })
    expect(parseFilesView({ type: "folder", status: "envelope:READY", page: "0" })).toMatchObject({
      type: undefined,
      status: undefined,
      page: undefined,
    })
  })

  test("links reset the page and clear search when opening a folder", () => {
    const view = { q: "lease", type: "template" as const, page: 3 }
    expect(filesHref(view, { owner: "u2" })).toBe("/files?q=lease&type=template&owner=u2")
    expect(filesHref(view, { folder: "f2" })).toBe("/files?folder=f2&type=template")
    expect(filesHref({})).toBe("/files")
  })

  test("API query and filters", () => {
    const view = parseFilesView({ folder: "f1", status: "document:FAILED", owner: "u1" })
    expect(filesApiQuery(view)).toBe("page=1&folderId=f1&status=document%3AFAILED&ownerId=u1")
    expect(hasFileFilters(view)).toBe(true)
    expect(hasFileFilters({ folder: "f1" })).toBe(false)
  })

  test("status labels", () => {
    expect(fileStatusLabel("envelope:active")).toBe("In progress")
    expect(fileStatusLabel("document:FAILED")).toBe("Document failed")
  })
})
