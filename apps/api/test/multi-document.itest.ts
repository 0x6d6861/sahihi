import { beforeEach, describe, expect, test } from "bun:test"
import { CONSENT_VERSION, MAX_ENVELOPE_DOCUMENTS, sha256Hex } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { getObjectBytes, getQueues, headObject } from "@sahihi/infra"
import { unzipSync } from "fflate"
import { finalizeEnvelope } from "../../worker/src/jobs/finalize"
import {
  app,
  createSender,
  minimalPdf,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// 1×1 transparent PNG
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

let alice: Sender
let bob: Sender

beforeEach(async () => {
  await resetDb()
  await getQueues().notifications.raw.obliterate({ force: true })
  alice = await createSender("alice")
  bob = await createSender("bob")
})

type EnvelopeDoc = { id: string; documentId: string; name: string; order: number }
type Detail = {
  envelope: {
    documents: EnvelopeDoc[]
    attachments: { id: string; name: string; status: string; sha256: string | null }[]
  }
}
const detail = async (who: Sender, id: string) =>
  (await (await request(who, `/api/envelopes/${id}`)).json()) as Detail

async function draft(who: Sender, names: string[], pages: number[] = names.map(() => 1)) {
  const docs = []
  for (const [i, name] of names.entries()) {
    docs.push((await uploadDocument(who, minimalPdf(pages[i]), name)).document)
  }
  const res = await request(who, "/api/envelopes", {
    method: "POST",
    json: { documentIds: docs.map((d) => d.id), title: "Lease bundle" },
  })
  expect(res.status).toBe(201)
  const id = ((await res.json()) as { envelope: { id: string } }).envelope.id
  return { id, docs }
}

/** Uploads a supporting file through the presigned PUT, like the browser does. */
async function attach(who: Sender, envelopeId: string, name: string, body: string, type: string) {
  const bytes = new TextEncoder().encode(body)
  const res = await request(who, `/api/envelopes/${envelopeId}/attachments/uploads`, {
    method: "POST",
    json: { name, sizeBytes: bytes.byteLength, contentType: type },
  })
  if (res.status !== 201) return { res, attachment: null }
  const { attachment, uploadUrl } = (await res.json()) as {
    attachment: { id: string }
    uploadUrl: string
  }
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: bytes,
    headers: { "content-type": type },
  })
  expect(put.status).toBe(200)
  const done = await request(
    who,
    `/api/envelopes/${envelopeId}/attachments/${attachment.id}/complete`,
    { method: "POST" },
  )
  return { res: done, attachment }
}

