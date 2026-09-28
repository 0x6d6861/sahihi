import { deflateSync } from "node:zlib"
import { displayedSize, type PageBox, toPdfPlacement } from "@sahihi/core"
import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib"

/**
 * Deterministic test documents for coordinates and stamping (docs/coordinates.md → Rules 5).
 * `bun run fixtures` writes them to /fixtures; fixtures.test.ts checks the committed files still
 * match these builders and that stamping lands where the editor shows it.
 *
 * Every page has a 10% grid and an upright "TOP-LEFT" marker in the DISPLAYED frame, so a person
 * placing fields in the web editor can see whether the overlay lines up.
 */

export interface FixturePage {
  /** MediaBox [x, y, width, height]. */
  media: [number, number, number, number]
  /** CropBox, if different from the MediaBox. */
  crop?: [number, number, number, number]
  rotation: 0 | 90 | 180 | 270
  label: string
}

export interface Fixture {
  file: string
  description: string
  pages: FixturePage[]
  /** Image-only pages (no text), like a scanner produces. */
  scanned?: boolean
}

const A4: [number, number, number, number] = [0, 0, 595.28, 841.89]
const LETTER: [number, number, number, number] = [0, 0, 612, 792]
const A4_LANDSCAPE: [number, number, number, number] = [0, 0, 841.89, 595.28]

export const FIXTURES: Fixture[] = [
  {
    file: "rotated-90.pdf",
    description: "A4 page with /Rotate 90 (displayed landscape)",
    pages: [{ media: A4, rotation: 90, label: "A4 /Rotate 90" }],
  },
  {
    file: "rotated-270.pdf",
    description: "A4 page with /Rotate 270 (displayed landscape)",
    pages: [{ media: A4, rotation: 270, label: "A4 /Rotate 270" }],
  },
  {
    file: "cropbox-offset.pdf",
    description: "Letter MediaBox with a CropBox starting at (54, 72): non-zero origin",
    pages: [
      {
        media: LETTER,
        crop: [54, 72, 504, 648],
        rotation: 0,
        label: "CropBox origin (54, 72)",
      },
      {
        media: LETTER,
        crop: [36, 90, 540, 612],
        rotation: 90,
        label: "CropBox origin (36, 90) + /Rotate 90",
      },
    ],
  },
  {
    file: "mixed-sizes.pdf",
    description: "A4, Letter, A4 landscape and an upside-down page in one document",
    pages: [
      { media: A4, rotation: 0, label: "A4 portrait" },
      { media: LETTER, rotation: 0, label: "US Letter" },
      { media: A4_LANDSCAPE, rotation: 0, label: "A4 landscape (MediaBox)" },
      { media: A4, rotation: 180, label: "A4 /Rotate 180" },
    ],
  },
  {
    file: "scanned.pdf",
    description: "Two image-only pages (no text layer), like a scanner produces",
    scanned: true,
    pages: [
      { media: A4, rotation: 0, label: "Scan page 1" },
      { media: A4, rotation: 0, label: "Scan page 2" },
    ],
  },
]

/** The PageBox `inspectPdf` should report for a fixture page (crop box + rotation). */
export function expectedPageBox(p: FixturePage): PageBox {
  const [x, y, width, height] = p.crop ?? p.media
  return { x, y, width, height, rotation: p.rotation }
}

// Fixed metadata so the output is byte-for-byte reproducible.
const FIXED_DATE = new Date("2026-01-01T00:00:00Z")

export async function buildFixture(f: Fixture): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  doc.setTitle(`Sahihi fixture: ${f.file}`)
  doc.setProducer("Sahihi fixtures")
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (const [i, p] of f.pages.entries()) {
    const page = doc.addPage([p.media[2], p.media[3]])
    page.setMediaBox(...p.media)
    if (p.crop) page.setCropBox(...p.crop)
    page.setRotation(degrees(p.rotation))
    const box = expectedPageBox(p)
    if (f.scanned) {
      const png = await doc.embedPng(scanPng(i + 1))
      const pl = toPdfPlacement({ x: 0, y: 0, width: 1, height: 1 }, box)
      page.drawImage(png, { ...pl, rotate: degrees(pl.rotate) })
    } else {
      drawGuides(page, box, font, `${p.label} · page ${i + 1}`)
    }
  }
  return doc.save({ useObjectStreams: false })
}

/** Grid every 10% plus upright labels, all positioned in the displayed frame. */
function drawGuides(page: PDFPage, box: PageBox, font: PDFFont, label: string) {
  const line = rgb(0.8, 0.84, 0.9)
  const ink = rgb(0.15, 0.2, 0.35)
  for (let i = 1; i < 10; i++) {
    const t = i / 10
    const v = toPdfPlacement({ x: t, y: 0, width: 0.001, height: 1 }, box)
    page.drawRectangle({ ...v, rotate: degrees(v.rotate), color: line })
    const h = toPdfPlacement({ x: 0, y: t, width: 1, height: 0.001 }, box)
    page.drawRectangle({ ...h, rotate: degrees(h.rotate), color: line })
  }
  const text = (s: string, x: number, y: number, size: number) => {
    const shown = displayedSize(box)
    // Anchor the baseline one font-size below the requested top edge (displayed frame).
    const pl = toPdfPlacement({ x, y, width: 0.001, height: size / shown.height }, box)
    page.drawText(s, { x: pl.x, y: pl.y, size, font, color: ink, rotate: degrees(pl.rotate) })
  }
  text("TOP-LEFT", 0.02, 0.02, 12)
  text(label, 0.02, 0.06, 16)
  text("Fields you place here must stamp exactly on this grid.", 0.02, 0.1, 10)
  text("BOTTOM-RIGHT", 0.8, 0.96, 10)
}

// ── Minimal deterministic grayscale PNG encoder (for the "scanned" fixture) ────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** A 425×550 "scanned page": off-white paper, text-like bars and a little noise. */
export function scanPng(seed: number, width = 425, height = 550): Uint8Array {
  let s = seed * 2654435761
  const rand = () => {
    s = (s * 1103515245 + 12345) >>> 0
    return s / 0x100000000
  }
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0 // filter: none
    const row = Math.floor((y - 40) / 14)
    const inLine = y > 40 && y < height - 40 && (y - 40) % 14 < 7
    const lineLen = 0.55 + ((row * 37 + seed * 11) % 40) / 100
    for (let x = 0; x < width; x++) {
      const text = inLine && x > 36 && x < 36 + (width - 72) * lineLen && (x * 7 + row) % 23 > 3
      const paper = 238 + Math.floor(rand() * 12)
      raw[y * (width + 1) + 1 + x] = text ? 40 + Math.floor(rand() * 50) : paper
    }
  }
  const header = new Uint8Array(13)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  header.set([8, 0, 0, 0, 0], 8) // 8-bit grayscale, no interlace
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
