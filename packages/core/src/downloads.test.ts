import { describe, expect, test } from "bun:test"
import { contentDisposition, downloadFileName } from "./downloads"

describe("downloadFileName", () => {
  test("keeps the title readable, in any script", () => {
    expect(downloadFileName("Lease 2026", "signed")).toBe("Lease 2026 (signed).pdf")
    expect(downloadFileName("Mkataba wa Kodi – Nyeri", "certificate")).toBe(
      "Mkataba wa Kodi Nyeri (certificate).pdf",
    )
    expect(downloadFileName("Contrat résilié", "signed")).toBe("Contrat résilié (signed).pdf")
    expect(downloadFileName("عقد الإيجار", "signed")).toBe("عقد الإيجار (signed).pdf")
  })
  test("removes path and header-breaking characters", () => {
    const name = downloadFileName('../../etc/"passwd"\r\nX-Evil: 1', "signed")
    expect(name).not.toMatch(/[/\\"\r\n]/)
    expect(name.endsWith(" (signed).pdf")).toBe(true)
  })
  test("falls back to 'document' and caps the length", () => {
    expect(downloadFileName("  ///  ", "signed")).toBe("document (signed).pdf")
    expect(downloadFileName("a".repeat(500), "signed").length).toBe(120 + " (signed).pdf".length)
  })
})

describe("contentDisposition", () => {
  test("ASCII names pass through; filename* carries the exact UTF-8 name", () => {
    expect(contentDisposition("Lease (signed).pdf")).toBe(
      "attachment; filename=\"Lease (signed).pdf\"; filename*=UTF-8''Lease%20%28signed%29.pdf",
    )
  })
  test("non-ASCII gets an accent-stripped fallback and an exact filename*", () => {
    const h = contentDisposition("Contrat résilié.pdf", "inline")
    expect(h.startsWith('inline; filename="Contrat resilie.pdf"')).toBe(true)
    expect(h).toContain("filename*=UTF-8''Contrat%20r%C3%A9sili%C3%A9.pdf")
    expect(decodeURIComponent(h.split("''")[1] as string)).toBe("Contrat résilié.pdf")
  })
  test("the header value never contains raw quotes, backslashes or newlines", () => {
    const h = contentDisposition('a"b\\c\r\nd.pdf')
    const fallback = h.match(/filename="([^"]*)"/)?.[1]
    expect(fallback).toBe("a_b_c__d.pdf")
    expect(h).not.toMatch(/[\r\n]/)
  })
})
