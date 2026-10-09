import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { type GeneratedDocumentData, sha256Hex } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { getObjectBytes } from "@sahihi/infra"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { setAssistantModelForTests } from "../src/lib/assistant/model"
import { createSender, joinOrganization, request, resetDb, type Sender } from "./helpers"

// docs/ai-documents.md
const json = async <T>(res: Response) => (await res.json()) as T

type Detail = {
  document: { id: string; status: string; envelopeId: string | null; canEdit: boolean }
  version: { id: string; number: number; data: GeneratedDocumentData }
  issues: { code: string; variableKey?: string; roleKey?: string }[]
  messages: unknown[]
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
}

/** A model that calls set_variables with `values` once, then replies "Done." */
function scriptedModel(values: { key: string; value: string }[]) {
  let call = 0
  const toolCall = [
    {
      type: "tool-call" as const,
      toolCallId: "call-1",
      toolName: "set_variables",
      input: JSON.stringify({ values }),
    },
    {
      type: "finish" as const,
      finishReason: { unified: "tool-calls" as const, raw: undefined },
      usage,
    },
  ]
  const reply = [
    { type: "text-start" as const, id: "t" },
    { type: "text-delta" as const, id: "t", delta: "Done." },
    { type: "text-end" as const, id: "t" },
    { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage },
  ]
  return new MockLanguageModelV4({
    doStream: async () => {
      call += 1
      return {
        stream:
          call === 1
            ? simulateReadableStream({ chunks: toolCall })
            : simulateReadableStream({ chunks: reply }),
      }
    },
  })
}

let alice: Sender

async function enableAssistant(sender: Sender) {
  const res = await request(sender, "/api/generated-documents/settings", {
    method: "PUT",
    json: { enabled: true },
  })
  expect(res.status).toBe(200)
}

async function createNda(sender: Sender) {
  const res = await request(sender, "/api/generated-documents", {
    method: "POST",
    json: { starter: "mutual-nda" },
  })
  expect(res.status).toBe(201)
  return (await json<{ id: string }>(res)).id
}

const detail = async (sender: Sender, id: string) =>
  json<Detail>(await request(sender, `/api/generated-documents/${id}`))

async function fillEverything(sender: Sender, id: string) {
  const { version } = await detail(sender, id)
  const res = await request(sender, `/api/generated-documents/${id}/variables`, {
    method: "POST",
    json: {
      baseVersionId: version.id,
      source: "answer",
      values: version.data.variables.map((v) => ({ key: v.key, value: `${v.label} value` })),
    },
  })
  expect(res.status).toBe(200)
  const next = (await json<{ version: { id: string } }>(res)).version
  const roles = await request(sender, `/api/generated-documents/${id}/roles`, {
    method: "PUT",
    json: {
      baseVersionId: next.id,
      roles: [
        { key: "party_a", name: "Amina Otieno", email: "amina@example.com" },
        { key: "party_b", name: "Peter Kamau", email: "peter@example.org" },
      ],
    },
  })
  expect(roles.status).toBe(200)
  return (await json<{ version: { id: string } }>(roles)).version.id
}

beforeEach(async () => {
  await resetDb()
  setAssistantModelForTests(scriptedModel([]))
  alice = await createSender("alice")
})

afterAll(() => setAssistantModelForTests(null))

describe("availability", () => {
  test("off until an owner or admin turns it on for the workspace", async () => {
    const off = await request(alice, "/api/generated-documents", {
      method: "POST",
      json: { starter: "mutual-nda" },
    })
    expect(off.status).toBe(403)
    expect((await json<{ error: string }>(off)).error).toBe("assistant_unavailable")

    const member = await joinOrganization(alice, "bob", "member")
    const settings = await json<{ enabled: boolean; canManage: boolean }>(
      await request(member, "/api/generated-documents/settings"),
    )
    expect(settings).toMatchObject({ enabled: false, canManage: false })
    const denied = await request(member, "/api/generated-documents/settings", {
      method: "PUT",
      json: { enabled: true },
    })
    expect(denied.status).toBe(403)

    await enableAssistant(alice)
    await createNda(member)
  })

  test("never available without a configured model", async () => {
    await enableAssistant(alice)
    setAssistantModelForTests(null) // the test env sets no AI_MODEL
    const res = await request(alice, "/api/generated-documents")
    expect(res.status).toBe(403)
  })
})

