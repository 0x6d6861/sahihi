import { xmlEvents } from "./xml"

/**
 * The run properties the import reads. `undefined` means "not set here", so a style inherits it
 * from the style it's based on. Bold, italic, caps and hidden are toggles (ECMA-376 §17.7.3).
 */
export interface RunProps {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  caps?: boolean
  hidden?: boolean
}

const TOGGLES = ["bold", "italic", "caps", "hidden"] as const

/** A paragraph's own numbering (`w:numPr`). `numId: "0"` switches inherited numbering off. */
export interface NumPr {
  numId?: string
  ilvl?: number
}

interface StyleDef {
  type: string
  name: string
  basedOn: string | null
  run: RunProps
  outline: number | null
  num: NumPr
  /** Table styles: the first row's run properties (`w:tblStylePr w:type="firstRow"`). */
  firstRowBold: boolean
}

/** The run property elements and the field each sets. */
const RUN_PROPS: Record<string, keyof RunProps> = {
  "w:b": "bold",
  "w:i": "italic",
  "w:u": "underline",
  "w:caps": "caps",
  "w:smallCaps": "caps",
  "w:vanish": "hidden",
}

/** Whether a toggle or underline element turns its property on (`w:val` absent means on). */
export function propOn(name: string, attrs: Record<string, string>): boolean {
  const v = attrs["w:val"]
  if (name === "w:u") return v !== "none"
  return v === undefined || !["0", "false", "off", "none"].includes(v)
}

/** Sets `props` from one run property element; false for elements the import doesn't read. */
export function readRunProp(props: RunProps, name: string, attrs: Record<string, string>): boolean {
  const field = RUN_PROPS[name]
  if (!field) return false
  // Small capitals read as capitals; an explicit `w:caps` off doesn't undo `w:smallCaps` on.
  if (name === "w:smallCaps" && !propOn(name, attrs)) return true
  props[field] = propOn(name, attrs)
  return true
}

/**
 * Word's styles part, resolved: which styles are headings, their numbering, and the run
 * properties paragraph and character styles give their text, following `basedOn` chains.
 */
export class DocxStyles {
  private readonly styles = new Map<string, StyleDef>()
  private readonly defaults: RunProps = {}
  private defaultParagraph: string | null = null
  private readonly runCache = new Map<string, RunProps>()

  constructor(xml: string | null) {
    if (xml) this.parse(xml)
  }

  private parse(xml: string) {
    let style: StyleDef | null = null
    let id: string | null = null
    let inDefaults = false
    let inRunProps = false
    let inParaProps = false
    let firstRow = false
    for (const e of xmlEvents(xml)) {
      if (e.kind === "open") {
        switch (e.name) {
          case "w:rPrDefault":
            inDefaults = true
            break
          case "w:style":
            id = e.attrs["w:styleId"] ?? null
            style = {
              type: e.attrs["w:type"] ?? "paragraph",
              name: "",
              basedOn: null,
              run: {},
              outline: null,
              num: {},
              firstRowBold: false,
            }
            if (
              id &&
              style.type === "paragraph" &&
              ["1", "true"].includes(e.attrs["w:default"] ?? "")
            ) {
              this.defaultParagraph = id
            }
            break
          case "w:tblStylePr":
            firstRow = e.attrs["w:type"] === "firstRow"
            break
          case "w:name":
            if (style) style.name = (e.attrs["w:val"] ?? "").toLowerCase()
            break
          case "w:basedOn":
            if (style) style.basedOn = e.attrs["w:val"] ?? null
            break
          case "w:rPr":
            inRunProps = true
            break
          case "w:pPr":
            inParaProps = true
            break
          case "w:outlineLvl":
            if (style && inParaProps && !firstRow) style.outline = Number(e.attrs["w:val"])
            break
          case "w:numId":
            if (style && inParaProps && !firstRow) style.num.numId = e.attrs["w:val"]
            break
          case "w:ilvl":
            if (style && inParaProps && !firstRow) style.num.ilvl = Number(e.attrs["w:val"]) || 0
            break
          default:
            if (!inRunProps) break
            if (inDefaults) readRunProp(this.defaults, e.name, e.attrs)
            else if (style && firstRow) {
              if (e.name === "w:b") style.firstRowBold = propOn(e.name, e.attrs)
            } else if (style) readRunProp(style.run, e.name, e.attrs)
        }
      } else if (e.kind === "close") {
        switch (e.name) {
          case "w:rPrDefault":
            inDefaults = false
            break
          case "w:style":
            if (style && id) this.styles.set(id, style)
            style = null
            id = null
            break
          case "w:tblStylePr":
            firstRow = false
            break
          case "w:rPr":
            inRunProps = false
            break
          case "w:pPr":
            inParaProps = false
            break
        }
      }
    }
  }

