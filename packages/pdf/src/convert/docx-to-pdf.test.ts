import { describe, expect, test } from "bun:test"
import { chmod, mkdtemp, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { docx } from "../import/docx-fixture"
import { inspectPdf } from "../parse/inspect"
import { readPageText } from "../parse/page-text"
import {
  blankFetchingFields,
  ConversionError,
  convertDocxToPdf,
  dropExternalLinks,
  sanitizeDocx,
} from "./docx-to-pdf"

const soffice = Bun.which("soffice")

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return "ok"
  } catch (err) {
    return err instanceof ConversionError ? err.code : String(err)
  }
}

const IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
const LINK = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"

/** A Word file that tries to fetch from `url`: a linked image, and an INCLUDEPICTURE field. */
function fetchingDocx(url: string): Uint8Array {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  const r = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  const body = [
    `<w:p><w:r><w:t>Hello from Word</w:t></w:r></w:p>`,
    `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> INCLUDEPICTURE "${url}/field.png" \\d </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>picture</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`,
    `<w:p><w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" style="width:20pt;height:20pt"><v:imagedata r:id="rIdImg"/></v:shape></w:pict></w:r></w:p>`,
  ].join("")
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${w} ${r}><w:body>${body}</w:body></w:document>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg" Type="${IMAGE}" Target="${url}/linked.png" TargetMode="External"/><Relationship Id="rIdLink" Type="${LINK}" Target="https://example.com" TargetMode="External"/></Relationships>`,
    ),
  })
}

describe("sanitizeDocx", () => {
  test("drops fetched external links, keeps hyperlinks and internal parts", () => {
    const xml = `<Relationships><Relationship Id="a" Type="${IMAGE}" Target="http://x/a.png" TargetMode="External"/><Relationship Id="b" Type="${LINK}" Target="https://example.com" TargetMode="External"/><Relationship Id="c" Type="${IMAGE}" Target="media/image1.png"/></Relationships>`
    const out = dropExternalLinks(xml)
    expect(out).not.toContain("http://x/a.png")
    expect(out).toContain("https://example.com")
    expect(out).toContain("media/image1.png")
  })

  test("blanks fields that pull content in, leaves the rest", () => {
    const xml = `<w:instrText xml:space="preserve"> INCLUDETEXT "c:\\\\secret.txt" </w:instrText><w:instrText> PAGE </w:instrText><w:fldSimple w:instr=" DDEAUTO excel x "><w:r><w:t>5</w:t></w:r></w:fldSimple>`
    const out = blankFetchingFields(xml)
    expect(out).not.toContain("INCLUDETEXT")
    expect(out).not.toContain("DDEAUTO")
    expect(out).toContain(" PAGE ")
    expect(out).toContain("<w:t>5</w:t>")
  })

  test("the cleaned file keeps its body", () => {
    const files = unzipSync(sanitizeDocx(fetchingDocx("http://127.0.0.1:9")))
    expect(strFromU8(files["word/document.xml"] as Uint8Array)).toContain("Hello from Word")
    expect(strFromU8(files["word/_rels/document.xml.rels"] as Uint8Array)).not.toContain(
      "127.0.0.1",
    )
    expect(strFromU8(files["word/document.xml"] as Uint8Array)).not.toContain("INCLUDEPICTURE")
  })

  test("refuses a file with tracked changes, in the body or a header", async () => {
    const reject = async (bytes: Uint8Array) =>
      code(Promise.resolve().then(() => sanitizeDocx(bytes)))
    const tracked = `<w:p><w:del w:id="1" w:author="A"><w:r><w:delText>old</w:delText></w:r></w:del></w:p>`
    expect(await reject(docx(tracked))).toBe("tracked_changes")
    const header = zipSync({
      "word/document.xml": strToU8("<w:document><w:body/></w:document>"),
      "word/header1.xml": strToU8(
        '<w:hdr><w:p><w:ins w:id="2"><w:r><w:t>new</w:t></w:r></w:ins></w:p></w:hdr>',
      ),
    })
    expect(await reject(header)).toBe("tracked_changes")
    // Look-alike elements aren't changes.
    const table = `<w:tbl><w:tblPr><w:tblBorders><w:insideH w:val="single"/></w:tblBorders></w:tblPr></w:tbl>`
    expect(await reject(docx(table))).toBe("ok")
  })

  test("refuses what isn't a plain Word file", async () => {
    const reject = async (bytes: Uint8Array) =>
      code(Promise.resolve().then(() => sanitizeDocx(bytes)))
    expect(await reject(strToU8("not a zip"))).toBe("unsupported")
    expect(await reject(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))).toBe("unsupported")
    expect(await reject(zipSync({ "a.txt": strToU8("hi") }))).toBe("unsupported")
    const macro = zipSync({
      "word/document.xml": strToU8("<w:document/>"),
      "word/vbaProject.bin": new Uint8Array([1]),
    })
    expect(await reject(macro)).toBe("unsupported")
  })
})

describe("convertDocxToPdf", () => {
  test("a missing LibreOffice is 'unavailable'", async () => {
    expect(await code(convertDocxToPdf(docx("<w:p/>"), { command: "/nonexistent/soffice" }))).toBe(
      "unavailable",
    )
  })

  test("a conversion that hangs is killed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sahihi-test-"))
    const slow = join(dir, "slow.sh")
    await writeFile(slow, "#!/bin/sh\nsleep 30\n")
    await chmod(slow, 0o755)
    const started = Date.now()
    expect(await code(convertDocxToPdf(docx("<w:p/>"), { command: slow, timeoutMs: 300 }))).toBe(
      "timeout",
    )
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  test.skipIf(!soffice)(
    "makes a PDF with the document's words, and fetches nothing",
    async () => {
      const hits: string[] = []
      const server = createServer((req, res) => {
        hits.push(req.url ?? "")
        res.statusCode = 404
        res.end()
      })
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      const port = (server.address() as { port: number }).port
      try {
        const pdf = await convertDocxToPdf(fetchingDocx(`http://127.0.0.1:${port}`), {
          command: soffice as string,
        })
        expect((await inspectPdf(pdf)).pageCount).toBe(1)
        const [page] = await readPageText(pdf)
        expect(page?.text).toContain("Hello from Word")
        expect(hits).toEqual([])
      } finally {
        server.close()
      }
    },
    60_000,
  )
})