describe("documents of a draft (ADR 0037)", () => {
  test("created with several documents in order; the audit records each hash", async () => {
    const names = ["lease.pdf", "annex-a.pdf", "annex-b.pdf"]
    const { id, docs } = await draft(alice, names)
    const d = await detail(alice, id)
    expect(d.envelope.documents.map((x) => [x.name, x.order])).toEqual([
      ["lease.pdf", 0],
      ["annex-a.pdf", 1],
      ["annex-b.pdf", 2],
    ])
    const created = await prisma.auditEvent.findFirstOrThrow({
      where: { envelopeId: id, type: "envelope.created" },
    })
    expect((created.data as { documents: { id: string; sha256: string }[] }).documents).toEqual(
      docs.map((x, i) => ({ id: x.id, name: names[i] as string, sha256: x.sha256 as string })),
    )
  })

  test("add, reorder and remove; the last one stays; each change is audited", async () => {
    const { id } = await draft(alice, ["lease.pdf"])
    const { document: annex } = await uploadDocument(alice, minimalPdf(2), "annex.pdf")
    const added = await request(alice, `/api/envelopes/${id}/documents`, {
      method: "POST",
      json: { documentIds: [annex.id] },
    })
    expect(added.status).toBe(201)
    const docs = ((await added.json()) as { documents: EnvelopeDoc[] }).documents
    expect(docs.map((x) => x.name)).toEqual(["lease.pdf", "annex.pdf"])
    // The same document twice is refused.
    const again = await request(alice, `/api/envelopes/${id}/documents`, {
      method: "POST",
      json: { documentIds: [annex.id] },
    })
    expect(again.status).toBe(409)

    const reordered = await request(alice, `/api/envelopes/${id}/documents/order`, {
      method: "PUT",
      json: { envelopeDocumentIds: [docs[1]?.id, docs[0]?.id] },
    })
    expect(
      ((await reordered.json()) as { documents: EnvelopeDoc[] }).documents.map((x) => x.name),
    ).toEqual(["annex.pdf", "lease.pdf"])
    // Every id once, or 400.
    expect(
      (
        await request(alice, `/api/envelopes/${id}/documents/order`, {
          method: "PUT",
          json: { envelopeDocumentIds: [docs[0]?.id] },
        })
      ).status,
    ).toBe(400)

    const removed = await request(alice, `/api/envelopes/${id}/documents/${docs[1]?.id}`, {
      method: "DELETE",
    })
    expect(((await removed.json()) as { documents: EnvelopeDoc[] }).documents).toHaveLength(1)
    const last = await request(alice, `/api/envelopes/${id}/documents/${docs[0]?.id}`, {
      method: "DELETE",
    })
    expect(last.status).toBe(409)

    const types = (await prisma.auditEvent.findMany({ where: { envelopeId: id } })).map(
      (e) => e.type,
    )
    expect(types).toEqual(
      expect.arrayContaining([
        "envelope.document_added",
        "envelope.documents_reordered",
        "envelope.document_removed",
      ]),
    )
  })

  test("limits: documents per envelope, other workspaces' documents", async () => {
    const { id } = await draft(alice, ["lease.pdf"])
    const { document: bobs } = await uploadDocument(bob)
    const foreign = await request(alice, `/api/envelopes/${id}/documents`, {
      method: "POST",
      json: { documentIds: [bobs.id] },
    })
    expect(foreign.status).toBe(404)
    const many = []
    for (let i = 0; i < MAX_ENVELOPE_DOCUMENTS; i++) {
      many.push((await uploadDocument(alice, minimalPdf(), `extra-${i}.pdf`)).document.id)
    }
    const tooMany = await request(alice, `/api/envelopes/${id}/documents`, {
      method: "POST",
      json: { documentIds: many },
    })
    expect(tooMany.status).toBe(400)
  })

  test("fields must sit on one of the envelope's documents, within its pages", async () => {
    const { id } = await draft(alice, ["one-page.pdf", "two-pages.pdf"], [1, 2])
    const put = await request(alice, `/api/envelopes/${id}/recipients`, {
      method: "PUT",
      json: { recipients: [{ name: "Amina", email: "amina@example.test" }] },
    })
    const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
    const [first, second] = (await detail(alice, id)).envelope.documents
    const field = (envelopeDocumentId: string, page: number) => ({
      recipientId: r?.id,
      envelopeDocumentId,
      type: "SIGNATURE",
      page,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.05,
    })
    const fields = (list: unknown[]) =>
      request(alice, `/api/envelopes/${id}/fields`, { method: "PUT", json: { fields: list } })
    expect((await fields([field(second?.id as string, 2)])).status).toBe(200)
    expect((await fields([field(first?.id as string, 2)])).status).toBe(400)
    const other = await draft(alice, ["elsewhere.pdf"])
    const otherDoc = (await detail(alice, other.id)).envelope.documents[0]?.id as string
    expect((await fields([field(otherDoc, 1)])).status).toBe(400)
  })

  test("a sent envelope's documents can't change", async () => {
    const { id } = await draft(alice, ["lease.pdf"])
    await prisma.envelope.update({ where: { id }, data: { status: "SENT" } })
    const { document } = await uploadDocument(alice)
    const res = await request(alice, `/api/envelopes/${id}/documents`, {
      method: "POST",
      json: { documentIds: [document.id] },
    })
    expect(res.status).toBe(409)
  })
})

describe("supporting files (ADR 0037)", () => {
  test("upload, hash, list; refused types; removal is audited", async () => {
    const { id } = await draft(alice, ["lease.pdf"])
    const { res, attachment } = await attach(
      alice,
      id,
      "prices.csv",
      "item,price\nrent,100\n",
      "text/csv",
    )
    expect(res.status).toBe(200)
    const [a] = (await detail(alice, id)).envelope.attachments
    expect(a).toMatchObject({ name: "prices.csv", status: "READY" })
    expect(a?.sha256).toBe(await sha256Hex(new TextEncoder().encode("item,price\nrent,100\n")))

    const html = await attach(alice, id, "page.html", "<script>1</script>", "text/html")
    expect(html.res.status).toBe(400)

    const del = await request(alice, `/api/envelopes/${id}/attachments/${attachment?.id}`, {
      method: "DELETE",
    })
    expect(del.status).toBe(204)
    expect((await detail(alice, id)).envelope.attachments).toEqual([])
    expect(
      await prisma.auditEvent.count({
        where: { envelopeId: id, type: "envelope.attachment_removed" },
      }),
    ).toBe(1)
  })

  test("sending waits for files still uploading", async () => {
    const { id } = await draft(alice, ["lease.pdf"])
    await request(alice, `/api/envelopes/${id}/attachments/uploads`, {
      method: "POST",
      json: { name: "slow.png", sizeBytes: 10, contentType: "image/png" },
    })
    const res = await request(alice, `/api/envelopes/${id}/send`, { method: "POST" })
    expect(res.status).toBe(409)
  })
})

