import { beforeEach, describe, expect, test } from "bun:test"
import { createStorageRegistry, prisma } from "@sahihi/db"
import { configureStorage, keys, platformStorage } from "@sahihi/infra"
import { inspectPdf } from "@sahihi/pdf"
import { strToU8, zipSync } from "fflate"
import { convertDocument } from "../src/jobs/conversions"
import { sweepAbandonedUploads } from "../src/jobs/maintenance"

// Runs via `bun run test:integration` (apps/api/test/preload.ts sets a *_test DATABASE_URL).
if (!new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.endsWith("_test")) {
  throw new Error("Integration tests must run via `bun run test:integration` (needs a *_test DB)")
}

configureStorage(createStorageRegistry(prisma))
const soffice = Bun.which("soffice")
let orgId: string
let userId: string

beforeEach(async () => {
  const [db] = await prisma.$queryRaw<{ name: string }[]>`select current_database() as name`
  if (!db?.name.endsWith("_test")) throw new Error(`Refusing to truncate "${db?.name}"`)
  await prisma.$executeRawUnsafe(
    `truncate table "Document", "member", "organization", "user" restart identity cascade`,
  )
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      name: "Converter",
      email: `${crypto.randomUUID()}@example.test`,
    },
  })
  const org = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name: "Convert Ltd",
      slug: crypto.randomUUID(),
      createdAt: new Date(),
    },
  })
  userId = user.id
  orgId = org.id
})

function wordFile(text: string): Uint8Array {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${w}><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  })
}

/** A CONVERTING document with its Word upload waiting in storage. */
async function converting(bytes: Uint8Array | null, updatedAt?: Date) {
  const id = crypto.randomUUID()
  if (bytes)
    await platformStorage().put(keys.wordUpload(orgId, id), bytes, "application/octet-stream")
  const doc = await prisma.document.create({
    data: {
      id,
      organizationId: orgId,
      uploadedById: userId,
      name: "Lease.pdf",
      s3Key: keys.original(orgId, id),
      status: "CONVERTING",
      convertedFrom: "DOCX",
    },
  })
  if (updatedAt) {
    await prisma.$executeRaw`update "Document" set "updatedAt" = ${updatedAt} where id = ${id}`
  }
  return doc
}

describe("convertDocument", () => {
  test.skipIf(!soffice)(
    "makes the PDF, READY with its hash and pages, and removes the Word file",
    async () => {
      const doc = await converting(wordFile("Hello from Word"))
      const result = await convertDocument(doc.id, { isFinal: false })
      expect(result).toMatchObject({ converted: true, pages: 1 })
      const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
      expect(row.status).toBe("READY")
      expect(row.pageCount).toBe(1)
      const pdf = await platformStorage().get(row.s3Key)
      expect((await inspectPdf(pdf)).pageCount).toBe(1)
      expect(row.sizeBytes).toBe(pdf.byteLength)
      expect(await platformStorage().head(keys.wordUpload(orgId, doc.id))).toBeNull()
      // Again: nothing to do.
      expect(await convertDocument(doc.id, { isFinal: false })).toEqual({ skipped: true })
    },
    60_000,
  )

  test("a file that isn't Word fails at once, with the reason, and is removed", async () => {
    const doc = await converting(strToU8("not a zip at all"))
    expect(await convertDocument(doc.id, { isFinal: false })).toEqual({
      converted: false,
      reason: "unsupported",
    })
    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(row.status).toBe("FAILED")
    expect(row.failureReason).toContain("Save it as .docx")
    expect(await platformStorage().head(keys.wordUpload(orgId, doc.id))).toBeNull()
  })

  test("a missing upload fails the document", async () => {
    const doc = await converting(null)
    expect(await convertDocument(doc.id, { isFinal: false })).toEqual({
      converted: false,
      reason: "missing",
    })
    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(row.status).toBe("FAILED")
  })
})

describe("sweepAbandonedUploads: conversions", () => {
  test("a conversion waiting over an hour fails and its Word file goes", async () => {
    const now = new Date()
    const stuck = await converting(wordFile("x"), new Date(now.getTime() - 2 * 3_600_000))
    const fresh = await converting(wordFile("y"))
    expect(await sweepAbandonedUploads(now)).toEqual({ swept: 1 })
    const rows = await prisma.document.findMany({ select: { id: true, status: true } })
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      [stuck.id]: "FAILED",
      [fresh.id]: "CONVERTING",
    })
    expect(await platformStorage().head(keys.wordUpload(orgId, stuck.id))).toBeNull()
  })
})
