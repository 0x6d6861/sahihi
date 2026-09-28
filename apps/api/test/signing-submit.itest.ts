import { beforeEach, describe, expect, test } from "bun:test"
import { CONSENT_VERSION, consentTextSha256 } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { getQueues } from "@sahihi/infra"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

// 1×1 transparent PNG
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

let alice: Sender
let envelopeId: string
let token: string
let fieldIds: Record<string, string>
const fid = (type: string): string => {
  const id = fieldIds[type]
  if (!id) throw new Error(`no ${type} field`)
  return id
}

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  const { document } = await uploadDocument(alice)
  const created = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Submit test" },
  })
  envelopeId = ((await created.json()) as { envelope: { id: string } }).envelope.id
  const put = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Achieng Odhiambo", email: "achieng@example.test" }] },
  })
  const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
  if (!r) throw new Error("no recipient")
  const rect = { page: 1, width: 0.2, height: 0.05, x: 0.1 }
  const fields = await request(alice, `/api/envelopes/${envelopeId}/fields`, {
    method: "PUT",
    json: {
      fields: [
        { ...rect, recipientId: r.id, type: "SIGNATURE", y: 0.1 },
        { ...rect, recipientId: r.id, type: "TEXT", y: 0.2 },
        { ...rect, recipientId: r.id, type: "NAME", y: 0.3 },
        { ...rect, recipientId: r.id, type: "CHECKBOX", y: 0.4, required: false },
      ],
    },
  })
  const saved = ((await fields.json()) as { fields: { id: string; type: string }[] }).fields
  fieldIds = Object.fromEntries(saved.map((f) => [f.type, f.id]))
  expect(
    (await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })).status,
  ).toBe(200)
  const jobs = await getQueues().notifications.raw.getJobs(["waiting", "delayed"])
  const invite = jobs
    .filter((j) => j.name === "envelope.invite" && j.data.recipientId === r.id)
    .sort((a, b) => b.timestamp - a.timestamp)[0]
  token = invite?.data.token
  // Viewing the file first, like the signing surface does.
  expect((await request(null, `/api/sign/${token}/file`)).status).toBe(200)
})

const submit = (
  values: unknown[],
  consent: unknown = true,
  consentVersion: string = CONSENT_VERSION,
) =>
  request(null, `/api/sign/${token}/submit`, {
    method: "POST",
    json: { consent, consentVersion, values },
  })

describe("POST /sign/:token/submit", () => {
  test("missing required fields are reported by id; nothing is signed", async () => {
    const res = await submit([{ kind: "text", fieldId: fid("TEXT"), value: "Kisumu" }])
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; fieldIds: string[] }
    expect(body).toEqual({ error: "missing_required_fields", fieldIds: [fid("SIGNATURE")] })
    const env = await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } })
    expect(env.status).not.toBe("COMPLETED")
  })

  test("consent is required", async () => {
    expect((await submit([], false)).status).toBe(400)
  })

  test("an outdated consent version is refused before anything is stored", async () => {
    const res = await submit(
      [{ kind: "image", fieldId: fid("SIGNATURE"), dataUrl: PNG }],
      true,
      "1999-01-01",
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      error: "consent_outdated",
      consentVersion: CONSENT_VERSION,
    })
    const sig = await prisma.field.findUniqueOrThrow({ where: { id: fid("SIGNATURE") } })
    expect(sig.imageS3Key).toBeNull()
    expect(
      await prisma.auditEvent.count({ where: { envelopeId, type: "recipient.consented" } }),
    ).toBe(0)
  })

  test("the consent event records the version and the exact text's hash", async () => {
    const res = await submit([
      { kind: "image", fieldId: fid("SIGNATURE"), dataUrl: PNG },
      { kind: "text", fieldId: fid("TEXT"), value: "Kisumu" },
    ])
    expect(res.status).toBe(200)
    const ev = await prisma.auditEvent.findFirstOrThrow({
      where: { envelopeId, type: "recipient.consented" },
    })
    expect(ev.data).toEqual({
      consentVersion: CONSENT_VERSION,
      consentTextSha256: await consentTextSha256(CONSENT_VERSION),
    })
  })

  test("last signer completes the envelope and the finalize job is enqueued (deduped)", async () => {
    const res = await submit([
      { kind: "image", fieldId: fid("SIGNATURE"), dataUrl: PNG },
      { kind: "text", fieldId: fid("TEXT"), value: "  Kisumu " },
      { kind: "checkbox", fieldId: fid("CHECKBOX"), checked: true },
    ])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, envelopeStatus: "COMPLETED" })

    const env = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelopeId },
      include: { fields: true, recipients: true },
    })
    expect(env.status).toBe("COMPLETED")
    expect(env.recipients[0]?.status).toBe("SIGNED")
    const byType = Object.fromEntries(env.fields.map((f) => [f.type, f]))
    expect(byType.TEXT?.value).toBe("Kisumu")
    expect(byType.NAME?.value).toBe("Achieng Odhiambo") // server-filled
    expect(byType.CHECKBOX?.value).toBe("true")
    expect(byType.SIGNATURE?.imageS3Key).toContain(`/envelopes/${envelopeId}/fields/`)

    const job = await getQueues().finalize.raw.getJob(`finalize-${envelopeId}`)
    expect(job?.data).toEqual({ envelopeId })

    // A second submit is refused and doesn't create a second job.
    expect(
      (await submit([{ kind: "image", fieldId: fid("SIGNATURE"), dataUrl: PNG }])).status,
    ).toBe(409)
    const finalizeJobs = (await getQueues().finalize.raw.getJobs(["waiting", "delayed"])).filter(
      (j) => j.data.envelopeId === envelopeId,
    )
    expect(finalizeJobs).toHaveLength(1)
  })
})