describe("signing and finalizing two documents (ADR 0037)", () => {
  test("one signed PDF per document, one certificate, a bundle; verify matches each", async () => {
    const { id } = await draft(alice, ["lease.pdf", "annex.pdf"], [1, 2])
    await attach(alice, id, "prices.csv", "a,b\n1,2\n", "text/csv")
    const put = await request(alice, `/api/envelopes/${id}/recipients`, {
      method: "PUT",
      json: { recipients: [{ name: "Amina Hassan", email: "amina@example.test" }] },
    })
    const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
    const [lease, annex] = (await detail(alice, id)).envelope.documents
    const rect = { width: 0.2, height: 0.05, x: 0.1, y: 0.1 }
    const fieldsRes = await request(alice, `/api/envelopes/${id}/fields`, {
      method: "PUT",
      json: {
        fields: [
          {
            ...rect,
            recipientId: r?.id,
            envelopeDocumentId: lease?.id,
            type: "SIGNATURE",
            page: 1,
          },
          { ...rect, recipientId: r?.id, envelopeDocumentId: annex?.id, type: "INITIALS", page: 2 },
        ],
      },
    })
    const fields = ((await fieldsRes.json()) as { fields: { id: string; type: string }[] }).fields
    expect((await request(alice, `/api/envelopes/${id}/send`, { method: "POST" })).status).toBe(200)
    const sent = await prisma.auditEvent.findFirstOrThrow({
      where: { envelopeId: id, type: "envelope.sent" },
    })
    expect((sent.data as { documents: unknown[]; attachments: unknown[] }).documents).toHaveLength(
      2,
    )
    expect((sent.data as { attachments: unknown[] }).attachments).toHaveLength(1)

    const jobs = await getQueues().notifications.raw.getJobs(["waiting", "delayed"])
    const token = jobs.find((j) => j.name === "envelope.invite")?.data.token as string
    // The signer sees both documents in order, the file, and fields in reading order.
    const session = (await (await request(null, `/api/sign/${token}`)).json()) as {
      documents: { id: string; name: string }[]
      attachments: { id: string; name: string }[]
      fields: { id: string; envelopeDocumentId: string }[]
    }
    expect(session.documents.map((d) => d.name)).toEqual(["lease.pdf", "annex.pdf"])
    expect(session.attachments.map((a) => a.name)).toEqual(["prices.csv"])
    expect(session.fields.map((f) => f.envelopeDocumentId)).toEqual([
      lease?.id as string,
      annex?.id as string,
    ])
    expect((await request(null, `/api/sign/${token}/file?document=${annex?.id}`)).status).toBe(200)
    expect((await request(null, `/api/sign/${token}/file?document=nope`)).status).toBe(404)
    const file = await request(null, `/api/sign/${token}/attachments/${session.attachments[0]?.id}`)
    const { url } = (await file.json()) as { url: string }
    expect((await fetch(url)).headers.get("content-disposition")?.startsWith("attachment;")).toBe(
      true,
    )

    const submitted = await request(null, `/api/sign/${token}/submit`, {
      method: "POST",
      json: {
        consent: true,
        consentVersion: CONSENT_VERSION,
        values: fields.map((f) => ({ kind: "image", fieldId: f.id, dataUrl: PNG })),
      },
    })
    expect(submitted.status).toBe(200)
    expect(await finalizeEnvelope(id)).toHaveProperty("code")

    const rows = await prisma.envelopeDocument.findMany({
      where: { envelopeId: id },
      orderBy: { order: "asc" },
    })
    expect(rows.every((d) => d.signedS3Key && d.signedSha256)).toBe(true)
    for (const d of rows) {
      expect(await sha256Hex(await getObjectBytes(d.signedS3Key as string))).toBe(
        d.signedSha256 as string,
      )
    }
    // Verify finds the envelope from either signed document, never from an original.
    for (const d of rows) {
      const v = await app.request("/api/verify/hash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sha256: d.signedSha256 }),
      })
      expect(((await v.json()) as { match: string }).match).toBe("signed_document")
    }
    const original = await prisma.document.findUniqueOrThrow({ where: { id: rows[0]?.documentId } })
    const vo = await app.request("/api/verify/hash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sha256: original.sha256 }),
    })
    expect(((await vo.json()) as { match: null }).match).toBeNull()

    // Downloads: each document, the certificate, the file and the bundle.
    const dl = (await (await request(alice, `/api/envelopes/${id}/downloads`)).json()) as {
      documents: { name: string; url: string }[]
      attachments: { name: string }[]
      bundle: string
    }
    expect(dl.documents.map((d) => d.name)).toEqual(["lease (signed).pdf", "annex (signed).pdf"])
    expect(dl.attachments.map((a) => a.name)).toEqual(["prices.csv"])
    const zip = unzipSync(new Uint8Array(await (await fetch(dl.bundle)).arrayBuffer()))
    expect(Object.keys(zip).sort()).toEqual(
      [
        "01-lease (signed).pdf",
        "02-annex (signed).pdf",
        "Lease bundle (certificate).pdf",
        "supporting-files/01-prices.csv",
      ].sort(),
    )
    const env = await prisma.envelope.findUniqueOrThrow({ where: { id } })
    expect(await headObject(env.bundleS3Key as string)).not.toBeNull()
    // A retry is a no-op.
    expect(await finalizeEnvelope(id)).toEqual({ skipped: true })
  })
})

