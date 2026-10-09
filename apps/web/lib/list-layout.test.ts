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

  test("a year-long, site-wide cookie", () => {
    expect(listLayoutCookie("files", "grid")).toBe(
      "sahihi-files-layout=grid; Path=/; Max-Age=31536000; SameSite=Lax",
    )
    expect(listLayoutCookie("files", "list")).toStartWith("sahihi-files-layout=list;")
  })
})
