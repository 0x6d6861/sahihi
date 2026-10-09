import type {
  BlockNode,
  GeneratedDocumentData,
  GeneratedFieldType,
  InlineNode,
  PageBox,
  PdfRect,
  SignatureBlock,
  Table,
} from "@sahihi/core"
import { MAX_PAGE_INITIALS, numberSections } from "@sahihi/core"
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib"
import { embedUnicodeFont } from "../text/fonts"
import { sanitizeForFont } from "../text/text"

/**
 * Renders a generated document (docs/ai-documents.md → Rendering) to a PDF with pdf-lib and
 * reports where every signature field landed, in PDF points, so the fields map onto the envelope
 * `Field` model with `fromPdfRect`.
 *
 * Deterministic: the same data and `date` always give the same bytes (bundled fonts, fixed
 * metadata, no clock, no randomness). Layout is deliberately simple: one column, greedy line
 * breaking, numbered section headings, lists, and signature blocks that never split across pages.
 */

export const MAX_GENERATED_PAGES = 60

const PAGE_SIZES = { A4: [595.28, 841.89], LETTER: [612, 792] } as const
const MARGIN = { top: 72, bottom: 72, x: 72 }
const BODY = { size: 10.5, leading: 15.5 }
const TITLE = { size: 18, after: 18 }
const HEADING = { size: 12, before: 14, after: 6 }
const PARAGRAPH_AFTER = 6
const LIST_INDENT = 22
const TABLE_PAD = 5
const CHECKBOX_GAP = 8
/** Initials boxes in the bottom margin: their bottom edge this far above the page's bottom. */
const PAGE_INITIALS = { y: 34 }

const FOOTER = { size: 8, y: 36 }
const FIELD_LABEL = { size: 8, gap: 3, after: 10 }
const INK = rgb(0.1, 0.1, 0.1)
const MUTED = rgb(0.45, 0.45, 0.45)
const RULE = rgb(0.6, 0.6, 0.6)
const BLANK_FILL = rgb(1, 0.95, 0.8)

/** Size of each field box in points. Tall enough to sign in, like the anchor-tag defaults. */
export const FIELD_SIZES: Record<GeneratedFieldType, { width: number; height: number }> = {
  SIGNATURE: { width: 180, height: 40 },
  INITIALS: { width: 70, height: 30 },
  NAME: { width: 180, height: 20 },
  DATE_SIGNED: { width: 120, height: 20 },
  TEXT: { width: 180, height: 20 },
  CHECKBOX: { width: 14, height: 14 },
}
const FIELD_LABELS: Record<GeneratedFieldType, string> = {
  SIGNATURE: "Signature",
  INITIALS: "Initials",
  NAME: "Name",
  DATE_SIGNED: "Date",
  TEXT: "Text",
  CHECKBOX: "Checkbox",
}

export interface ComposedField {
  id: string
  roleKey: string
  fieldType: GeneratedFieldType
  required: boolean
  label: string | undefined
  /** 1-based */
  page: number
  /** PDF user space: points, bottom-left origin. */
  rect: PdfRect
}

export interface ComposedDocument {
  bytes: Uint8Array
  pages: PageBox[]
  fields: ComposedField[]
}

export interface ComposeOptions {
  /** Written as the PDF's creation and modification date. Use the version's creation time. */
  date: Date
  /** Preview: draw unresolved blanks as highlighted `[Label]`. Final renders refuse them. */
  allowUnresolved?: boolean
}

export class ComposeError extends Error {}

// ── Layout ───────────────────────────────────────────────────────────────────
type Style = { bold: boolean; italic: boolean; underline: boolean; blank: boolean }

interface Fonts {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  boldItalic: PDFFont
}

function fontFor(fonts: Fonts, style: Pick<Style, "bold" | "italic">): PDFFont {
  if (style.bold) return style.italic ? fonts.boldItalic : fonts.bold
  return style.italic ? fonts.italic : fonts.regular
}
type Segment = { text: string; style: Style }
type Word = Segment[]

type Op =
  | {
      kind: "text"
      x: number
      top: number
      text: string
      size: number
      style: Style
      muted?: boolean
    }
  | { kind: "rule"; x: number; top: number; width: number }
  /** A table cell's border. */
  | { kind: "box"; x: number; top: number; width: number; height: number }

interface Page {
  ops: Op[]
}

