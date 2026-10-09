import { describe, expect, test } from "bun:test"
import { folderMeta, folderPathLabel, folderSummary } from "./documents-list"

test("folderPathLabel", () => {
  expect(folderPathLabel([{ name: "Contracts" }, { name: "Leases" }])).toBe("Contracts / Leases")
})

describe("folder meta line", () => {
  test("counts only what isn't zero; empty when both are", () => {
    expect(folderSummary({ documentCount: 3, folderCount: 1 })).toBe("3 documents, 1 folder")
    expect(folderSummary({ documentCount: 0, folderCount: 2 })).toBe("2 folders")
    expect(folderSummary({ documentCount: 0, folderCount: 0 })).toBe("Empty")
    expect(
      folderSummary({ documentCount: 1, envelopeCount: 2, templateCount: 1, folderCount: 0 }),
    ).toBe("1 document, 2 envelopes, 1 template")
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
