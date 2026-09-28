/**
 * TrueType fix-up for fontkit's subsetter.
 *
 * `@pdf-lib/fontkit` writes a subset's `loca` table in the short format (offset / 2) when it fits,
 * which assumes every glyph starts on an even byte. Fonts built without glyph padding (e.g. Google
 * Fonts' static instances of Noto Sans) have odd-length glyphs, so the subset's offsets shift and
 * most glyphs render blank. `padGlyphs` rewrites `glyf` with every glyph padded to 4 bytes and a
 * long-format `loca`. Fonts that are already padded are returned unchanged.
 */

const pad4 = (n: number) => (n + 3) & ~3

interface TableRecord {
  tag: string
  offset: number
  length: number
}

function readTables(view: DataView): TableRecord[] {
  const numTables = view.getUint16(4)
  const tables: TableRecord[] = []
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    const tag = String.fromCharCode(
      view.getUint8(rec),
      view.getUint8(rec + 1),
      view.getUint8(rec + 2),
      view.getUint8(rec + 3),
    )
    tables.push({ tag, offset: view.getUint32(rec + 8), length: view.getUint32(rec + 12) })
  }
  return tables
}

function checksum(bytes: Uint8Array): number {
  const padded = new Uint8Array(pad4(bytes.length))
  padded.set(bytes)
  const view = new DataView(padded.buffer)
  let sum = 0
  for (let i = 0; i < padded.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0
  return sum
}

/** Glyph byte offsets from `loca` (numGlyphs + 1 entries). */
export function glyphOffsets(font: Uint8Array): number[] {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength)
  const byTag = new Map(readTables(view).map((t) => [t.tag, t]))
  const head = byTag.get("head")
  const maxp = byTag.get("maxp")
  const loca = byTag.get("loca")
  if (!head || !maxp || !loca) throw new Error("Not a TrueType (glyf) font")
  const longLoca = view.getInt16(head.offset + 50) === 1
  const numGlyphs = view.getUint16(maxp.offset + 4)
  const offsets: number[] = []
  for (let i = 0; i <= numGlyphs; i++) {
    offsets.push(
      longLoca ? view.getUint32(loca.offset + i * 4) : view.getUint16(loca.offset + i * 2) * 2,
    )
  }
  return offsets
}

export function padGlyphs(font: Uint8Array): Uint8Array {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength)
  const tables = readTables(view)
  const glyf = tables.find((t) => t.tag === "glyf")
  if (!glyf) return font // CFF font: no loca/glyf to fix
  const offsets = glyphOffsets(font)
  if (offsets.every((o) => o % 4 === 0)) return font

  // New glyf (each glyph padded to 4 bytes) and long loca.
  const lengths = offsets.slice(1).map((end, i) => end - (offsets[i] as number))
  const newGlyf = new Uint8Array(lengths.reduce((sum, len) => sum + pad4(len), 0))
  const newLoca = new Uint8Array(offsets.length * 4)
  const locaView = new DataView(newLoca.buffer)
  let cursor = 0
  lengths.forEach((len, i) => {
    locaView.setUint32(i * 4, cursor)
    const start = glyf.offset + (offsets[i] as number)
    newGlyf.set(font.subarray(start, start + len), cursor)
    cursor += pad4(len)
  })
  locaView.setUint32(lengths.length * 4, cursor)

  const data = new Map<string, Uint8Array>()
  for (const t of tables) data.set(t.tag, font.slice(t.offset, t.offset + t.length))
  data.set("glyf", newGlyf)
  data.set("loca", newLoca)
  const head = data.get("head") as Uint8Array
  const headView = new DataView(head.buffer)
  headView.setInt16(50, 1) // indexToLocFormat: long
  headView.setUint32(8, 0) // checkSumAdjustment, recomputed below

  // Re-layout: sfnt header, table records (sorted by tag, as the spec requires), 4-byte aligned tables.
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
  const headerSize = 12 + sorted.length * 16
  const total = sorted.reduce(
    (sum, t) => sum + pad4((data.get(t.tag) as Uint8Array).length),
    headerSize,
  )
  const out = new Uint8Array(total)
  const outView = new DataView(out.buffer)
  out.set(font.subarray(0, 12)) // sfntVersion, numTables, searchRange, entrySelector, rangeShift
  let offset = headerSize
  let headOffset = 0
  sorted.forEach((t, i) => {
    const bytes = data.get(t.tag) as Uint8Array
    const rec = 12 + i * 16
    for (let c = 0; c < 4; c++) outView.setUint8(rec + c, t.tag.charCodeAt(c))
    outView.setUint32(rec + 4, checksum(bytes))
    outView.setUint32(rec + 8, offset)
    outView.setUint32(rec + 12, bytes.length)
    out.set(bytes, offset)
    if (t.tag === "head") headOffset = offset
    offset += pad4(bytes.length)
  })
  outView.setUint32(headOffset + 8, (0xb1b0afba - checksum(out)) >>> 0)
  return out
}
