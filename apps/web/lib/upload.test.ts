import { describe, expect, test } from "bun:test"
import { MAX_UPLOAD_BYTES } from "@sahihi/core"
import {
  batchSummary,
  MAX_BATCH_UPLOADS,
  prepareUpload,
  splitUploads,
  uploadPercent,
} from "./upload"

describe("prepareUpload", () => {
  test("accepts a PDF and builds the API input", () => {
    expect(prepareUpload({ name: "nda.pdf", size: 1234, type: "application/pdf" })).toEqual({
      ok: true,
      input: { name: "nda.pdf", sizeBytes: 1234, contentType: "application/pdf" },
    })
  })
  test("accepts a .pdf with an empty MIME type", () => {
    expect(prepareUpload({ name: "SCAN.PDF", size: 10, type: "" }).ok).toBe(true)
  })
  test("rejects other types, even with a .pdf name", () => {
    expect(prepareUpload({ name: "a.docx", size: 10, type: "application/msword" }).ok).toBe(false)
    expect(prepareUpload({ name: "a.pdf", size: 10, type: "image/png" }).ok).toBe(false)
  })
  test("rejects empty and oversized files", () => {
    expect(prepareUpload({ name: "a.pdf", size: 0, type: "application/pdf" }).ok).toBe(false)
    const big = prepareUpload({
      name: "a.pdf",
      size: MAX_UPLOAD_BYTES + 1,
      type: "application/pdf",
    })
    expect(big).toEqual({ ok: false, message: "This file is larger than 25 MB." })
    expect(
      prepareUpload({ name: "a.pdf", size: MAX_UPLOAD_BYTES, type: "application/pdf" }).ok,
    ).toBe(true)
  })
  test("truncates long names to the schema limit and fills blank ones", () => {
    const long = prepareUpload({ name: `${"x".repeat(300)}.pdf`, size: 1, type: "application/pdf" })
    expect(long.ok && long.input.name.length).toBe(200)
    const blank = prepareUpload({ name: "   ", size: 1, type: "application/pdf" })
    expect(blank.ok && blank.input.name).toBe("document.pdf")
  })
})

describe("uploadPercent", () => {
  test("is monotonic across stages", () => {
    const steps = [
      uploadPercent("creating"),
      uploadPercent("uploading", 0),
      uploadPercent("uploading", 0.5),
      uploadPercent("uploading", 1),
      uploadPercent("checking"),
      uploadPercent("done"),
    ]
    expect(steps).toEqual([...steps].sort((a, b) => a - b))
    expect(steps.at(-1)).toBe(100)
  })
  test("clamps bad fractions", () => {
    expect(uploadPercent("uploading", -1)).toBe(5)
    expect(uploadPercent("uploading", 3)).toBe(90)
    expect(uploadPercent("uploading", Number.NaN)).toBe(5)
  })
})

describe("splitUploads (ADR 0039)", () => {
  const pdf = (name: string) => ({ name, size: 10, type: "application/pdf" })

  test("keeps PDFs and says why the rest are skipped", () => {
    const png = { name: "photo.png", size: 10, type: "image/png" }
    const { accepted, skipped } = splitUploads([pdf("a.pdf"), png, pdf("b.pdf")])
    expect(accepted.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"])
    expect(skipped).toEqual([{ file: png, message: "Only PDF files are supported." }])
  })

  test("caps the batch", () => {
    const files = Array.from({ length: MAX_BATCH_UPLOADS + 2 }, (_, i) => pdf(`${i}.pdf`))
    const { accepted, skipped } = splitUploads(files)
    expect(accepted).toHaveLength(MAX_BATCH_UPLOADS)
    expect(skipped).toHaveLength(2)
  })
})

describe("batchSummary", () => {
  test("counts what worked and what didn't", () => {
    expect(batchSummary(1, 0)).toBe("Document uploaded")
    expect(batchSummary(3, 0)).toBe("3 documents uploaded")
    expect(batchSummary(2, 1)).toBe("2 uploaded, 1 failed")
    expect(batchSummary(0, 1)).toBe("Upload failed")
    expect(batchSummary(0, 2)).toBe("2 uploads failed")
  })
})