class Layout {
  readonly pages: Page[] = []
  readonly fields: ComposedField[] = []
  /** Distance from the top edge of the current page. */
  top = MARGIN.top
  private readonly width: number
  private readonly height: number

  constructor(
    private readonly fonts: Fonts,
    size: readonly [number, number],
  ) {
    this.width = size[0]
    this.height = size[1]
    this.newPage()
  }

  get contentWidth() {
    return this.width - 2 * MARGIN.x
  }

  private get bottom() {
    return this.height - MARGIN.bottom
  }

  get page() {
    return this.pages[this.pages.length - 1] as Page
  }

  newPage() {
    if (this.pages.length >= MAX_GENERATED_PAGES) {
      throw new ComposeError(`Documents are limited to ${MAX_GENERATED_PAGES} pages`)
    }
    this.pages.push({ ops: [] })
    this.top = MARGIN.top
  }

  /** Starts a new page unless `height` still fits on this one. */
  ensure(height: number) {
    if (this.top + height > this.bottom && this.top > MARGIN.top) this.newPage()
  }

  font(style: Style): PDFFont {
    return fontFor(this.fonts, style)
  }

  measure(word: Word, size: number) {
    return word.reduce((w, s) => w + this.font(s.style).widthOfTextAtSize(s.text, size), 0)
  }

  /** Greedy line breaking. A word wider than the line is broken between characters. */
  lines(words: Word[], size: number, maxWidth: number): Word[][] {
    const space = this.fonts.regular.widthOfTextAtSize(" ", size)
    const out: Word[][] = []
    let line: Word[] = []
    let width = 0
    const push = (word: Word, w: number) => {
      if (line.length && width + space + w > maxWidth) {
        out.push(line)
        line = []
        width = 0
      }
      width += (line.length ? space : 0) + w
      line.push(word)
    }
    for (const word of words) {
      const w = this.measure(word, size)
      if (w <= maxWidth) {
        push(word, w)
        continue
      }
      for (const piece of this.splitWord(word, size, maxWidth))
        push(piece, this.measure(piece, size))
    }
    if (line.length) out.push(line)
    return out
  }

  private splitWord(word: Word, size: number, maxWidth: number): Word[] {
    const pieces: Word[] = []
    let cur: Word = []
    let w = 0
    for (const seg of word) {
      for (const ch of seg.text) {
        const cw = this.font(seg.style).widthOfTextAtSize(ch, size)
        if (w + cw > maxWidth && cur.length) {
          pieces.push(cur)
          cur = []
          w = 0
        }
        const last = cur[cur.length - 1]
        if (last && last.style === seg.style) last.text += ch
        else cur.push({ text: ch, style: seg.style })
        w += cw
      }
    }
    if (cur.length) pieces.push(cur)
    return pieces
  }

  /** Writes wrapped lines at `x`, moving down. A line never splits across pages. */
  writeLines(lines: Word[][], x: number, size: number, leading: number) {
    for (const line of lines) {
      this.ensure(leading)
      this.writeLine(line, x, this.top, size)
      this.top += leading
    }
  }

  /** One line at a fixed position on the current page (table cells place their own lines). */
  writeLine(line: Word[], x: number, top: number, size: number) {
    const space = this.fonts.regular.widthOfTextAtSize(" ", size)
    let cx = x
    line.forEach((word, i) => {
      if (i > 0) cx += space
      for (const seg of word) {
        this.page.ops.push({ kind: "text", x: cx, top, text: seg.text, size, style: seg.style })
        cx += this.font(seg.style).widthOfTextAtSize(seg.text, size)
      }
    })
  }

  addField(
    f: Omit<ComposedField, "page" | "rect">,
    x: number,
    size: { width: number; height: number },
  ) {
    const pageIndex = this.pages.length - 1
    this.fields.push({
      ...f,
      page: pageIndex + 1,
      rect: { x, y: this.height - this.top - size.height, width: size.width, height: size.height },
    })
    this.page.ops.push(fieldMark(f.fieldType, x, this.top, size))
  }
}

/**
 * How an empty field looks: a checkbox is a square; anything else a signing line along the bottom
 * edge, with its label under it, outside the box, so a stamped signature never covers it.
 */
function fieldMark(
  fieldType: GeneratedFieldType,
  x: number,
  top: number,
  size: { width: number; height: number },
): Op {
  return fieldType === "CHECKBOX"
    ? { kind: "box", x, top, width: size.width, height: size.height }
    : { kind: "rule", x, top: top + size.height, width: size.width }
}

