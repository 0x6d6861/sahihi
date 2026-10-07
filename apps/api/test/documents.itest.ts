import { beforeEach, describe, expect, test } from "bun:test"
import { MAX_UPLOAD_BYTES } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { headObject } from "@sahihi/infra"
import {
  createSender,
  formPdf,
  minimalPdf,
  request,
  resetDb,
  type Sender,
  sha256,
  textPdf,
  uploadDocument,
} from "./helpers"

let alice: Sender
let bob: Sender

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  bob = await createSender("bob")
})

describe("documents: upload flow", () => {
  test("create → PUT → complete makes a READY document with the server-computed hash", async () => {
    const bytes = minimalPdf(3)
    const { status, document } = await uploadDocument(alice, bytes, "lease.pdf")
    expect(status).toBe(200)
    expect(document.status).toBe("READY")
    expect(document.pageCount).toBe(3)
    expect(document.sha256).toBe(await sha256(bytes))
    expect(document.organizationId).toBe(alice.organizationId)

    const got = await request(alice, `/api/documents/${document.id}`)
    expect(got.status).toBe(200)

    const file = await request(alice, `/api/documents/${document.id}/file`)
    expect(file.status).toBe(200)
    const { url } = (await file.json()) as { url: string }
    const downloaded = new Uint8Array(await (await fetch(url)).arrayBuffer())
    expect(await sha256(downloaded)).toBe(await sha256(bytes))
  })

  test("completing twice is a conflict", async () => {
    const { document } = await uploadDocument(alice)
    const again = await request(alice, `/api/documents/${document.id}/complete`, {
      method: "POST",
    })
    expect(again.status).toBe(409)
  })

  test("bytes that aren't a PDF end FAILED (422) and the object is removed", async () => {
    const junk = new TextEncoder().encode("definitely not a pdf")
    const { status, document } = await uploadDocument(alice, junk, "fake.pdf")
    expect(status).toBe(422)
    expect(document.status).toBe("FAILED")
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    expect(await headObject(row.s3Key)).toBeNull()
  })

  test("upload requests are validated with CreateUploadSchema", async () => {
    const tooBig = await request(alice, "/api/documents/uploads", {
      method: "POST",
      json: { name: "a.pdf", sizeBytes: MAX_UPLOAD_BYTES + 1, contentType: "application/pdf" },
    })
    expect(tooBig.status).toBe(400)
    const notPdf = await request(alice, "/api/documents/uploads", {
      method: "POST",
      json: { name: "a.docx", sizeBytes: 10, contentType: "application/msword" },
    })
    expect(notPdf.status).toBe(400)
    expect(((await notPdf.json()) as { error: string }).error).toBe("validation_error")
  })
})

describe("documents: field suggestions", () => {
  type Body = {
    suggestions: {
      type: string
      roleHint: string | null
      source: string
      page: number
      x: number
      y: number
    }[]
    skipped: number
  }
  const suggest = async (bytes: Uint8Array) => {
    const { document } = await uploadDocument(alice, bytes, "doc.pdf")
    const res = await request(alice, `/api/documents/${document.id}/field-suggestions`)
    expect(res.status).toBe(200)
    return (await res.json()) as Body
  }

  test("form widgets: normalized and in reading order", async () => {
    const body = await suggest(formPdf())
    expect(body.skipped).toBe(0)
    expect(body.suggestions.map((s) => [s.type, s.roleHint, s.source, s.page])).toEqual([
      ["SIGNATURE", "buyer", "form", 1],
      ["DATE_SIGNED", "seller", "form", 1],
    ])
    expect(body.suggestions[0]?.x).toBeCloseTo(0.1, 6)
    expect(body.suggestions[0]?.y).toBeCloseTo(1 - 118.8 / 792, 6)
  })

  test("anchor tags on the text layer; invalid tags are counted as skipped", async () => {
    const body = await suggest(
      textPdf("Signed: {{s1:signature}}", "Date: {{s2:date}}", "{{s1:stamp}}"),
    )
    expect(body.skipped).toBe(1)
    expect(body.suggestions.map((s) => [s.type, s.roleHint, s.source])).toEqual([
      ["SIGNATURE", "s1", "anchor"],
      ["DATE_SIGNED", "s2", "anchor"],
    ])
  })

  test("labels next to blanks, only when there are no anchors or form fields", async () => {
    const body = await suggest(textPdf("LANDLORD", "Signature: ______________", "Date:"))
    expect(body.suggestions.map((s) => [s.type, s.roleHint, s.source])).toEqual([
      ["SIGNATURE", "landlord", "text"],
      ["DATE_SIGNED", "landlord", "text"],
    ])
    const tagged = await suggest(textPdf("Signature: ______________", "{{s1:date}}"))
    expect(tagged.suggestions.map((s) => s.source)).toEqual(["anchor"])
  })

  test("a PDF without a form, anchors or labelled blanks has no suggestions", async () => {
    expect(await suggest(minimalPdf())).toEqual({ suggestions: [], skipped: 0 })
  })
})

describe("documents: list", () => {
  test("pages newest first and hides UPLOADING rows", async () => {
    const first = await uploadDocument(alice, minimalPdf(), "first.pdf")
    const second = await uploadDocument(alice, minimalPdf(), "second.pdf")
    await request(alice, "/api/documents/uploads", {
      method: "POST",
      json: { name: "pending.pdf", sizeBytes: 10, contentType: "application/pdf" },
    })

    const res = await request(alice, "/api/documents")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: { id: string }[]
      page: number
      pageSize: number
      total: number
    }
    expect(body.total).toBe(2)
    expect(body.page).toBe(1)
    expect(body.items.map((d) => d.id)).toEqual([second.document.id, first.document.id])

    const past = await request(alice, "/api/documents?page=2")
    expect(((await past.json()) as { items: unknown[] }).items).toEqual([])
    expect((await request(alice, "/api/documents?page=0")).status).toBe(400)
  })
})

