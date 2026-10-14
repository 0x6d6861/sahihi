import { spawn } from "node:child_process"
import type { EventEmitter } from "node:events"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"

/**
 * Word → PDF with LibreOffice (ADR 0052, docs/pdf-pipeline.md → Word uploads). The worker runs it
 * on a Word file a sender uploaded, so the file is untrusted:
 *
 * - `sanitizeDocx` first: links that would make LibreOffice fetch something (linked images,
 *   templates, OLE links, INCLUDEPICTURE / INCLUDETEXT / DDE fields) are removed, macros refused,
 *   and the unzipped size capped. A file with tracked changes is refused: LibreOffice prints them
 *   with their markup, deleted text included, and what's signed must be one clear version;
 * - LibreOffice runs headless with a fresh profile per conversion (macros off, links from
 *   documents blocked), an environment with no secrets in it, and a time limit after which its
 *   whole process group is killed.
 */

export type ConversionErrorCode =
  /** Not a Word file, an old .doc, a password-protected file, or one with macros. */
  | "unsupported"
  /** It still has tracked changes: LibreOffice would print both versions. */
  | "tracked_changes"
  /** LibreOffice couldn't make a PDF from it. */
  | "failed"
  /** It took longer than the limit. */
  | "timeout"
  /** The PDF it made is over the upload limit. */
  | "too_large"
  /** LibreOffice isn't installed on this worker. */
  | "unavailable"

const MESSAGES: Record<ConversionErrorCode, string> = {
  unsupported:
    "This isn't a Word document Sahihi can convert. Save it as .docx without a password or macros, or upload a PDF.",
  tracked_changes:
    "This Word document still has tracked changes. Accept or reject them in Word (Review → Accept or Reject), then upload it again.",
  failed: "This Word document couldn't be converted. Save it as a PDF and upload that instead.",
  timeout: "Converting this Word document took too long. Save it as a PDF and upload that instead.",
  too_large: "The PDF made from this Word document is larger than 25 MB.",
  unavailable: "Word documents can't be converted right now. Upload a PDF instead.",
}

export class ConversionError extends Error {
  constructor(
    readonly code: ConversionErrorCode,
    detail?: string,
  ) {
    super(MESSAGES[code])
    this.name = "ConversionError"
    if (detail) this.cause = detail
  }
}

/** Unzipped, a Word file may hold at most this much (a zip bomb is refused before LibreOffice). */
const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024
const MAX_ENTRIES = 5_000
const MAX_PDF_BYTES = 25 * 1024 * 1024

/** External relationships that only label something (a hyperlink); everything else is fetched. */
const HYPERLINK_TYPE = /\/hyperlink$/

/** Tracked insertions, deletions, moves and formatting changes. */
const TRACKED_CHANGE =
  /<w:(ins|del|moveFrom|moveTo|rPrChange|pPrChange|tblPrChange|trPrChange|tcPrChange|sectPrChange|numberingChange)\b/

/** Parts of the document that are printed: the body, headers, footers, notes. */
const PRINTED_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/

/** Field instructions that pull content in from a path or URL. */
const FETCHING_FIELDS = /^\s*(INCLUDEPICTURE|INCLUDETEXT|INCLUDE|IMPORT|LINK|DDE|DDEAUTO)\b/i

/**
 * The Word file, made safe to open: external relationships other than hyperlinks dropped, fields
 * that fetch content blanked (their last shown result stays), and macro-enabled files refused.
 * Throws `ConversionError`: `unsupported` for anything that isn't a plain .docx,
 * `tracked_changes` while changes are still tracked.
 */
export function sanitizeDocx(bytes: Uint8Array): Uint8Array {
  // An OLE compound file: a password-protected .docx or an old .doc.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new ConversionError("unsupported", "OLE compound file (encrypted .docx or .doc)")
  }
  let files: Record<string, Uint8Array>
  let total = 0
  let entries = 0
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        entries++
        total += f.originalSize
        if (entries > MAX_ENTRIES || total > MAX_UNZIPPED_BYTES) throw new Error("too big")
        return true
      },
    })
  } catch {
    throw new ConversionError("unsupported", "not a readable ZIP, or too big unzipped")
  }
  if (!files["word/document.xml"]) throw new ConversionError("unsupported", "no Word body")
  const types = files["[Content_Types].xml"] ? strFromU8(files["[Content_Types].xml"]) : ""
  if (/macroEnabled/i.test(types) || Object.keys(files).some((n) => /vbaProject\.bin$/i.test(n))) {
    throw new ConversionError("unsupported", "macro-enabled")
  }
  for (const name of Object.keys(files)) {
    if (PRINTED_PART.test(name) && TRACKED_CHANGE.test(strFromU8(files[name] as Uint8Array))) {
      throw new ConversionError("tracked_changes")
    }
  }
  for (const name of Object.keys(files)) {
    const part = files[name] as Uint8Array
    if (name.endsWith(".rels")) files[name] = strToU8(dropExternalLinks(strFromU8(part)))
    else if (/^word\/[^/]+\.xml$/.test(name))
      files[name] = strToU8(blankFetchingFields(strFromU8(part)))
  }
  return zipSync(files, { level: 6 })
}

