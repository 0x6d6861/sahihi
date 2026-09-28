import { describe, expect, test } from "bun:test"
import { PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib"
import { renderCertificate } from "./certificate"
import { embedUnicodeFonts } from "./fonts"
import { stampFields } from "./stamp"
import { needsShaping, sanitizeForFont } from "./text"

async function notoRegular() {
  const doc = await PDFDocument.create()
  return (await embedUnicodeFonts(doc)).regular
}

/** BaseFont names of every font resource in the document. */
function fontNames(doc: PDFDocument): string[] {
  const names: string[] = []
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of("Type")) === PDFName.of("Font")) {
      const base = obj.get(PDFName.of("BaseFont"))
      if (base) names.push(base.toString())
      if (obj.get(PDFName.of("ToUnicode")) instanceof PDFRef) names.push(`${base}:ToUnicode`)
    }
  }
  return names
}

describe("sanitizeForFont with Noto Sans", () => {
  test("keeps Latin (all extensions), Greek and Cyrillic exactly as typed", async () => {
    const font = await notoRegular()
    for (const s of [
      "Ngũgĩ wa Thiong'o",
      "Łukasz Żółć",
      "Şükrü Öztürk",
      "Nguyễn Thị Ơ",
      "Анна Ковальчук",
      "Αλέξανδρος",
      "Crème brûlée – €1,200",
    ]) {
      expect(sanitizeForFont(s, font)).toBe(s)
    }
  })

  test("replaces scripts that need shaping or have no glyphs, one '?' per character", async () => {
    const font = await notoRegular()
    expect(sanitizeForFont("عقد", font)).toBe("???") // Arabic: no glyphs, RTL + joining
    expect(sanitizeForFont("नमस्ते", font)).toBe("??????") // Devanagari: glyphs exist, needs shaping
    expect(sanitizeForFont("契約", font)).toBe("??") // CJK: not in Noto Sans
    expect(sanitizeForFont("ሰላም", font)).toBe("???") // Ethiopic: not in Noto Sans
    expect(sanitizeForFont("OK ✓", font)).toBe("OK ?")
    expect(sanitizeForFont("a\nb\r\n\tc", font)).toBe("a b c")
  })

  test("needsShaping covers RTL and Indic ranges, not Latin/Greek/Cyrillic", () => {
    for (const ch of ["ع", "ש", "न", "ก"])
      expect(needsShaping(ch.codePointAt(0) as number)).toBe(true)
    for (const ch of ["ũ", "Ł", "Ж", "Ω", "€"])
      expect(needsShaping(ch.codePointAt(0) as number)).toBe(false)
  })
})

describe("embedding", () => {
  test("stamped text embeds a subset Noto Sans with a ToUnicode map (searchable, copyable)", async () => {
    const base = await PDFDocument.create()
    base.addPage([595, 842])
    const original = await base.save()
    const out = await stampFields(original, [
      {
        page: 1,
        type: "TEXT",
        rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.05 },
        value: { kind: "text", text: "Ngũgĩ · Анна · Αλέξανδρος" },
      },
    ])
    const names = fontNames(await PDFDocument.load(out))
    // pdf-lib names subsets /NotoSans-Regular-<n>; only the weight that's drawn is embedded.
    expect(names.some((n) => /^\/NotoSans-Regular-\d+$/.test(n))).toBe(true)
    expect(names.some((n) => n.includes("NotoSans-Bold"))).toBe(false)
    expect(names.some((n) => n.endsWith(":ToUnicode"))).toBe(true)
    expect(names.some((n) => n.includes("Helvetica"))).toBe(false)
    // Subsetting keeps it small (the full TTF is ~615 KB).
    expect(out.byteLength - original.byteLength).toBeLessThan(40_000)
  })

  test("certificates render non-Latin signer names with Noto Sans (regular + bold)", async () => {
    const now = new Date("2026-09-28T10:00:00Z")
    const bytes = await renderCertificate({
      code: "K7QM-2XDP-9RTA",
      verifyUrl: "https://sahihi.test/verify/K7QM-2XDP-9RTA",
      provider: "INTERNAL",
      auditChainHead: "a".repeat(64),
      envelope: {
        id: "env_1",
        title: "Mkataba wa Kodi – Nyéri",
        organizationName: "Ngũgĩ & Łukasz Ltd",
        documentName: "mkataba.pdf",
        pageCount: 1,
        sender: { name: "Анна Ковальчук", email: "anna@example.test" },
        createdAt: now,
        sentAt: now,
        completedAt: now,
        originalSha256: "b".repeat(64),
        signedSha256: "c".repeat(64),
      },
      signers: [
        {
          name: "Αλέξανδρος Παπαδόπουλος",
          email: "alex@example.test",
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
      events: [],
    })
    const names = fontNames(await PDFDocument.load(bytes))
    expect(names.some((n) => /^\/NotoSans-Regular-\d+$/.test(n))).toBe(true)
    expect(names.some((n) => /^\/NotoSans-Bold-\d+$/.test(n))).toBe(true)
    expect(names.some((n) => n.includes("Helvetica"))).toBe(false)
  })
})