describe("documents: delete", () => {
  test("soft-deletes: the row stays, the API forgets it, the object is removed", async () => {
    const { document } = await uploadDocument(alice)
    const del = await request(alice, `/api/documents/${document.id}`, { method: "DELETE" })
    expect(del.status).toBe(204)
    expect((await request(alice, `/api/documents/${document.id}`)).status).toBe(404)
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    expect(row.deletedAt).not.toBeNull()
    expect(await headObject(row.s3Key)).toBeNull()
  })
})

describe("documents: access control", () => {
  test("no session → 401; session without an active org → 403", async () => {
    expect((await request(null, "/api/documents")).status).toBe(401)
    const loner = await createSender("loner", { withOrganization: false })
    const res = await request(loner, "/api/documents")
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe("no_active_organization")
  })

  test("another organization gets 404 on every document route and an empty list", async () => {
    const { document } = await uploadDocument(alice)
    const id = document.id

    const attempts: [string, string][] = [
      ["GET", `/api/documents/${id}`],
      ["GET", `/api/documents/${id}/file`],
      ["GET", `/api/documents/${id}/field-suggestions`],
      ["POST", `/api/documents/${id}/complete`],
      ["DELETE", `/api/documents/${id}`],
    ]
    for (const [method, path] of attempts) {
      const res = await request(bob, path, { method })
      expect({ method, path, status: res.status }).toEqual({ method, path, status: 404 })
    }

    const list = (await (await request(bob, "/api/documents")).json()) as { total: number }
    expect(list.total).toBe(0)

    // Bob's DELETE must not have touched Alice's document.
    const row = await prisma.document.findUniqueOrThrow({ where: { id } })
    expect(row.deletedAt).toBeNull()
    expect(await headObject(row.s3Key)).not.toBeNull()
  })

  test("envelopes can't be created from another organization's document", async () => {
    const { document } = await uploadDocument(alice)
    const res = await request(bob, "/api/envelopes", {
      method: "POST",
      json: { documentId: document.id, title: "Borrowed" },
    })
    expect(res.status).toBe(404)
    expect(await prisma.envelope.count()).toBe(0)
  })
})

describe("documents: lineage (prepare document)", () => {
  const createUpload = (sender: Sender, sourceDocumentId: string) =>
    request(sender, "/api/documents/uploads", {
      method: "POST",
      json: {
        name: "prepared.pdf",
        sizeBytes: 10,
        contentType: "application/pdf",
        sourceDocumentId,
      },
    })

  test("a derived document records its source; the source is untouched", async () => {
    const original = await uploadDocument(alice, minimalPdf(2), "original.pdf")
    const before = await prisma.document.findUniqueOrThrow({ where: { id: original.document.id } })

    const res = await createUpload(alice, original.document.id)
    expect(res.status).toBe(201)
    const { document } = (await res.json()) as {
      document: { id: string; sourceDocumentId: string }
    }
    expect(document.sourceDocumentId).toBe(original.document.id)

    const after = await prisma.document.findUniqueOrThrow({ where: { id: original.document.id } })
    expect(after.sha256).toBe(before.sha256)
    expect(after.updatedAt).toEqual(before.updatedAt)
  })

  test("list and detail expose the source name for lineage", async () => {
    const original = await uploadDocument(alice, minimalPdf(), "nda.pdf")
    const derivedBytes = minimalPdf(1)
    const created = await request(alice, "/api/documents/uploads", {
      method: "POST",
      json: {
        name: "nda (prepared).pdf",
        sizeBytes: derivedBytes.byteLength,
        contentType: "application/pdf",
        sourceDocumentId: original.document.id,
      },
    })
    const { document, uploadUrl } = (await created.json()) as {
      document: { id: string }
      uploadUrl: string
    }
    await fetch(uploadUrl, {
      method: "PUT",
      body: derivedBytes,
      headers: { "content-type": "application/pdf" },
    })
    await request(alice, `/api/documents/${document.id}/complete`, { method: "POST" })

    const detail = (await (await request(alice, `/api/documents/${document.id}`)).json()) as {
      document: { source: { id: string; name: string } | null }
    }
    expect(detail.document.source).toMatchObject({ id: original.document.id, name: "nda.pdf" })

    const list = (await (await request(alice, "/api/documents")).json()) as {
      items: { id: string; source: { name: string } | null }[]
    }
    expect(list.items.find((d) => d.id === document.id)?.source?.name).toBe("nda.pdf")
    expect(list.items.find((d) => d.id === original.document.id)?.source).toBeNull()
  })

  test("the source must be a READY document in the caller's organization", async () => {
    const aliceDoc = await uploadDocument(alice)
    expect((await createUpload(bob, aliceDoc.document.id)).status).toBe(404)
    expect((await createUpload(alice, "does-not-exist")).status).toBe(404)
    const pending = await request(alice, "/api/documents/uploads", {
      method: "POST",
      json: { name: "p.pdf", sizeBytes: 10, contentType: "application/pdf" },
    })
    const { document: uploading } = (await pending.json()) as { document: { id: string } }
    expect((await createUpload(alice, uploading.id)).status).toBe(404)
    // Nothing was created for the rejected attempts.
    expect(await prisma.document.count({ where: { organizationId: bob.organizationId } })).toBe(0)
  })
})