describe("templates keep every document and file (ADR 0037)", () => {
  test("save then use: documents in order, fields on the right document, files copied", async () => {
    const { id } = await draft(alice, ["lease.pdf", "annex.pdf"], [1, 2])
    await attach(alice, id, "prices.csv", "a,b\n", "text/csv")
    const put = await request(alice, `/api/envelopes/${id}/recipients`, {
      method: "PUT",
      json: { recipients: [{ name: "Tenant", email: "tenant@example.test" }] },
    })
    const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
    const [, annex] = (await detail(alice, id)).envelope.documents
    await request(alice, `/api/envelopes/${id}/fields`, {
      method: "PUT",
      json: {
        fields: [
          {
            recipientId: r?.id,
            envelopeDocumentId: annex?.id,
            type: "SIGNATURE",
            page: 2,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.05,
          },
        ],
      },
    })
    const saved = await request(alice, "/api/templates", {
      method: "POST",
      json: { envelopeId: id, name: "Lease set", roles: [{ recipientId: r?.id, label: "Tenant" }] },
    })
    expect(saved.status).toBe(201)
    const templateId = ((await saved.json()) as { template: { id: string } }).template.id
    const tpl = (await (await request(alice, `/api/templates/${templateId}`)).json()) as {
      template: {
        documents: { name: string }[]
        attachments: { name: string }[]
        roles: { id: string }[]
      }
    }
    expect(tpl.template.documents.map((d) => d.name)).toEqual(["lease.pdf", "annex.pdf"])
    expect(tpl.template.attachments.map((a) => a.name)).toEqual(["prices.csv"])

    const used = await request(alice, `/api/templates/${templateId}/envelopes`, {
      method: "POST",
      json: {
        title: "From template",
        recipients: [
          { roleId: tpl.template.roles[0]?.id, name: "Wanjiru", email: "wanjiru@example.test" },
        ],
      },
    })
    expect(used.status).toBe(201)
    const newId = ((await used.json()) as { envelope: { id: string } }).envelope.id
    const d = await detail(alice, newId)
    expect(d.envelope.documents.map((x) => x.name)).toEqual(["lease.pdf", "annex.pdf"])
    expect(d.envelope.attachments.map((a) => [a.name, a.status])).toEqual([["prices.csv", "READY"]])
    const field = await prisma.field.findFirstOrThrow({ where: { envelopeId: newId } })
    expect(field.envelopeDocumentId).toBe(d.envelope.documents[1]?.id as string)
    const copy = await prisma.envelopeAttachment.findFirstOrThrow({ where: { envelopeId: newId } })
    expect(copy.s3Key).toContain(`/envelopes/${newId}/attachments/`)
    expect(await headObject(copy.s3Key)).not.toBeNull()
  })
})

describe("public API (ADR 0037)", () => {
  test("documentIds with fields pointing at a document by index; payload lists both", async () => {
    const keyRes = await request(alice, "/api/api-keys", {
      method: "POST",
      json: { name: "ERP", scopes: ["envelopes:read", "envelopes:write"] },
    })
    const { key } = (await keyRes.json()) as { key: string }
    const a = (await uploadDocument(alice, minimalPdf(), "a.pdf")).document
    const b = (await uploadDocument(alice, minimalPdf(3), "b.pdf")).document
    const res = await app.request("/api/v1/envelopes", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        documentIds: [a.id, b.id],
        title: "API bundle",
        recipients: [{ name: "Kip", email: "kip@example.test" }],
        fields: [
          {
            recipient: 0,
            document: 1,
            type: "SIGNATURE",
            page: 3,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.05,
          },
        ],
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      envelope: { document: { name: string }; documents: { name: string }[] }
    }
    expect(body.envelope.document.name).toBe("a.pdf")
    expect(body.envelope.documents.map((d) => d.name)).toEqual(["a.pdf", "b.pdf"])
    // Page 3 exists only on the second document.
    const bad = await app.request("/api/v1/envelopes", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        documentIds: [a.id, b.id],
        title: "API bundle",
        recipients: [{ name: "Kip", email: "kip@example.test" }],
        fields: [
          {
            recipient: 0,
            document: 0,
            type: "SIGNATURE",
            page: 3,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.05,
          },
        ],
      }),
    })
    expect(bad.status).toBe(400)
  })
})