const plain: Style = { bold: false, italic: false, underline: false, blank: false }

function toWords(
  nodes: InlineNode[],
  data: GeneratedDocumentData,
  allowUnresolved: boolean,
): Word[] {
  const segments: Segment[] = []
  for (const n of nodes) {
    const style: Style = {
      bold: n.marks?.some((m) => m.type === "bold") ?? false,
      italic: n.marks?.some((m) => m.type === "italic") ?? false,
      underline: n.marks?.some((m) => m.type === "underline") ?? false,
      blank: false,
    }
    if (n.type === "text") {
      segments.push({ text: n.text, style })
      continue
    }
    const v = data.variables.find((x) => x.key === n.attrs.key)
    if (v?.value != null) segments.push({ text: v.value, style })
    else if (allowUnresolved) {
      segments.push({ text: `[${v?.label ?? n.attrs.key}]`, style: { ...style, blank: true } })
    } else throw new ComposeError(`"${v?.label ?? n.attrs.key}" is not filled in`)
  }
  // Split the styled stream into words at whitespace; a word may span several segments.
  const words: Word[] = []
  let word: Word = []
  for (const seg of segments) {
    const parts = seg.text.split(/(\s+)/)
    for (const part of parts) {
      if (!part) continue
      if (/^\s+$/.test(part)) {
        if (word.length) words.push(word)
        word = []
      } else word.push({ text: part, style: seg.style })
    }
  }
  if (word.length) words.push(word)
  return words
}

function sanitizeWords(words: Word[], fonts: Fonts): Word[] {
  return words.map((w) =>
    w.map((s) => ({
      ...s,
      text: sanitizeForFont(s.text, fontFor(fonts, s.style)),
    })),
  )
}

function layoutBlock(
  L: Layout,
  block: BlockNode,
  data: GeneratedDocumentData,
  opts: ComposeOptions,
  fonts: Fonts,
) {
  const words = (nodes: InlineNode[]) =>
    sanitizeWords(toWords(nodes, data, opts.allowUnresolved ?? false), fonts)
  switch (block.type) {
    case "paragraph": {
      L.writeLines(
        L.lines(words(block.content), BODY.size, L.contentWidth),
        MARGIN.x,
        BODY.size,
        BODY.leading,
      )
      L.top += PARAGRAPH_AFTER
      return
    }
    case "bulletList":
    case "orderedList": {
      block.content.forEach((item, i) => {
        const label = block.type === "orderedList" ? `(${String.fromCharCode(97 + (i % 26))})` : "•"
        const lines = L.lines(
          words(item.content[0].content),
          BODY.size,
          L.contentWidth - LIST_INDENT,
        )
        L.ensure(BODY.leading)
        L.page.ops.push({
          kind: "text",
          x: MARGIN.x,
          top: L.top,
          text: label,
          size: BODY.size,
          style: plain,
        })
        L.writeLines(lines, MARGIN.x + LIST_INDENT, BODY.size, BODY.leading)
      })
      L.top += PARAGRAPH_AFTER
      return
    }
    case "table":
      layoutTable(L, block, words)
      L.top += PARAGRAPH_AFTER
      return
    case "signatureBlock":
      layoutSignatureBlock(L, block, words)
      return
  }
}

/**
 * Equal-width columns with a hairline border per cell. A row never splits: when it doesn't fit,
 * it moves to the next page (a row taller than a page runs past the bottom margin).
 */
function layoutTable(L: Layout, table: Table, words: (n: InlineNode[]) => Word[]) {
  const columns = table.content[0]?.content.length ?? 1
  const width = L.contentWidth / columns
  for (const row of table.content) {
    const cells = row.content.map((cell) =>
      cell.content.flatMap((p) => {
        const w = words(p.content)
        const styled =
          cell.type === "tableHeader"
            ? w.map((word) => word.map((seg) => ({ ...seg, style: { ...seg.style, bold: true } })))
            : w
        return L.lines(styled, BODY.size, width - 2 * TABLE_PAD)
      }),
    )
    const height = Math.max(1, ...cells.map((lines) => lines.length)) * BODY.leading + 2 * TABLE_PAD
    L.ensure(height)
    const top = L.top
    cells.forEach((lines, i) => {
      const x = MARGIN.x + i * width
      L.page.ops.push({ kind: "box", x, top, width, height })
      lines.forEach((line, j) => {
        L.writeLine(line, x + TABLE_PAD, top + TABLE_PAD + j * BODY.leading, BODY.size)
      })
    })
    L.top = top + height
  }
}

