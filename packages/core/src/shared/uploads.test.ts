import { describe, expect, test } from "bun:test"
import {
  CreateUploadSchema,
  convertedDocumentName,
  DOCX_CONTENT_TYPE,
  documentUploadType,
  PDF_CONTENT_TYPE,
} from "../index"

describe("document uploads", () => {
  test("the type comes from the MIME type, else the extension", () => {
    expect(documentUploadType("a.pdf", "application/pdf")).toBe(PDF_CONTENT_TYPE)
    expect(documentUploadType("a", DOCX_CONTENT_TYPE)).toBe(DOCX_CONTENT_TYPE)
    expect(documentUploadType("Lease.DOCX", "")).toBe(DOCX_CONTENT_TYPE)
    expect(documentUploadType("lease.docx", "application/octet-stream")).toBe(DOCX_CONTENT_TYPE)
    expect(documentUploadType("scan.pdf", null)).toBe(PDF_CONTENT_TYPE)
    expect(documentUploadType("old.doc", "application/msword")).toBeNull()
    expect(documentUploadType("old.doc", "")).toBeNull()
    expect(documentUploadType("a.docx", "image/png")).toBeNull()
  })

  test("a converted document is named like its Word file, as a PDF", () => {
    expect(convertedDocumentName("Lease.docx")).toBe("Lease.pdf")
    expect(convertedDocumentName("Lease v2.DOCX")).toBe("Lease v2.pdf")
    expect(convertedDocumentName(".docx")).toBe("document.pdf")
    expect(convertedDocumentName(`${"x".repeat(200)}.docx`).length).toBe(200)
  })

  test("uploads take a PDF or a Word file", () => {
    const input = { name: "a", sizeBytes: 10 }
    expect(CreateUploadSchema.safeParse({ ...input, contentType: DOCX_CONTENT_TYPE }).success).toBe(
      true,
    )
    expect(
      CreateUploadSchema.safeParse({ ...input, contentType: "application/msword" }).success,
    ).toBe(false)
  })
})
