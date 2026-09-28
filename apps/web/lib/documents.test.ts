import { describe, expect, test } from "bun:test"
import { envelopeTitleFromFileName, preparedFileName, shortHash } from "./documents"

describe("envelopeTitleFromFileName", () => {
  test("drops the extension and tidies separators", () => {
    expect(envelopeTitleFromFileName("Lease_Agreement  2026.PDF")).toBe("Lease Agreement 2026")
    expect(envelopeTitleFromFileName("nda.pdf")).toBe("nda")
  })
  test("keeps other dots and falls back when empty", () => {
    expect(envelopeTitleFromFileName("v1.2 contract.pdf")).toBe("v1.2 contract")
    expect(envelopeTitleFromFileName(".pdf")).toBe("Untitled envelope")
  })
  test("stays within the schema limit", () => {
    expect(envelopeTitleFromFileName(`${"a".repeat(250)}.pdf`)).toHaveLength(200)
  })
})

describe("shortHash", () => {
  test("abbreviates long digests", () => {
    const sha = "a".repeat(8) + "b".repeat(48) + "c".repeat(8)
    expect(shortHash(sha)).toBe("aaaaaaaa…cccccccc")
  })
  test("leaves short values alone", () => {
    expect(shortHash("abc")).toBe("abc")
  })
})

describe("preparedFileName", () => {
  test("marks the copy without stacking suffixes", () => {
    expect(preparedFileName("Lease.pdf")).toBe("Lease (prepared).pdf")
    expect(preparedFileName("Lease (prepared).pdf")).toBe("Lease (prepared).pdf")
    expect(preparedFileName(".PDF")).toBe("document (prepared).pdf")
  })
  test("stays within the 200-character name limit and keeps the extension", () => {
    const long = preparedFileName(`${"a".repeat(250)}.pdf`)
    expect(long.length).toBe(200)
    expect(long.startsWith("aaa")).toBe(true)
    expect(long.endsWith(" (prepared).pdf")).toBe(true)
  })
})
