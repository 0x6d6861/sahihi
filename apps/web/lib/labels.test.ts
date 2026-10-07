import { describe, expect, test } from "bun:test"
import { tagSuggestions } from "./labels"

describe("labels", () => {
  test("tag suggestions skip chosen tags and match case-insensitively", () => {
    expect(tagSuggestions(["NDA", "Lease", "Leasing"], ["lease"], "LEA")).toEqual(["Leasing"])
    expect(tagSuggestions(["NDA", "Lease"], [], "")).toEqual(["NDA", "Lease"])
  })
})