/** A relationships part without its external targets, hyperlinks aside. */
export function dropExternalLinks(xml: string): string {
  return xml.replace(
    /<Relationship\b[^>]*?\/>|<Relationship\b[^>]*?>[\s\S]*?<\/Relationship>/g,
    (rel) => {
      if (!/TargetMode\s*=\s*["']External["']/i.test(rel)) return rel
      const type = /Type\s*=\s*["']([^"']*)["']/.exec(rel)?.[1] ?? ""
      return HYPERLINK_TYPE.test(type) ? rel : ""
    },
  )
}

/** A part with its fetching fields' instructions blanked (simple and complex fields). */
export function blankFetchingFields(xml: string): string {
  return xml
    .replace(/(<w:instrText\b[^>]*>)([\s\S]*?)(<\/w:instrText>)/g, (whole, open, code, close) =>
      FETCHING_FIELDS.test(code) ? `${open} ${close}` : whole,
    )
    .replace(/(<w:fldSimple\b[^>]*?\bw:instr=")([^"]*)(")/g, (whole, start, code, end) =>
      FETCHING_FIELDS.test(code) ? `${start} ${end}` : whole,
    )
}

/**
 * LibreOffice's user profile for one conversion: macros never run, documents can't load linked
 * content, no first-start or recovery dialogs.
 */
const PROFILE = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="FirstRun" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Recovery/RecoveryInfo"><prop oor:name="Enabled" oor:op="fuse"><value>false</value></prop></item>
</oor:items>
`

export interface ConvertOptions {
  /** LibreOffice's command (`LIBREOFFICE_PATH`). */
  command: string
  /** Kill it after this long. Default 90 s. */
  timeoutMs?: number
}

/**
 * Converts a Word file to a PDF with LibreOffice. Throws `ConversionError`; every other error is
 * the machine's (disk, spawn) and worth a retry.
 */
export async function convertDocxToPdf(
  bytes: Uint8Array,
  { command, timeoutMs = 90_000 }: ConvertOptions,
): Promise<Uint8Array> {
  const safe = sanitizeDocx(bytes)
  const dir = await mkdtemp(join(tmpdir(), "sahihi-convert-"))
  try {
    const input = join(dir, "document.docx")
    const out = join(dir, "out")
    const profile = join(dir, "profile")
    await mkdir(join(profile, "user"), { recursive: true })
    await mkdir(out)
    await writeFile(join(profile, "user", "registrymodifications.xcu"), PROFILE)
    await writeFile(input, safe)
    await run(
      command,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        "--nodefault",
        "--nologo",
        `-env:UserInstallation=file://${profile}`,
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        out,
        input,
      ],
      dir,
      timeoutMs,
    )
    const pdf = join(out, "document.pdf")
    const info = await stat(pdf).catch(() => null)
    if (!info?.size) throw new ConversionError("failed", "LibreOffice made no PDF")
    if (info.size > MAX_PDF_BYTES) throw new ConversionError("too_large")
    return new Uint8Array(await readFile(pdf))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Runs LibreOffice in its own process group with a clean environment; kills the group on timeout. */
function run(command: string, args: string[], home: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: home,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
      // Nothing from the worker's environment (database URL, keys) reaches LibreOffice. A fixed
      // PATH: set LIBREOFFICE_PATH to an absolute path when it's installed somewhere else.
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: home,
        TMPDIR: home,
        LANG: "C.UTF-8",
        SAL_USE_VCLPLUGIN: "svp",
      },
    })
    // The typings here lack ChildProcess's EventEmitter side.
    const events = child as unknown as EventEmitter
    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 4_000) stderr += chunk.toString()
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child.pid)
    }, timeoutMs)
    events.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        err.code === "ENOENT" || err.code === "EACCES"
          ? new ConversionError("unavailable", `${command}: ${err.code}`)
          : err,
      )
    })
    events.on("close", (code: number | null) => {
      clearTimeout(timer)
      // LibreOffice can leave helpers behind; the group goes with it.
      killGroup(child.pid)
      if (timedOut) reject(new ConversionError("timeout"))
      else if (code !== 0) reject(new ConversionError("failed", `exit ${code}: ${stderr.trim()}`))
      else resolve()
    })
  })
}

function killGroup(pid: number | undefined) {
  if (!pid) return
  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    // Already gone.
  }
}
