/// <reference path="../assets.d.ts" />
import { isAbsolute, join } from "node:path"
import fontkit from "@pdf-lib/fontkit"
import type { PDFDocument, PDFFont } from "pdf-lib"
// Bun copies these next to the bundle (`bun build`) and resolves them to a path in source mode.
import boldPath from "../../fonts/NotoSans-Bold.ttf" with { type: "file" }
import boldItalicPath from "../../fonts/NotoSans-BoldItalic.ttf" with { type: "file" }
import italicPath from "../../fonts/NotoSans-Italic.ttf" with { type: "file" }
import regularPath from "../../fonts/NotoSans-Regular.ttf" with { type: "file" }
import { padGlyphs } from "./ttf"

/**
 * Unicode fonts for stamped text and certificates (Noto Sans, SIL OFL 1.1, see fonts/OFL.txt).
 * Noto Sans covers Latin (all extensions, e.g. Kikuyu ũ/ĩ, Polish, Turkish, Vietnamese), Greek and
 * Cyrillic. Fonts are subset on embed, so a PDF only carries the glyphs it uses. They go through
 * `padGlyphs` first, or fontkit's subsetter drops most glyphs (see ttf.ts).
 */
export interface UnicodeFonts {
  regular: PDFFont
  bold: PDFFont
}

const cache = new Map<string, Promise<Uint8Array>>()
function load(path: string): Promise<Uint8Array> {
  let bytes = cache.get(path)
  if (!bytes) {
    bytes = Bun.file(path)
      .arrayBuffer()
      .then((b) => padGlyphs(new Uint8Array(b)))
    cache.set(path, bytes)
  }
  return bytes
}

// Absolute in source mode; relative to the bundle file after `bun build`, so it works from any cwd.
const resolve = (p: string) => (isAbsolute(p) ? p : join(import.meta.dir, p))
// Italics (same Noto Sans 2.015 release, hinted build) are used by generated documents only.
const PATHS = {
  regular: resolve(regularPath),
  bold: resolve(boldPath),
  italic: resolve(italicPath),
  boldItalic: resolve(boldItalicPath),
} as const
export type UnicodeWeight = keyof typeof PATHS

/** Embeds one face (subset). Stamping only needs regular, so it doesn't pay for the others. */
export async function embedUnicodeFont(doc: PDFDocument, weight: UnicodeWeight): Promise<PDFFont> {
  doc.registerFontkit(fontkit)
  return doc.embedFont(await load(PATHS[weight]), { subset: true })
}

export async function embedUnicodeFonts(doc: PDFDocument): Promise<UnicodeFonts> {
  const [regular, bold] = await Promise.all([
    embedUnicodeFont(doc, "regular"),
    embedUnicodeFont(doc, "bold"),
  ])
  return { regular, bold }
}
