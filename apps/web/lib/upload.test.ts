import { describe, expect, test } from "bun:test"
import { MAX_UPLOAD_BYTES } from "@sahihi/core"
import { prepareUpload, uploadPercent } from "./upload"

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