function layoutSignatureBlock(
  L: Layout,
  block: SignatureBlock,
  words: (n: InlineNode[]) => Word[],
) {
  // Measure first so the whole block moves to the next page if it doesn't fit. A checkbox's label
  // is the statement being ticked: body text beside the box, wrapped.
  const parts = block.content.map((c) => {
    if (c.type === "paragraph") {
      return { kind: "text" as const, lines: L.lines(words(c.content), BODY.size, L.contentWidth) }
    }
    const size = FIELD_SIZES[c.attrs.fieldType]
    const label = c.attrs.label ?? FIELD_LABELS[c.attrs.fieldType]
    if (c.attrs.fieldType === "CHECKBOX") {
      const lines = L.lines(
        words([{ type: "text", text: label }]),
        BODY.size,
        L.contentWidth - size.width - CHECKBOX_GAP,
      )
      const height = Math.max(size.height, lines.length * BODY.leading) + FIELD_LABEL.after
      return { kind: "checkbox" as const, attrs: c.attrs, size, lines, height }
    }
    const height = size.height + 2 * FIELD_LABEL.gap + FIELD_LABEL.size + FIELD_LABEL.after
    return { kind: "field" as const, attrs: c.attrs, size, label, height }
  })
  const height =
    BODY.leading +
    parts.reduce((h, p) => h + (p.kind === "text" ? p.lines.length * BODY.leading : p.height), 0)
  L.top += BODY.leading // breathing room above the block
  L.ensure(height)
  const field = (attrs: (typeof parts)[number] & { kind: "field" | "checkbox" }) => ({
    id: attrs.attrs.id,
    roleKey: block.attrs.roleKey,
    fieldType: attrs.attrs.fieldType,
    required: attrs.attrs.required,
    label: attrs.attrs.label,
  })
  for (const p of parts) {
    if (p.kind === "text") {
      L.writeLines(p.lines, MARGIN.x, BODY.size, BODY.leading)
      continue
    }
    if (p.kind === "checkbox") {
      L.addField(field(p), MARGIN.x, p.size)
      p.lines.forEach((line, i) => {
        // The first line's text sits level with the box.
        L.writeLine(
          line,
          MARGIN.x + p.size.width + CHECKBOX_GAP,
          L.top + i * BODY.leading,
          BODY.size,
        )
      })
      L.top += p.height
      continue
    }
    L.top += FIELD_LABEL.gap
    L.addField(field(p), MARGIN.x, p.size)
    L.top += p.size.height + FIELD_LABEL.gap
    L.page.ops.push({
      kind: "text",
      x: MARGIN.x,
      top: L.top,
      text: p.label,
      size: FIELD_LABEL.size,
      style: plain,
      muted: true,
    })
    L.top += FIELD_LABEL.size + FIELD_LABEL.after
  }
}

/**
 * Initials on every page: for each signer who initials every page, an initials box in the bottom
 * margin of every page, right-aligned in role order, labelled under it.
 */
function placePageInitials(
  L: Layout,
  data: GeneratedDocumentData,
  size: readonly [number, number],
) {
  const roles = data.roles.filter((r) => r.recipientRole === "SIGNER" && r.initialsOnEveryPage)
  if (roles.length > MAX_PAGE_INITIALS) {
    throw new ComposeError(`At most ${MAX_PAGE_INITIALS} signers can initial every page`)
  }
  const box = FIELD_SIZES.INITIALS
  const bottom = size[1] - PAGE_INITIALS.y - box.height
  L.pages.forEach((page, i) => {
    roles.forEach((role, j) => {
      const x = size[0] - MARGIN.x - (roles.length - j) * box.width - (roles.length - 1 - j) * 10
      L.fields.push({
        id: `${role.key}_initials_p${i + 1}`,
        roleKey: role.key,
        fieldType: "INITIALS",
        required: true,
        label: "Initials",
        page: i + 1,
        rect: { x, y: PAGE_INITIALS.y, width: box.width, height: box.height },
      })
      page.ops.push(fieldMark("INITIALS", x, bottom, box))
      page.ops.push({
        kind: "text",
        x,
        top: bottom + box.height + FIELD_LABEL.gap,
        text: sanitizeForFont(`Initials: ${role.label}`, L.font(plain)),
        size: FIELD_LABEL.size,
        style: plain,
        muted: true,
      })
    })
  })
  return roles.length > 0
}