describe("drafting", () => {
  beforeEach(() => enableAssistant(alice))

  test("a new document starts with every blank unresolved and no signers", async () => {
    const id = await createNda(alice)
    const d = await detail(alice, id)
    expect(d.version.number).toBe(1)
    expect(d.document).toMatchObject({ status: "DRAFT", canEdit: true, envelopeId: null })
    expect(d.issues.filter((i) => i.code === "unresolved_variable")).toHaveLength(9)
    expect(d.issues.filter((i) => i.code === "invalid_email")).toHaveLength(2)
  })

  test("answers and skips make a new version; a stale base is refused", async () => {
    const id = await createNda(alice)
    const v1 = (await detail(alice, id)).version
    const res = await request(alice, `/api/generated-documents/${id}/variables`, {
      method: "POST",
      json: {
        baseVersionId: v1.id,
        source: "answer",
        values: [
          { key: "governing_law", value: "Kenya" },
          { key: "purpose", value: null },
        ],
      },
    })
    expect(res.status).toBe(200)
    const d = await detail(alice, id)
    expect(d.version.number).toBe(2)
    const vars = Object.fromEntries(d.version.data.variables.map((v) => [v.key, v]))
    expect(vars.governing_law).toMatchObject({
      value: "Kenya",
      status: "answered",
      source: "answer",
    })
    expect(vars.purpose).toMatchObject({ value: null, status: "skipped" })
    expect(d.issues.find((i) => i.variableKey === "purpose")?.code).toBe("unresolved_variable")

    const stale = await request(alice, `/api/generated-documents/${id}/variables`, {
      method: "POST",
      json: { baseVersionId: v1.id, source: "edit", values: [{ key: "term", value: "one year" }] },
    })
    expect(stale.status).toBe(409)
    expect((await json<{ error: string }>(stale)).error).toBe("stale_version")

    const unknown = await request(alice, `/api/generated-documents/${id}/variables`, {
      method: "POST",
      json: { baseVersionId: d.version.id, source: "edit", values: [{ key: "nope", value: "x" }] },
    })
    expect(unknown.status).toBe(400)
  })

  test("versions and events can't be rewritten", async () => {
    const id = await createNda(alice)
    const error = (p: PromiseLike<unknown>) =>
      Promise.resolve(p).then(
        () => null,
        (err: Error) => err.message,
      )
    expect(
      await error(
        prisma.generatedDocumentVersion.updateMany({
          where: { generatedDocumentId: id },
          data: { reason: "rewritten" },
        }),
      ),
    ).toMatch(/append-only/)
    expect(
      await error(
        prisma.generatedDocumentEvent.updateMany({
          where: { generatedDocumentId: id },
          data: { type: "rewritten" },
        }),
      ),
    ).toMatch(/append-only/)
  })

  test("other members can open it but only its creator, an admin or the owner change it", async () => {
    const id = await createNda(alice)
    const bob = await joinOrganization(alice, "bob", "member")
    const d = await detail(bob, id)
    expect(d.document.canEdit).toBe(false)
    const res = await request(bob, `/api/generated-documents/${id}/variables`, {
      method: "POST",
      json: { baseVersionId: d.version.id, source: "edit", values: [{ key: "term", value: "x" }] },
    })
    expect(res.status).toBe(403)
  })

  test("another workspace can't see it", async () => {
    const id = await createNda(alice)
    const eve = await createSender("eve")
    await enableAssistant(eve)
    expect((await request(eve, `/api/generated-documents/${id}`)).status).toBe(404)
    expect((await request(eve, `/api/generated-documents/${id}/preview`)).status).toBe(404)
  })

  test("the preview is a PDF with the blanks highlighted", async () => {
    const id = await createNda(alice)
    const res = await request(alice, `/api/generated-documents/${id}/preview`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()).slice(0, 5))).toBe(
      "%PDF-",
    )
  })
})

