import { describe, expect, test } from "bun:test"
import {
  documentsLine,
  documentTabLabel,
  formatFileSize,
  pageRotationsOf,
} from "./envelope-documents"

describe("envelope documents (ADR 0037)", () => {
  test("tab labels are numbered, drop .pdf and stay short", () => {
    expect(documentTabLabel(0, "Lease.pdf")).toBe("1. Lease")
    expect(documentTabLabel(2, "Annex B — schedule of dilapidations.PDF")).toBe(
      "3. Annex B — schedule of…",
    )
    expect(documentTabLabel(1, ".pdf")).toBe("2. Document")
  })

  test("a line about the documents", () => {
    expect(documentsLine([{ pageCount: 1 }])).toBe("1 page")
    expect(documentsLine([{ pageCount: 3 }, { pageCount: 2 }])).toBe("2 documents · 5 pages")
    expect(documentsLine([{ pageCount: null }])).toBe("0 pages")
  })

  test("rotations and sizes", () => {
    expect(pageRotationsOf({ pages: [{ rotation: 0 }, { rotation: 90 }] })).toEqual([0, 90])
    expect(pageRotationsOf({ pages: null })).toEqual([])
    expect(formatFileSize(20_480)).toBe("20 KB")
    expect(formatFileSize(10)).toBe("1 KB")
    expect(formatFileSize(1_468_006)).toBe("1.4 MB")
  })
})
