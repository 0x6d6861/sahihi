import { describe, expect, test } from "bun:test"
import {
  ATTACHMENT_ACCEPT,
  attachmentContentType,
  byOrder,
  documentsSummary,
  fieldsInReadingOrder,
  numberedFileName,
  safeFileName,
} from "./documents"

describe("supporting file types", () => {
  test("allowed MIME types pass; others are refused", () => {
    expect(attachmentContentType("a.pdf", "application/pdf")).toBe("application/pdf")
    expect(attachmentContentType("a.png", "image/png; charset=binary")).toBe("image/png")
    expect(attachmentContentType("page.html", "text/html")).toBeNull()
    expect(attachmentContentType("logo.svg", "image/svg+xml")).toBeNull()
    expect(attachmentContentType("run.exe", "application/x-msdownload")).toBeNull()
  })

  test("falls back to the extension when the browser sends no useful type", () => {
    expect(attachmentContentType("Prices.XLSX", "")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(attachmentContentType("list.csv", "application/vnd.ms-excel")).toBe("text/csv")
    expect(attachmentContentType("notes.txt", "application/octet-stream")).toBe("text/plain")
    expect(attachmentContentType("script.js", "")).toBeNull()
  })

  test("the picker accepts the same extensions", () => {
    expect(ATTACHMENT_ACCEPT).toContain(".docx")
    expect(ATTACHMENT_ACCEPT).not.toContain(".html")
  })
})

describe("ordering", () => {
  test("by order, then creation", () => {
    const rows = [
      { id: "b", order: 1, createdAt: "2026-01-02" },
      { id: "c", order: 0, createdAt: "2026-01-03" },
      { id: "a", order: 0, createdAt: "2026-01-01" },
    ]
    expect(byOrder(rows).map((r) => r.id)).toEqual(["a", "c", "b"])
  })

  test("fields read document by document, then page, then top to bottom", () => {
    const f = (id: string, envelopeDocumentId: string, page: number, y: number, x = 0) => ({
      id,
      envelopeDocumentId,
      page,
      y,
      x,
    })
    const fields = [
      f("d2", "doc2", 1, 0.1),
      f("d1p2", "doc1", 2, 0.1),
      f("d1b", "doc1", 1, 0.8),
      f("d1a", "doc1", 1, 0.2),
    ]
    expect(fieldsInReadingOrder(fields, ["doc1", "doc2"]).map((x) => x.id)).toEqual([
      "d1a",
      "d1b",
      "d1p2",
      "d2",
    ])
    expect(fieldsInReadingOrder(fields, ["doc2", "doc1"])[0]?.id).toBe("d2")
  })
})

describe("names", () => {
  test("summaries", () => {
    expect(documentsSummary([])).toBe("No documents")
    expect(documentsSummary(["Lease.pdf"])).toBe("Lease.pdf")
    expect(documentsSummary(["Lease.pdf", "Annex.pdf"])).toBe("Lease.pdf and Annex.pdf")
    expect(documentsSummary(["A", "B", "C"])).toBe("A + 2 more")
  })

  test("file names lose paths and control characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("-..-etc-passwd")
    expect(safeFileName("a\u0000b\nc.pdf")).toBe("abc.pdf")
    expect(safeFileName("   ")).toBe("file")
    expect(numberedFileName(0, "Lease.pdf")).toBe("01-Lease.pdf")
    expect(numberedFileName(11, "x/y.pdf")).toBe("12-x-y.pdf")
  })
})