describe("assistant", () => {
  beforeEach(() => enableAssistant(alice))

  const chat = (id: string, text: string) =>
    request(alice, `/api/generated-documents/${id}/chat`, {
      method: "POST",
      json: { messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }] },
    })

  test("fills blanks only with what the person said", async () => {
    const id = await createNda(alice)
    setAssistantModelForTests(scriptedModel([{ key: "term", value: "one year" }]))
    const res = await chat(id, "The agreement should run for one year.")
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("Done.")

    const d = await detail(alice, id)
    expect(d.version.number).toBe(2)
    expect(d.version.data.variables.find((v) => v.key === "term")).toMatchObject({
      value: "one year",
      status: "answered",
      source: "chat",
    })
    const version = await prisma.generatedDocumentVersion.findFirst({
      where: { generatedDocumentId: id, number: 2 },
    })
    expect(version?.actor).toBe("AI")
    // The conversation is kept, with the tool call and the reply.
    expect(JSON.stringify(d.messages)).toContain("tool-set_variables")
    const events = await prisma.generatedDocumentEvent.findMany({
      where: { generatedDocumentId: id },
      orderBy: { occurredAt: "asc" },
    })
    expect(events.map((e) => e.type)).toEqual([
      "document.created",
      "variables.set_by_assistant",
      "assistant.turn",
    ])
    // Usage and model only: no prompt or text in the trail.
    expect(JSON.stringify(events.at(-1)?.data)).not.toContain("one year")
  })

  test("refuses invented values and records the refusal", async () => {
    const id = await createNda(alice)
    setAssistantModelForTests(scriptedModel([{ key: "governing_law", value: "Kenya" }]))
    const res = await chat(id, "Use Kenyan law, I think.")
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain("never said")
    expect((await detail(alice, id)).version.number).toBe(1)
    const rejected = await prisma.generatedDocumentEvent.findFirst({
      where: { generatedDocumentId: id, type: "variables.rejected" },
    })
    expect(rejected?.data).toEqual({ keys: ["governing_law"] })
  })

  test("rejects malformed conversations", async () => {
    const id = await createNda(alice)
    const res = await request(alice, `/api/generated-documents/${id}/chat`, {
      method: "POST",
      json: { messages: [{ role: "nobody" }] },
    })
    expect(res.status).toBe(400)
  })
})

describe("finalize", () => {
  beforeEach(() => enableAssistant(alice))

  test("is blocked until every blank and signer is complete", async () => {
    const id = await createNda(alice)
    const { version } = await detail(alice, id)
    const res = await request(alice, `/api/generated-documents/${id}/finalize`, {
      method: "POST",
      json: { versionId: version.id, acknowledged: true },
    })
    expect(res.status).toBe(400)
    const body = await json<{ error: string; issues: { code: string }[] }>(res)
    expect(body.error).toBe("preflight_failed")
    expect(body.issues.length).toBeGreaterThan(0)

    const unacknowledged = await request(alice, `/api/generated-documents/${id}/finalize`, {
      method: "POST",
      json: { versionId: version.id },
    })
    expect(unacknowledged.status).toBe(400)
  })

  test("signers need distinct emails", async () => {
    const id = await createNda(alice)
    const versionId = await fillEverything(alice, id)
    const res = await request(alice, `/api/generated-documents/${id}/roles`, {
      method: "PUT",
      json: {
        baseVersionId: versionId,
        roles: [{ key: "party_b", name: "Peter Kamau", email: "AMINA@example.com" }],
      },
    })
    const { issues } = await json<{ issues: { code: string }[] }>(res)
    expect(issues.map((i) => i.code)).toEqual(["duplicate_email"])
  })

  test("renders a READY document and a DRAFT envelope with signers and fields in place", async () => {
    const id = await createNda(alice)
    const versionId = await fillEverything(alice, id)

    const stale = await request(alice, `/api/generated-documents/${id}/finalize`, {
      method: "POST",
      json: {
        versionId: (
          await prisma.generatedDocumentVersion.findFirstOrThrow({
            where: { generatedDocumentId: id, number: 1 },
          })
        ).id,
        acknowledged: true,
      },
    })
    expect(stale.status).toBe(409)

    const res = await request(alice, `/api/generated-documents/${id}/finalize`, {
      method: "POST",
      json: { versionId, acknowledged: true },
    })
    expect(res.status).toBe(201)
    const { envelopeId } = await json<{ envelopeId: string }>(res)

    const generated = await prisma.generatedDocument.findUniqueOrThrow({ where: { id } })
    expect(generated).toMatchObject({
      status: "FINALIZED",
      finalizedVersionId: versionId,
      envelopeId,
    })

    // A first-class document: READY, hashed, inspectable, the bytes in storage match the hash.
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: generated.documentId as string },
    })
    expect(document.status).toBe("READY")
    expect(document.name).toBe("Mutual Non-Disclosure Agreement.pdf")
    expect(document.uploadedById).toBe(alice.userId)
    expect(await sha256Hex(await getObjectBytes(document.s3Key))).toBe(document.sha256 as string)

    const envelope = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelopeId },
      include: { recipients: { orderBy: { colorIndex: "asc" } }, fields: true, documents: true },
    })
    expect(envelope.status).toBe("DRAFT")
    expect(envelope.organizationId).toBe(alice.organizationId)
    expect(envelope.documents.map((d) => d.documentId)).toEqual([document.id])
    expect(envelope.recipients.map((r) => [r.name, r.email, r.role])).toEqual([
      ["Amina Otieno", "amina@example.com", "SIGNER"],
      ["Peter Kamau", "peter@example.org", "SIGNER"],
    ])
    expect(envelope.fields).toHaveLength(6)
    for (const r of envelope.recipients) {
      const types = envelope.fields.filter((f) => f.recipientId === r.id).map((f) => f.type)
      expect(types.sort()).toEqual(["DATE_SIGNED", "NAME", "SIGNATURE"])
    }
    for (const f of envelope.fields) {
      expect(f.page).toBeGreaterThanOrEqual(1)
      expect(f.page).toBeLessThanOrEqual(document.pageCount as number)
      expect(f.x + f.width).toBeLessThanOrEqual(1)
      expect(f.y + f.height).toBeLessThanOrEqual(1)
    }

    // The envelope can be sent as is.
    const preflight = await json<{ issues: unknown[] }>(
      await request(alice, `/api/envelopes/${envelopeId}/preflight`),
    )
    expect(preflight.issues).toEqual([])

    // Locked: no more changes, and finalising again returns the same envelope.
    const edit = await request(alice, `/api/generated-documents/${id}/variables`, {
      method: "POST",
      json: { baseVersionId: versionId, source: "edit", values: [{ key: "term", value: "x" }] },
    })
    expect(edit.status).toBe(409)
    const again = await request(alice, `/api/generated-documents/${id}/finalize`, {
      method: "POST",
      json: { versionId, acknowledged: true },
    })
    expect(again.status).toBe(200)
    expect((await json<{ envelopeId: string }>(again)).envelopeId).toBe(envelopeId)
    expect(await prisma.document.count({ where: { organizationId: alice.organizationId } })).toBe(1)
  })
})

