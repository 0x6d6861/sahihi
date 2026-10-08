import { describe, expect, test } from "bun:test"
import { listLayoutCookie, parseListLayout, resolveListLayout } from "./list-layout"

describe("list layout", () => {
  test("the URL wins, then the saved cookie, then the list", () => {
    expect(resolveListLayout("list", "grid")).toBe("list")
    expect(resolveListLayout("grid", undefined)).toBe("grid")
    expect(resolveListLayout(undefined, "grid")).toBe("grid")
    expect(resolveListLayout(undefined, "tiles")).toBe("list")
    expect(resolveListLayout(undefined, undefined)).toBe("list")
  })

  test("only list and grid are read from the URL", () => {
    expect(parseListLayout("grid")).toBe("grid")
    expect(parseListLayout("list")).toBe("list")
    expect(parseListLayout("tiles")).toBeUndefined()
    expect(parseListLayout(["grid"])).toBeUndefined()
  })

  test("each page has its own year-long, site-wide cookie", () => {
    expect(listLayoutCookie("documents", "grid")).toBe(
      "sahihi-documents-layout=grid; Path=/; Max-Age=31536000; SameSite=Lax",
    )
    expect(listLayoutCookie("envelopes", "list")).toStartWith("sahihi-envelopes-layout=list;")
    expect(listLayoutCookie("templates", "grid")).toStartWith("sahihi-templates-layout=grid;")
  })
})
