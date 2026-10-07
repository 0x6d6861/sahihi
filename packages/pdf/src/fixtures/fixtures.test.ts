import { describe, expect, test } from "bun:test"
import path from "node:path"
import type { NormalizedRect, PageBox } from "@sahihi/core"
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, type PDFRef } from "pdf-lib"
import { inspectPdf } from "../parse/inspect"
import { stampFields } from "../render/stamp"
import { buildFixture, expectedPageBox, FIXTURES } from "./fixtures"

const FIXTURE_DIR = path.resolve(import.meta.dir, "../../../../fixtures")
const readFixture = async (file: string) =>
  new Uint8Array(await Bun.file(path.join(FIXTURE_DIR, file)).arrayBuffer())

// 4×2 opaque PNG (aspect 2:1), so "contain" leaves visible margins in most fields
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAAASFvFNAAAAEklEQVR4nGNgYGD4z4AKGBgYAC4DAf8kPq3SAAAAAElFTkSuQmCC",
  ),
  (c) => c.charCodeAt(0),
)

/**
 * Independent of @sahihi/core: where a PDF user-space point is shown on screen, as a 0–1 point
 * with a top-left origin. Unrotated top-left coords (u, v), then the page image is turned
 * clockwise by /Rotate, the same way viewers do it.
 */
function displayPoint(px: number, py: number, box: PageBox) {
  const W = box.width
  const H = box.height
  const u = px - box.x
  const v = H - (py - box.y)
  switch (box.rotation) {
    case 0:
      return { x: u / W, y: v / H }
    case 90:
      return { x: (H - v) / H, y: u / W }
    case 180:
      return { x: (W - u) / W, y: (H - v) / H }
    case 270:
      return { x: v / H, y: (W - u) / W }
  }
}

type Matrix = [number, number, number, number, number, number]
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
]
const apply = (m: Matrix, x: number, y: number) => ({
  x: x * m[0] + y * m[2] + m[4],
  y: x * m[1] + y * m[3] + m[5],
})

/** Decoded content of a page (all streams, in order). */
function pageContent(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex)
  const contents = page.node.Contents()
  const refs =
    contents instanceof PDFArray ? contents.asArray() : contents ? [contents as unknown] : []
  return refs
    .map((r) => {
      const stream = doc.context.lookup(r as PDFRef)
      if (!(stream instanceof PDFRawStream)) return ""
      return new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode())
    })
    .join("\n")
}

/** CTM of the last image drawn on the page: product of the `cm` ops inside its q … Do … Q block. */
function lastImageMatrix(content: string): Matrix {
  const blocks = [...content.matchAll(/q\s+((?:[^Q])*?)\/[\w.-]+ Do\s+Q/g)]
  const block = blocks.at(-1)?.[1]
  if (!block) throw new Error("no image drawn on page")
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  for (const m of block.matchAll(
    /(-?[\d.e-]+)\s+(-?[\d.e-]+)\s+(-?[\d.e-]+)\s+(-?[\d.e-]+)\s+(-?[\d.e-]+)\s+(-?[\d.e-]+)\s+cm/g,
  )) {
    const op = m.slice(1, 7).map(Number) as Matrix
    ctm = multiply(op, ctm) // PDF: CTM' = op × CTM
  }
  return ctm
}

describe("fixtures", () => {
  test("committed files match the builders (run `bun run fixtures` after changing them)", async () => {
    for (const f of FIXTURES) {
      const built = await buildFixture(f)
      const committed = await readFixture(f.file)
      expect({ file: f.file, same: Buffer.compare(built, committed) === 0 }).toEqual({
        file: f.file,
        same: true,
      })
    }
  })

  test("inspectPdf reports each page's crop box and rotation", async () => {
    for (const f of FIXTURES) {
      const info = await inspectPdf(await readFixture(f.file))
      expect(info.pageCount).toBe(f.pages.length)
      f.pages.forEach((p, i) => {
        const got = info.pages[i] as PageBox
        const want = expectedPageBox(p)
        expect({ file: f.file, page: i + 1, rotation: got.rotation }).toEqual({
          file: f.file,
          page: i + 1,
          rotation: want.rotation,
        })
        for (const k of ["x", "y", "width", "height"] as const)
          expect(got[k]).toBeCloseTo(want[k], 2)
      })
    }
  })
})

describe("stamping lands where the editor shows the field", () => {
  // Asymmetric rects: a wrong axis swap or flip moves them somewhere else.
  const RECTS: NormalizedRect[] = [
    { x: 0.08, y: 0.12, width: 0.3, height: 0.08 },
    { x: 0.6, y: 0.7, width: 0.25, height: 0.12 },
  ]

  for (const f of FIXTURES) {
    for (const [ri, rect] of RECTS.entries()) {
      test(`${f.file}, rect ${ri + 1}: inside the field, centred and upright on every page`, async () => {
        const original = await readFixture(f.file)
        const stamped = await stampFields(
          original,
          f.pages.map((_, i) => ({
            page: i + 1,
            type: "SIGNATURE" as const,
            rect,
            value: { kind: "image" as const, png: PNG },
          })),
        )
        const doc = await PDFDocument.load(stamped)
        f.pages.forEach((p, i) => {
          const box = expectedPageBox(p)
          const ctm = lastImageMatrix(pageContent(doc, i))
          const corners = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ].map(([x, y]) => {
            const pt = apply(ctm, x as number, y as number)
            return displayPoint(pt.x, pt.y, box)
          })
          const eps = 1e-6
          const where = `${f.file} page ${i + 1} (/Rotate ${p.rotation})`
          for (const c of corners) {
            expect({
              where,
              inside: c.x >= rect.x - eps && c.x <= rect.x + rect.width + eps,
            }).toEqual({
              where,
              inside: true,
            })
            expect({
              where,
              inside: c.y >= rect.y - eps && c.y <= rect.y + rect.height + eps,
            }).toEqual({ where, inside: true })
          }
          // Centred ("contain")
          const cx = corners.reduce((s, c) => s + c.x, 0) / 4
          const cy = corners.reduce((s, c) => s + c.y, 0) / 4
          expect(cx).toBeCloseTo(rect.x + rect.width / 2, 6)
          expect(cy).toBeCloseTo(rect.y + rect.height / 2, 6)
          // Upright for the reader: the image's "up" (0,0)→(0,1) points up on screen, and its
          // "right" (0,0)→(1,0) points right.
          const [bl, br, tl] = corners as [
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
          ]
          expect({ where, up: tl.y < bl.y, right: br.x > bl.x }).toEqual({
            where,
            up: true,
            right: true,
          })
        })
      })
    }
  }
})