  /** The style a paragraph with no `w:pStyle` has (usually "Normal"). */
  paragraphStyle(id: string | null): string | null {
    return id ?? this.defaultParagraph
  }

  /** The style and the styles it's based on, nearest first (a cycle is cut). */
  private chain(id: string | null): StyleDef[] {
    const out: StyleDef[] = []
    const seen = new Set<string>()
    let at = id
    while (at && !seen.has(at) && out.length < 20) {
      seen.add(at)
      const def = this.styles.get(at)
      if (!def) break
      out.push(def)
      at = def.basedOn
    }
    return out
  }

  /** A style's run properties with the ones it inherits (nearest setting wins). */
  runProps(id: string | null): RunProps {
    if (!id) return {}
    const cached = this.runCache.get(id)
    if (cached) return cached
    const props: RunProps = {}
    for (const def of this.chain(id)) {
      for (const key of Object.keys(def.run) as (keyof RunProps)[]) {
        if (props[key] === undefined) props[key] = def.run[key]
      }
    }
    this.runCache.set(id, props)
    return props
  }

  /**
   * A run's effective properties: document defaults, then the paragraph style and the character
   * style (toggles that both set cancel out, as in Word), then the run's own formatting.
   */
  effective(paragraphStyle: string | null, runStyle: string | null, direct: RunProps): RunProps {
    const para = this.runProps(this.paragraphStyle(paragraphStyle))
    const char = this.runProps(runStyle)
    const out: RunProps = {}
    for (const key of TOGGLES) {
      const styled =
        para[key] === undefined && char[key] === undefined
          ? this.defaults[key]
          : (para[key] ?? false) !== (char[key] ?? false)
      out[key] = direct[key] ?? styled ?? false
    }
    out.underline = direct.underline ?? char.underline ?? para.underline ?? this.defaults.underline
    return out
  }

  /**
   * The heading level a paragraph style gives (0 for the title, 1–9), or undefined. Built-in
   * heading styles keep their English name whatever the document's language; custom styles based
   * on one, or with an outline level, count too.
   */
  headingLevel(id: string | null): number | undefined {
    for (const def of this.chain(id)) {
      const heading = /^heading\s*(\d)$/.exec(def.name)
      if (heading) return Number(heading[1])
      if (def.name === "title") return 0
      if (def.outline !== null && def.outline >= 0 && def.outline < 9) return def.outline + 1
    }
    return undefined
  }

  /** The numbering a paragraph style gives (List Number, List Bullet, numbered headings…). */
  numbering(id: string | null): NumPr {
    const num: NumPr = {}
    for (const def of this.chain(this.paragraphStyle(id))) {
      if (num.numId === undefined && def.num.numId !== undefined) num.numId = def.num.numId
      if (num.ilvl === undefined && def.num.ilvl !== undefined) num.ilvl = def.num.ilvl
    }
    return num
  }

  /** Whether a table style makes the first row bold (when the table turns that look on). */
  firstRowBold(id: string | null): boolean {
    return this.chain(id).some((def) => def.firstRowBold)
  }
}
