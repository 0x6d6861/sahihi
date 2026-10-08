import { describe, expect, test } from "bun:test"
import { degrees, PDFDocument } from "pdf-lib"
import { inspectPdf, PdfInspectionError } from "../parse/inspect"
import { readPageText } from "../parse/page-text"
import { renderCertificate } from "./certificate"
import { pngFromDataUrl, stampFields } from "./stamp"

// 4×2 opaque blue PNG
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAAASFvFNAAAAEklEQVR4nGNgYGD4z4AKGBgYAC4DAf8kPq3SAAAAAElFTkSuQmCC"

async function samplePdf() {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  const p2 = doc.addPage([595, 842])
  p2.setRotation(degrees(90))
  const form = doc.getForm()
  form.createTextField("legacy").addToPage(doc.getPage(0), { x: 50, y: 50, width: 100, height: 20 })
  return doc.save()
}

describe("inspectPdf", () => {
  test("reads page boxes and rotation", async () => {
    const info = await inspectPdf(await samplePdf())
    expect(info.pageCount).toBe(2)
    expect(info.pages[0]).toEqual({ x: 0, y: 0, width: 595, height: 842, rotation: 0 })
    expect(info.pages[1]?.rotation).toBe(90)
  })
  test("rejects garbage", async () => {
    await expect(inspectPdf(new TextEncoder().encode("not a pdf"))).rejects.toBeInstanceOf(
      PdfInspectionError,
    )
  })
})

describe("stampFields", () => {
  test("stamps image, text and checkbox on rotated and unrotated pages and flattens forms", async () => {
    const png = pngFromDataUrl(PNG_DATA_URL)
    const out = await stampFields(
      await samplePdf(),
      [
        {
          page: 1,
          type: "SIGNATURE",
          rect: { x: 0.1, y: 0.8, width: 0.3, height: 0.06 },
          value: { kind: "image", png },
        },
        {
          page: 1,
          type: "NAME",
          rect: { x: 0.1, y: 0.87, width: 0.3, height: 0.03 },
          value: { kind: "text", text: "Wanjiku Kamau — ✓" },
        },
        {
          page: 2,
          type: "CHECKBOX",
          rect: { x: 0.5, y: 0.5, width: 0.03, height: 0.03 },
          value: { kind: "checkbox", checked: true },
        },
        {
          page: 2,
          type: "INITIALS",
          rect: { x: 0.8, y: 0.1, width: 0.1, height: 0.05 },
          value: { kind: "image", png },
        },
      ],
      { title: "Test", envelopeId: "env_1" },
    )
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getForm().getFields()).toHaveLength(0)
    expect(doc.getTitle()).toBe("Test")
  })

  test("rejects fields on missing pages", async () => {
    await expect(
      stampFields(await samplePdf(), [
        {
          page: 9,
          type: "TEXT",
          rect: { x: 0, y: 0, width: 0.1, height: 0.1 },
          value: { kind: "text", text: "x" },
        },
      ]),
    ).rejects.toThrow(/page 9/)
  })

  test("pngFromDataUrl validates magic bytes", () => {
    expect(() => pngFromDataUrl("data:image/png;base64,aGVsbG8=")).toThrow(/Invalid PNG/)
  })
})

describe("renderCertificate", () => {
  test("renders a multi-page certificate for long audit trails", async () => {
    const now = new Date("2026-09-26T10:00:00Z")
    const bytes = await renderCertificate({
      code: "K7QM-2XDP-9RTA",
      verifyUrl: "https://sahihi.local/verify/K7QM-2XDP-9RTA",
      provider: "INTERNAL",
      auditChainHead: "a".repeat(64),
      envelope: {
        id: "env_1",
        title: "Master Services Agreement",
        organizationName: "Acme Ltd",
        sender: { name: "Heri", email: "heri@example.com" },
        createdAt: now,
        sentAt: now,
        completedAt: now,
      },
      documents: [
        {
          name: "msa.pdf",
          pageCount: 3,
          originalSha256: "b".repeat(64),
          signedSha256: "c".repeat(64),
        },
        {
          name: "annex-a.pdf",
          pageCount: 1,
          originalSha256: "d".repeat(64),
          signedSha256: "e".repeat(64),
        },
      ],
      attachments: [{ name: "prices.xlsx", sizeBytes: 20480, sha256: "f".repeat(64) }],
      signers: [
        {
          name: "Amina Otieno",
          email: "amina@example.com",
          phone: "+254712345678",
          role: "SIGNER",
          verification: "SMS_OTP",
          ipAddress: "41.90.1.1",
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
          viewedAt: now,
          signedAt: now,
          consent: { version: "2026-09-28", textSha256: "d".repeat(64) },
        },
        {
          // Signed before consent versions were recorded
          name: "Kip Rono",
          email: "kip@example.com",
          phone: null,
          role: "SIGNER",
          verification: "LINK",
          ipAddress: null,
          userAgent: null,
          viewedAt: now,
          signedAt: now,
          consent: null,
        },
      ],
      events: Array.from({ length: 120 }, (_, i) => ({
        occurredAt: now,
        type: "recipient.viewed",
        actor: `Signer ${i}`,
        ipAddress: "41.90.1.1",
      })),
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
    // Every document with both hashes, and the supporting file with its hash (ADR 0037).
    const text = (await readPageText(bytes))[0]?.text ?? ""
    for (const expected of [
      "1. msa.pdf (3 pages)",
      "2. annex-a.pdf (1 page)",
      "b".repeat(64),
      "e".repeat(64),
      "prices.xlsx (20 KB)",
      "f".repeat(64),
      "SHARED WITH SIGNERS, NOT SIGNED",
    ]) {
      expect(text.replace(/\s+/g, " ")).toContain(expected)
    }
  })
})
