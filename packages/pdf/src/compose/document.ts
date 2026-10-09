import type {
  BlockNode,
  GeneratedDocumentData,
  GeneratedFieldType,
  InlineNode,
  PageBox,
  PdfRect,
  SignatureBlock,
} from "@sahihi/core"
import { numberSections } from "@sahihi/core"
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib"
import { embedUnicodeFonts, type UnicodeFonts } from "../text/fonts"
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
type Style = { bold: boolean; underline: boolean; blank: boolean }
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
    private readonly fonts: UnicodeFonts,
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
    return style.bold ? this.fonts.bold : this.fonts.regular
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
    const space = this.fonts.regular.widthOfTextAtSize(" ", size)
    for (const line of lines) {
      this.ensure(leading)
      let cx = x
      line.forEach((word, i) => {
        if (i > 0) cx += space
        for (const seg of word) {
          this.page.ops.push({
            kind: "text",
            x: cx,
            top: this.top,
            text: seg.text,
            size,
            style: seg.style,
          })
          cx += this.font(seg.style).widthOfTextAtSize(seg.text, size)
        }
      })
      this.top += leading
    }
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
    // Signing line along the bottom edge; the label goes under it, outside the box, so a stamped
    // signature never covers it.
    this.page.ops.push({ kind: "rule", x, top: this.top + size.height, width: size.width })
  }
}

const plain: Style = { bold: false, underline: false, blank: false }

function toWords(
  nodes: InlineNode[],
  data: GeneratedDocumentData,
  allowUnresolved: boolean,
): Word[] {
  const segments: Segment[] = []
  for (const n of nodes) {
    const style: Style = {
      bold: n.marks?.some((m) => m.type === "bold") ?? false,
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

function sanitizeWords(words: Word[], fonts: UnicodeFonts): Word[] {
  return words.map((w) =>
    w.map((s) => ({
      ...s,
      text: sanitizeForFont(s.text, s.style.bold ? fonts.bold : fonts.regular),
    })),
  )
}

function layoutBlock(
  L: Layout,
  block: BlockNode,
  data: GeneratedDocumentData,
  opts: ComposeOptions,
  fonts: UnicodeFonts,
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
    case "signatureBlock":
      layoutSignatureBlock(L, block, words)
      return
  }
}

function layoutSignatureBlock(
  L: Layout,
  block: SignatureBlock,
  words: (n: InlineNode[]) => Word[],
) {
  // Measure first so the whole block moves to the next page if it doesn't fit.
  const parts = block.content.map((c) =>
    c.type === "paragraph"
      ? { kind: "text" as const, lines: L.lines(words(c.content), BODY.size, L.contentWidth) }
      : { kind: "field" as const, attrs: c.attrs, size: FIELD_SIZES[c.attrs.fieldType] },
  )
  const fieldHeight = (h: number) => h + FIELD_LABEL.gap + FIELD_LABEL.size + FIELD_LABEL.after
  const height =
    BODY.leading +
    parts.reduce(
      (h, p) =>
        h + (p.kind === "text" ? p.lines.length * BODY.leading : fieldHeight(p.size.height)),
      0,
    )
  L.top += BODY.leading // breathing room above the block
  L.ensure(height)
  for (const p of parts) {
    if (p.kind === "text") {
      L.writeLines(p.lines, MARGIN.x, BODY.size, BODY.leading)
      continue
    }
    L.top += FIELD_LABEL.gap
    L.addField(
      {
        id: p.attrs.id,
        roleKey: block.attrs.roleKey,
        fieldType: p.attrs.fieldType,
        required: p.attrs.required,
        label: p.attrs.label,
      },
      MARGIN.x,
      p.size,
    )
    L.top += p.size.height + FIELD_LABEL.gap
    L.page.ops.push({
      kind: "text",
      x: MARGIN.x,
      top: L.top,
      text: p.attrs.label ?? FIELD_LABELS[p.attrs.fieldType],
      size: FIELD_LABEL.size,
      style: plain,
      muted: true,
    })
    L.top += FIELD_LABEL.size + FIELD_LABEL.after
  }
}

// ── Drawing ──────────────────────────────────────────────────────────────────
function draw(page: PDFPage, ops: Op[], fonts: UnicodeFonts, height: number) {
  for (const op of ops) {
    if (op.kind === "rule") {
      page.drawLine({
        start: { x: op.x, y: height - op.top },
        end: { x: op.x + op.width, y: height - op.top },
        thickness: 0.75,
        color: RULE,
      })
      continue
    }
    const font = op.style.bold ? fonts.bold : fonts.regular
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
  const fonts = await embedUnicodeFonts(doc)
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

  const pages: PageBox[] = []
  L.pages.forEach((p, i) => {
    const page = doc.addPage([size[0], size[1]])
    draw(page, p.ops, fonts, size[1])
    const footer = `Page ${i + 1} of ${L.pages.length}`
    page.drawText(footer, {
      x: (size[0] - fonts.regular.widthOfTextAtSize(footer, FOOTER.size)) / 2,
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
