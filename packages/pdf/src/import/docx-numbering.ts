import type { DocxStyles } from "./docx-styles"
import { xmlEvents } from "./xml"

interface Level {
  start: number
  format: string
  text: string
  /** Legal numbering: every level's number shows as a decimal ("1.1.1", not "1.a.i"). */
  legal: boolean
  /** The paragraph style this level is linked to (Word's numbered headings). */
  style: string | null
}

interface AbstractNum {
  levels: Map<number, Level>
  /** Numbering defined by a numbering style: its levels live in that style's list. */
  styleLink: string | null
}

interface Num {
  abstractId: string
  starts: Map<number, number>
  levels: Map<number, Level>
}

/** A numbered paragraph's label as Word prints it, and whether it's a bullet. */
export interface NumberLabel {
  label: string
  bullet: boolean
}

/**
 * Word's numbering part (`word/numbering.xml`): lists, their levels and formats. `next` counts in
 * document order, the way Word does, and returns the label Word prints ("3.", "2.1", "(a)", "ii)").
 * Lists sharing a definition continue one count unless a list restarts it (`w:startOverride`).
 */
export class DocxNumbering {
  private readonly abstracts = new Map<string, AbstractNum>()
  private readonly nums = new Map<string, Num>()
  private readonly counters = new Map<string, number[]>()

  constructor(
    xml: string | null,
    private readonly styles: DocxStyles,
  ) {
    if (xml) this.parse(xml)
  }

  private parse(xml: string) {
    let abstract: AbstractNum | null = null
    let num: Num | null = null
    let level: Level | null = null
    let levelIndex = 0
    let overrideIndex: number | null = null
    for (const e of xmlEvents(xml)) {
      if (e.kind === "open") {
        const val = e.attrs["w:val"] ?? ""
        switch (e.name) {
          case "w:abstractNum":
            abstract = { levels: new Map(), styleLink: null }
            this.abstracts.set(e.attrs["w:abstractNumId"] ?? "", abstract)
            break
          case "w:num":
            num = { abstractId: "", starts: new Map(), levels: new Map() }
            this.nums.set(e.attrs["w:numId"] ?? "", num)
            break
          case "w:abstractNumId":
            if (num) num.abstractId = val
            break
          case "w:numStyleLink":
            if (abstract) abstract.styleLink = val
            break
          case "w:lvlOverride":
            overrideIndex = Number(e.attrs["w:ilvl"]) || 0
            break
          case "w:startOverride":
            if (num && overrideIndex !== null) num.starts.set(overrideIndex, Number(val) || 0)
            break
          case "w:lvl":
            levelIndex = Number(e.attrs["w:ilvl"]) || 0
            level = { start: 1, format: "decimal", text: "", legal: false, style: null }
            break
          case "w:start":
            if (level) level.start = Number(val) || 0
            break
          case "w:numFmt":
            if (level) level.format = val
            break
          case "w:lvlText":
            if (level) level.text = val
            break
          case "w:isLgl":
            if (level) level.legal = val !== "0" && val !== "false"
            break
          case "w:pStyle":
            if (level) level.style = val
            break
        }
      } else if (e.kind === "close") {
        switch (e.name) {
          case "w:abstractNum":
            abstract = null
            break
          case "w:num":
            num = null
            break
          case "w:lvlOverride":
            overrideIndex = null
            break
          case "w:lvl":
            if (level) {
              // A level inside a list's override replaces the definition's level.
              if (num && overrideIndex !== null) num.levels.set(overrideIndex, level)
              else abstract?.levels.set(levelIndex, level)
            }
            level = null
            break
        }
      }
    }
  }

  /** The definition a list uses, following a numbering style link once. */
  private abstractOf(numId: string): { id: string; def: AbstractNum } | null {
    const num = this.nums.get(numId)
    if (!num) return null
    let id = num.abstractId
    let def = this.abstracts.get(id)
    if (def?.styleLink) {
      const linked = this.styles.numbering(def.styleLink).numId
      const target = linked ? this.nums.get(linked) : undefined
      const targetDef = target ? this.abstracts.get(target.abstractId) : undefined
      if (target && targetDef) {
        id = target.abstractId
        def = targetDef
      }
    }
    return def ? { id, def } : null
  }

  /** The level a style-linked list uses for a paragraph style (Heading 2 → level 1). */
  levelForStyle(numId: string, style: string | null): number | undefined {
    if (!style) return undefined
    const found = this.abstractOf(numId)
    if (!found) return undefined
    for (const [index, level] of found.def.levels) if (level.style === style) return index
    return undefined
  }

  private level(numId: string, ilvl: number): Level | undefined {
    return this.nums.get(numId)?.levels.get(ilvl) ?? this.abstractOf(numId)?.def.levels.get(ilvl)
  }

  /** Counts one paragraph of list `numId` at level `ilvl`; null when the list doesn't exist. */
  next(numId: string, ilvl: number): NumberLabel | null {
    const found = this.abstractOf(numId)
    const num = this.nums.get(numId)
    if (!found || !num) return null
    const lvl = Math.max(0, Math.min(8, ilvl))
    const level = this.level(numId, lvl)
    if (!level) return null
    // A list that restarts the count keeps its own; the rest share their definition's.
    const key = num.starts.size > 0 ? `num:${numId}` : `abstract:${found.id}`
    const counts = this.counters.get(key) ?? []
    this.counters.set(key, counts)
    const start = (i: number) => num.starts.get(i) ?? this.level(numId, i)?.start ?? 1
    counts[lvl] = counts[lvl] === undefined ? start(lvl) : (counts[lvl] as number) + 1
    counts.length = lvl + 1
    if (level.format === "bullet") return { label: "•", bullet: true }
    const label = level.text.replace(/%([1-9])/g, (_, d: string) => {
      const i = Number(d) - 1
      const count = counts[i] ?? start(i)
      const format = level.legal ? "decimal" : (this.level(numId, i)?.format ?? "decimal")
      return formatNumber(count, format)
    })
    return { label: label.trim(), bullet: false }
  }
}

/** A count in one of Word's number formats; uncommon formats fall back to decimal. */
export function formatNumber(n: number, format: string): string {
  switch (format) {
    case "none":
      return ""
    case "decimalZero":
      return n < 10 ? `0${n}` : String(n)
    case "lowerLetter":
      return letters(n)
    case "upperLetter":
      return letters(n).toUpperCase()
    case "lowerRoman":
      return roman(n).toLowerCase()
    case "upperRoman":
      return roman(n)
    case "ordinal":
      return `${n}${ordinalSuffix(n)}`
    default:
      return String(n)
  }
}

/** Word's letters: a…z, then aa…zz, then aaa… (the letter repeats, it doesn't carry). */
function letters(n: number): string {
  if (n <= 0) return String(n)
  const letter = String.fromCharCode(97 + ((n - 1) % 26))
  return letter.repeat(Math.floor((n - 1) / 26) + 1)
}

function roman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n)
  const table: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ]
  let out = ""
  let rest = n
  for (const [value, symbol] of table) {
    while (rest >= value) {
      out += symbol
      rest -= value
    }
  }
  return out
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th"
  return ["th", "st", "nd", "rd"][n % 10] ?? "th"
}