// ── Drawing ──────────────────────────────────────────────────────────────────
function draw(page: PDFPage, ops: Op[], fonts: Fonts, height: number) {
  for (const op of ops) {
    if (op.kind === "box") {
      page.drawRectangle({
        x: op.x,
        y: height - op.top - op.height,
        width: op.width,
        height: op.height,
        borderColor: RULE,
        borderWidth: 0.5,
      })
      continue
    }
    if (op.kind === "rule") {
      page.drawLine({
        start: { x: op.x, y: height - op.top },
        end: { x: op.x + op.width, y: height - op.top },
        thickness: 0.75,
        color: RULE,
      })
      continue
    }
    const font = fontFor(fonts, op.style)
    // `top` is the top of the line box; the baseline sits one cap height below.
    const baseline = height - op.top - op.size
    const width = font.widthOfTextAtSize(op.text, op.size)
    if (op.style.blank) {
      page.drawRectangle({
        x: op.x - 1,
        y: baseline - op.size * 0.25,
        width: width + 2,
        height: op.size * 1.25,
        color: BLANK_FILL,
      })
    }
    page.drawText(op.text, {
      x: op.x,
      y: baseline,
      size: op.size,
      font,
      color: op.muted ? MUTED : INK,
    })
    if (op.style.underline) {
      page.drawLine({
        start: { x: op.x, y: baseline - 1.5 },
        end: { x: op.x + width, y: baseline - 1.5 },
        thickness: 0.6,
        color: INK,
      })
    }
  }
}

export async function composeGeneratedDocument(
  data: GeneratedDocumentData,
  opts: ComposeOptions,
): Promise<ComposedDocument> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  // Embedded in a fixed order: the object numbers, and so the bytes, must not vary between runs.
  const fonts: Fonts = {
    regular: await embedUnicodeFont(doc, "regular"),
    bold: await embedUnicodeFont(doc, "bold"),
    italic: await embedUnicodeFont(doc, "italic"),
    boldItalic: await embedUnicodeFont(doc, "boldItalic"),
  }
  const size = PAGE_SIZES[data.pageSize]
  const L = new Layout(fonts, size)
  const numbers = numberSections(data.content)

  const title = sanitizeForFont(data.title, fonts.bold)
  L.writeLines(
    L.lines([[{ text: title, style: { ...plain, bold: true } }]], TITLE.size, L.contentWidth),
    MARGIN.x,
    TITLE.size,
    TITLE.size * 1.3,
  )
  L.top += TITLE.after - TITLE.size * 0.3

  for (const section of data.content.content) {
    const n = numbers.get(section.attrs.id)
    const heading = sanitizeForFont(`${n ? `${n}. ` : ""}${section.attrs.title}`, fonts.bold)
    L.top += HEADING.before
    // Keep the heading with at least two lines of what follows.
    L.ensure(HEADING.size * 1.4 + HEADING.after + 2 * BODY.leading)
    L.writeLines(
      L.lines(
        heading.split(/\s+/).map((t) => [{ text: t, style: { ...plain, bold: true } }]),
        HEADING.size,
        L.contentWidth,
      ),
      MARGIN.x,
      HEADING.size,
      HEADING.size * 1.4,
    )
    L.top += HEADING.after
    for (const block of section.content) layoutBlock(L, block, data, opts, fonts)
  }

  // With initials in the bottom margin, the page number moves to the left so they never meet.
  const initials = placePageInitials(L, data, size)
  const pages: PageBox[] = []
  L.pages.forEach((p, i) => {
    const page = doc.addPage([size[0], size[1]])
    draw(page, p.ops, fonts, size[1])
    const footer = `Page ${i + 1} of ${L.pages.length}`
    page.drawText(footer, {
      x: initials ? MARGIN.x : (size[0] - fonts.regular.widthOfTextAtSize(footer, FOOTER.size)) / 2,
      y: FOOTER.y,
      size: FOOTER.size,
      font: fonts.regular,
      color: MUTED,
    })
    pages.push({ x: 0, y: 0, width: size[0], height: size[1], rotation: 0 })
  })

  doc.setTitle(title)
  doc.setProducer("Sahihi")
  doc.setCreator("Sahihi")
  doc.setCreationDate(opts.date)
  doc.setModificationDate(opts.date)
  return { bytes: await doc.save(), pages, fields: L.fields }
}