describe("editing the text", () => {
  beforeEach(() => enableAssistant(alice))

  const put = (id: string, json: unknown) =>
    request(alice, `/api/generated-documents/${id}/content`, { method: "PUT", json })

  /** The latest content with one paragraph appended to the Purpose section. */
  function edited(data: GeneratedDocumentData, ...nodes: unknown[]) {
    return {
      ...data.content,
      content: data.content.content.map((s) =>
        s.attrs.id === "purpose"
          ? { ...s, content: [...s.content, { type: "paragraph", content: nodes }] }
          : s,
      ),
    }
  }

  test("an edit is a new version; inserted blanks start unresolved", async () => {
    const id = await createNda(alice)
    const { version } = await detail(alice, id)
    const res = await put(id, {
      baseVersionId: version.id,
      content: edited(
        version.data,
        { type: "text", text: "Fees: ", marks: [{ type: "italic" }] },
        { type: "variable", attrs: { key: "fee" } },
      ),
      newVariables: [{ key: "fee", label: "Fee", type: "amount" }],
    })
    expect(res.status).toBe(200)
    const d = await detail(alice, id)
    expect(d.version.number).toBe(2)
    expect(d.version.data.variables.find((v) => v.key === "fee")).toMatchObject({
      label: "Fee",
      value: null,
      status: "unresolved",
    })
    expect(d.issues.some((i) => i.variableKey === "fee")).toBe(true)
    expect(JSON.stringify(d.version.data.content)).toContain("Fees: ")
  })

  test("applies over answers given meanwhile, but not over another text edit", async () => {
    const id = await createNda(alice)
    const v1 = (await detail(alice, id)).version
    await request(alice, `/api/generated-documents/${id}/variables`, {
      method: "POST",
      json: {
        baseVersionId: v1.id,
        source: "answer",
        values: [{ key: "governing_law", value: "Kenya" }],
      },
    })
    const res = await put(id, {
      baseVersionId: v1.id,
      content: edited(v1.data, { type: "text", text: "First edit." }),
    })
    expect(res.status).toBe(200)
    const d = await detail(alice, id)
    expect(d.version.number).toBe(3)
    expect(d.version.data.variables.find((v) => v.key === "governing_law")?.value).toBe("Kenya")

    const stale = await put(id, {
      baseVersionId: v1.id,
      content: edited(v1.data, { type: "text", text: "Second edit." }),
    })
    expect(stale.status).toBe(409)
    expect((await json<{ error: string }>(stale)).error).toBe("stale_version")
  })

  test("refuses text that refers to a blank that doesn't exist, or reuses a key", async () => {
    const id = await createNda(alice)
    const { version } = await detail(alice, id)
    const unknown = await put(id, {
      baseVersionId: version.id,
      content: edited(version.data, { type: "variable", attrs: { key: "nowhere" } }),
    })
    expect(unknown.status).toBe(400)
    const reused = await put(id, {
      baseVersionId: version.id,
      content: version.data.content,
      newVariables: [{ key: "term", label: "Again", type: "text" }],
    })
    expect(reused.status).toBe(400)
    expect((await detail(alice, id)).version.number).toBe(1)
  })
})
