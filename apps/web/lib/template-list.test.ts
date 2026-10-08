import { describe, expect, test } from "bun:test"
import {
  hasTemplateFilters,
  parseTemplatesView,
  templatesApiQuery,
  templatesHref,
} from "./template-list"

describe("templates view (URL)", () => {
  test("keeps known values and drops the rest", () => {
    expect(
      parseTemplatesView({ q: " nda ", by: "u1", period: "7d", page: "3", layout: "list" }),
    ).toEqual({
      q: "nda",
      by: "u1",
      period: "7d",
      page: 3,
      layout: "list",
    })
    expect(parseTemplatesView({ period: "2y", page: "-1" })).toMatchObject({
      period: undefined,
      page: undefined,
    })
  })

  test("links reset the page on a filter change and keep the layout", () => {
    const view = { q: "nda", page: 2, layout: "grid" as const }
    expect(templatesHref(view, { by: "u2" })).toBe("/templates?q=nda&by=u2&layout=grid")
    expect(templatesHref(view, { page: 3 })).toBe("/templates?q=nda&page=3&layout=grid")
  })

  test("maps URL names to API names", () => {
    expect(templatesApiQuery({ by: "u1", period: "year", layout: "grid" })).toBe(
      "page=1&createdById=u1&period=year",
    )
    expect(hasTemplateFilters({ layout: "grid" })).toBe(false)
  })
})
