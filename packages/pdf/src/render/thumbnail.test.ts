import { describe, expect, test } from "bun:test"
import { inflateSync } from "node:zlib"
import { PDFDocument, rgb } from "pdf-lib"
import { buildFixture, FIXTURES } from "../fixtures/fixtures"
import { encodePng, renderThumbnail, THUMBNAIL_MAX_ASPECT, THUMBNAIL_WIDTH } from "./thumbnail"

/** Decodes the PNGs `encodePng` writes (8-bit RGB, Sub filter) to RGB rows. */
function decode(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let at = 8
  let width = 0
  let height = 0
  const idat: Uint8Array[] = []
  while (at < png.byteLength) {
    const length = view.getUint32(at)
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8))
    const body = png.subarray(at + 8, at + 8 + length)
    if (type === "IHDR") {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
    }
    if (type === "IDAT") idat.push(body)
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const rowBytes = 1 + width * 3
  const rgb = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    expect(raw[y * rowBytes]).toBe(1)
    for (let i = 0; i < width * 3; i++) {
      const left = i >= 3 ? (rgb[y * width * 3 + i - 3] ?? 0) : 0
      rgb[y * width * 3 + i] = ((raw[y * rowBytes + 1 + i] ?? 0) + left) & 0xff
    }
  }
  return {
    width,
    height,
    pixel: (x: number, y: number) => rgb.subarray((y * width + x) * 3, (y * width + x) * 3 + 3),
  }
}

/** Pixels in a region (fractions of the image) dark enough to be the fixtures' ink, not grid lines. */
function inkIn(img: ReturnType<typeof decode>, x0: number, y0: number, x1: number, y1: number) {
  let n = 0
  for (let y = Math.floor(y0 * img.height); y < Math.ceil(y1 * img.height); y++) {
    for (let x = Math.floor(x0 * img.width); x < Math.ceil(x1 * img.width); x++) {
      const [r = 255, g = 255, b = 255] = img.pixel(x, y)
      if (r + g + b < 400) n++
    }
  }
  return n
}

const fixture = async (name: string) => {
  const f = FIXTURES.find((x) => x.file === name)
  if (!f) throw new Error(`no fixture ${name}`)
  return buildFixture(f)
}

describe("encodePng", () => {
  test("round-trips BGRx pixels as RGB", () => {
    // 2×1: red, then blue (BGRx order in, RGB out).
    const img = decode(encodePng(Uint8Array.of(0, 0, 255, 0, 255, 0, 0, 0), 2, 1))
    expect([...img.pixel(0, 0)]).toEqual([255, 0, 0])
    expect([...img.pixel(1, 0)]).toEqual([0, 0, 255])
  })

  test("skips row padding past the stride", () => {
    const img = decode(
      encodePng(Uint8Array.of(9, 9, 9, 0, 7, 7, 7, 7, 1, 2, 3, 0, 7, 7, 7, 7), 1, 2, 8),
    )
    expect([...img.pixel(0, 0)]).toEqual([9, 9, 9])
    expect([...img.pixel(0, 1)]).toEqual([3, 2, 1])
  })
})

describe("renderThumbnail", () => {
  test("renders page 1 upright on white at the thumbnail width", async () => {
    const { png, width, height } = await renderThumbnail(await fixture("mixed-sizes.pdf"))
    const img = decode(png)
    expect([width, img.width]).toEqual([THUMBNAIL_WIDTH, THUMBNAIL_WIDTH])
    expect(height).toBe(Math.round((THUMBNAIL_WIDTH * 841.89) / 595.28)) // A4 portrait
    expect(img.height).toBe(height)
    expect([...img.pixel(0, 0)]).toEqual([255, 255, 255])
    expect(inkIn(img, 0, 0, 0.3, 0.05)).toBeGreaterThan(0) // TOP-LEFT
    expect(inkIn(img, 0.6, 0, 1, 0.05)).toBe(0)
  })

  for (const name of ["rotated-90.pdf", "rotated-270.pdf"]) {
    test(`${name} renders landscape, as displayed`, async () => {
      const img = decode((await renderThumbnail(await fixture(name))).png)
      expect(img.width).toBe(THUMBNAIL_WIDTH)
      expect(img.height).toBe(Math.round((THUMBNAIL_WIDTH * 595.28) / 841.89))
      expect(inkIn(img, 0, 0, 0.3, 0.06)).toBeGreaterThan(0)
      expect(inkIn(img, 0.6, 0, 1, 0.06)).toBe(0)
    })
  }

  test("keeps the top of a very tall page", async () => {
    // A till receipt: 80mm wide, a metre long, ink only at the very top.
    const doc = await PDFDocument.create()
    const page = doc.addPage([227, 2835])
    page.drawRectangle({ x: 10, y: 2835 - 40, width: 100, height: 30, color: rgb(0, 0, 0) })
    const img = decode((await renderThumbnail(await doc.save())).png)
    expect(img.height).toBe(Math.round(THUMBNAIL_WIDTH * THUMBNAIL_MAX_ASPECT))
    expect(inkIn(img, 0, 0, 0.6, 0.1)).toBeGreaterThan(0)
  })

  test("refuses a file that isn't a PDF", async () => {
    await expect(renderThumbnail(new TextEncoder().encode("not a pdf"))).rejects.toThrow()
  })
})
