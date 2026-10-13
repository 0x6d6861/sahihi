import type { MarkType } from "../model"

/**
 * Importing a document into Drafting (docs/ai-documents.md → Import, ADR 0049). Readers (a PDF's
 * text, a Word file) turn a file into these blocks; `importContent` turns the blocks into a
 * generated document, word for word. Nothing here rewrites the text.
 */

/** A run of text with its emphasis. */
export interface ImportedRun {
  text: string
  marks?: MarkType[]
}

export type ImportedBlock =
  /**
   * A heading. `numbered`: the source numbered it ("3. Payment"); the number itself is dropped
   * from `text`, since sections are numbered by their position.
   */
  | { type: "heading"; level: number; text: string; numbered: boolean }
  | { type: "paragraph"; runs: ImportedRun[] }
  | { type: "listItem"; ordered: boolean; runs: ImportedRun[] }
  | { type: "table"; rows: ImportedRun[][][] }

/** A file larger than this is refused before it's read. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024
/**
 * At most this much text: the whole document goes into every assistant turn, so a longer one would
 * make each reply slow and costly.
 */
export const MAX_IMPORT_CHARS = 60_000

export const IMPORT_ERROR_CODES = [
  /** No text to import: a scanned PDF, or an empty file. */
  "no_text",
  "too_large",
  /** Password-protected or encrypted. */
  "encrypted",
  /** Not a PDF or a Word (.docx) file, or one that can't be read. */
  "unsupported",
] as const
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number]

const MESSAGES: Record<ImportErrorCode, string> = {
  no_text: "This file has no text to import. A scanned document needs text recognition first.",
  too_large: `This document is too long to draft with the assistant (over ${MAX_IMPORT_CHARS.toLocaleString("en")} characters, or 10 MB).`,
  encrypted: "This file is password-protected. Remove the password and try again.",
  unsupported: "Only PDF and Word (.docx) files can be imported.",
}

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(MESSAGES[code])
    this.name = "ImportError"
  }
}

/** All the text of some runs. */
export function runsText(runs: readonly ImportedRun[]): string {
  return runs.map((r) => r.text).join("")
}

/** How much text the blocks hold, for the size limit. */
export function blocksLength(blocks: readonly ImportedBlock[]): number {
  let n = 0
  for (const b of blocks) {
    if (b.type === "heading") n += b.text.length
    else if (b.type === "table") {
      for (const row of b.rows) for (const cell of row) n += runsText(cell).length
    } else n += runsText(b.runs).length
  }
  return n
}

/**
 * Blocks as plain text, one block per line: what a chat attachment gives the assistant. Headings
 * keep their place, list items get a bullet, table cells are joined with " | ".
 */
export function blocksToText(blocks: readonly ImportedBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "heading") return b.text
      if (b.type === "listItem") return `• ${runsText(b.runs)}`
      if (b.type === "table") {
        return b.rows
          .map((row) => row.map((cell) => runsText(cell).replace(/\n/g, " ")).join(" | "))
          .join("\n")
      }
      return runsText(b.runs)
    })
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}
