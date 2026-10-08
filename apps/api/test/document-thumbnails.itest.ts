import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { getQueues, headObject } from "@sahihi/infra"
import { renderDocumentThumbnail, sweepThumbnails } from "../../worker/src/jobs/thumbnails"
import { createSender, minimalPdf, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let bob: Sender

beforeEach(async () => {
  await resetDb()
  await getQueues().documents.raw.obliterate({ force: true })
  alice = await createSender("alice")
  bob = await createSender("bob")
})

type ListItem = { id: string; thumbnailUrl: string | null; thumbnailKey?: string | null }
const list = async (who: Sender) =>
  ((await (await request(who, "/api/documents")).json()) as { items: ListItem[] }).items

describe("document thumbnails (ADR 0033)", () => {
  test("completing an upload queues one render job, keyed by the document", async () => {
    const { document } = await uploadDocument(alice, minimalPdf(2))
    const job = await getQueues().documents.raw.getJob(`thumb-${document.id}`)
    expect(job?.name).toBe("document.thumbnail")
    expect(job?.data).toEqual({ documentId: document.id })
  })

  test("the worker renders a PNG next to the original; reruns are no-ops", async () => {
    const { document } = await uploadDocument(alice, minimalPdf(2))
    expect((await list(alice))[0]?.thumbnailUrl).toBeNull()

    expect(await renderDocumentThumbnail(document.id)).toMatchObject({ rendered: true })
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    expect(row.thumbnailKey).toBe(
      `org/${alice.organizationId}/documents/${document.id}/thumbnail.png`,
    )
    expect(await renderDocumentThumbnail(document.id)).toEqual({ skipped: true })

    const [item] = await list(alice)
    expect(item?.thumbnailUrl).toBeTruthy()
    const res = await fetch(item?.thumbnailUrl as string)
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, max-age=900")
    const png = new Uint8Array(await res.arrayBuffer())
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]) // "PNG"

    // Same URL on the next request, so the browser cache can serve it.
    expect((await list(alice))[0]?.thumbnailUrl).toBe(item?.thumbnailUrl as string)
  })

  test("a file PDFium can't render records the failure and leaves the sweep alone", async () => {
    const { document } = await uploadDocument(alice, minimalPdf())
    // Corrupt the stored original after it was accepted.
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    const { putObject } = await import("@sahihi/infra")
    await putObject(row.s3Key, new TextEncoder().encode("garbage"), "application/pdf")

    expect(await renderDocumentThumbnail(document.id)).toEqual({ rendered: false })
    const after = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    expect(after.thumbnailKey).toBeNull()
    expect(after.thumbnailError).toBeTruthy()
    expect(await sweepThumbnails()).toEqual({ queued: 0 })
  })

  test("the sweep queues READY documents without a thumbnail", async () => {
    const { document } = await uploadDocument(alice)
    await getQueues().documents.raw.obliterate({ force: true })
    expect(await sweepThumbnails()).toEqual({ queued: 1 })
    expect(await getQueues().documents.raw.getJob(`thumb-${document.id}`)).toBeTruthy()
  })

  test("another organization never sees it; deleting the document removes it", async () => {
    const { document } = await uploadDocument(alice)
    await renderDocumentThumbnail(document.id)
    expect(await list(bob)).toEqual([])

    const key = (await prisma.document.findUniqueOrThrow({ where: { id: document.id } }))
      .thumbnailKey as string
    expect(await headObject(key)).not.toBeNull()
    expect(
      (await request(alice, `/api/documents/${document.id}`, { method: "DELETE" })).status,
    ).toBe(204)
    expect(await headObject(key)).toBeNull()
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    expect(row.thumbnailKey).toBeNull()
  })
})
