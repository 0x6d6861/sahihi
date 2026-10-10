import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import {
  currentSigners,
  documentFields,
  type GeneratedDocumentData,
  type SignersDefinition,
  STARTERS,
  sha256Hex,
} from "@sahihi/core"
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
  return toolThenReply("set_variables", { values })
}

/** A model that calls `toolName` with `input` once, then replies "Done." */
function toolThenReply(toolName: string, input: unknown) {
  let call = 0
  const toolCall = [
    {
      type: "tool-call" as const,
      toolCallId: `call-${crypto.randomUUID()}`,
      toolName,
      input: JSON.stringify(input),
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
  const signers = await putSigners(sender, id, (def) => {
    def.roles = def.roles.map((r) =>
      r.key === "party_a"
        ? { ...r, name: "Amina Otieno", email: "amina@example.com" }
        : { ...r, name: "Peter Kamau", email: "peter@example.org" },
    )
  })
  expect(signers.status).toBe(200)
  return (await json<{ version: { id: string } }>(signers)).version.id
}

/** Reads the document's signers, lets `change` edit them, and saves them. */
async function putSigners(sender: Sender, id: string, change: (def: SignersDefinition) => void) {
  const { version } = await detail(sender, id)
  const def = currentSigners(version.data)
  change(def)
  return request(sender, `/api/generated-documents/${id}/signers`, {
    method: "PUT",
    json: { baseVersionId: version.id, signers: def },
  })
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
    expect(versionId).toBeTruthy()
    const res = await putSigners(alice, id, (def) => {
      def.roles = def.roles.map((r) =>
        r.key === "party_b" ? { ...r, email: "AMINA@example.com" } : r,
      )
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

describe("assistant proposals", () => {
  beforeEach(() => enableAssistant(alice))

  type Proposal = {
    id: string
    status: string
    sectionId: string | null
    before: string
    after: string
    rationale: string
  }

  const chat = (id: string, text: string) =>
    request(alice, `/api/generated-documents/${id}/chat`, {
      method: "POST",
      json: { messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }] },
    })

  async function propose(id: string, input: Record<string, unknown>, said = "Tighten it up") {
    setAssistantModelForTests(
      toolThenReply("propose_section_edit", {
        operation: "replace",
        rationale: "Shorter",
        ...input,
      }),
    )
    const res = await chat(id, said)
    expect(res.status).toBe(200)
    return res.text()
  }

  const proposals = async (id: string) =>
    (
      await json<Detail & { proposals: Proposal[] }>(
        await request(alice, `/api/generated-documents/${id}`),
      )
    ).proposals

  const decide = (id: string, pid: string, action: "accept" | "reject") =>
    request(alice, `/api/generated-documents/${id}/proposals/${pid}/${action}`, { method: "POST" })

  const purposeDraft = {
    sectionId: "purpose",
    section: {
      title: "Purpose",
      blocks: [
        { type: "paragraph", text: "The Parties discuss {{purpose}} for {{project_name}}." },
      ],
    },
    newBlanks: [{ key: "project_name", label: "Project name", type: "text" }],
  }

  test("a proposal waits for the person; accepting makes a version, once", async () => {
    const id = await createNda(alice)
    await propose(id, purposeDraft)
    const [p] = await proposals(id)
    expect(p).toMatchObject({ status: "PENDING", sectionId: "purpose", rationale: "Shorter" })
    expect(p?.before).toContain("[Purpose of the disclosure]")
    expect(p?.after).toContain("[Project name]")
    expect((await detail(alice, id)).version.number).toBe(1)

    const res = await decide(id, p?.id as string, "accept")
    expect(res.status).toBe(200)
    const d = await detail(alice, id)
    expect(d.version.number).toBe(2)
    expect(JSON.stringify(d.version.data.content)).toContain("The Parties discuss ")
    expect(d.version.data.variables.find((v) => v.key === "project_name")?.status).toBe(
      "unresolved",
    )
    const version = await prisma.generatedDocumentVersion.findFirstOrThrow({
      where: { generatedDocumentId: id, number: 2 },
    })
    expect(version.actor).toBe("AI")
    expect((await proposals(id))[0]?.status).toBe("ACCEPTED")

    expect((await decide(id, p?.id as string, "accept")).status).toBe(409)
    expect((await decide(id, p?.id as string, "reject")).status).toBe(409)
  })

  test("rejecting changes nothing", async () => {
    const id = await createNda(alice)
    await propose(id, purposeDraft)
    const [p] = await proposals(id)
    expect((await decide(id, p?.id as string, "reject")).status).toBe(204)
    expect((await proposals(id))[0]?.status).toBe("REJECTED")
    expect((await detail(alice, id)).version.number).toBe(1)
  })

  test("out of date once its section changed; blanks changing doesn't count", async () => {
    const id = await createNda(alice)
    await propose(id, purposeDraft)
    const [p] = await proposals(id)
    const v1 = (await detail(alice, id)).version
    await request(alice, `/api/generated-documents/${id}/variables`, {
      method: "POST",
      json: {
        baseVersionId: v1.id,
        source: "edit",
        values: [{ key: "purpose", value: "a pilot" }],
      },
    })
    expect((await proposals(id))[0]?.status).toBe("PENDING")

    const v2 = (await detail(alice, id)).version
    const content = structuredClone(v2.data.content)
    const purpose = content.content.find((s) => s.attrs.id === "purpose")
    if (purpose) purpose.attrs.title = "Why we talk"
    await request(alice, `/api/generated-documents/${id}/content`, {
      method: "PUT",
      json: { baseVersionId: v2.id, content },
    })
    expect((await proposals(id))[0]?.status).toBe("STALE")
    const res = await decide(id, p?.id as string, "accept")
    expect(res.status).toBe(409)
    expect((await json<{ error: string }>(res)).error).toBe("stale_proposal")
    expect((await detail(alice, id)).version.data.content.content[1]?.attrs.title).toBe(
      "Why we talk",
    )
  })

  test("invented specifics never reach the person", async () => {
    const id = await createNda(alice)
    const body = await propose(id, {
      sectionId: "term",
      section: { title: "Term", blocks: [{ type: "paragraph", text: "It runs for 2 years." }] },
    })
    expect(body).toContain("never said")
    expect(await proposals(id)).toEqual([])
    const refused = await prisma.generatedDocumentEvent.findFirst({
      where: { generatedDocumentId: id, type: "proposal.refused" },
    })
    expect(refused).not.toBeNull()
  })

  test("other members can't decide", async () => {
    const id = await createNda(alice)
    await propose(id, purposeDraft)
    const [p] = await proposals(id)
    const bob = await joinOrganization(alice, "bob", "member")
    expect(
      (
        await request(bob, `/api/generated-documents/${id}/proposals/${p?.id}/accept`, {
          method: "POST",
        })
      ).status,
    ).toBe(403)
  })
})

describe("signers", () => {
  beforeEach(() => enableAssistant(alice))

  test("a witness who initials every page, a copy for legal, and extra fields reach the envelope", async () => {
    const id = await createNda(alice)
    await fillEverything(alice, id)
    const res = await putSigners(alice, id, (def) => {
      def.roles.push(
        {
          key: "witness",
          label: "Witness",
          recipientRole: "SIGNER",
          name: "Wanjiru Kariuki",
          email: "wanjiru@example.net",
          initialsOnEveryPage: true,
        },
        {
          key: "legal",
          label: "Legal team",
          recipientRole: "VIEWER",
          name: "Legal",
          email: "legal@example.com",
          initialsOnEveryPage: false,
        },
      )
      def.fields.witness = [
        { fieldType: "SIGNATURE", required: true },
        { fieldType: "TEXT", label: "ID number", required: true },
        { fieldType: "CHECKBOX", label: "I saw both parties sign", required: true },
      ]
    })
    expect(res.status).toBe(200)
    const d = await detail(alice, id)
    expect(d.issues).toEqual([])

    const finalize = await request(alice, `/api/generated-documents/${id}/finalize`, {
      method: "POST",
      json: { versionId: d.version.id, acknowledged: true },
    })
    expect(finalize.status).toBe(201)
    const { envelopeId } = await json<{ envelopeId: string }>(finalize)
    const envelope = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelopeId },
      include: { recipients: { orderBy: { colorIndex: "asc" } }, fields: true, documents: true },
    })
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: envelope.documents[0]?.documentId as string },
    })
    expect(envelope.recipients.map((r) => [r.name, r.role])).toEqual([
      ["Amina Otieno", "SIGNER"],
      ["Peter Kamau", "SIGNER"],
      ["Wanjiru Kariuki", "SIGNER"],
      ["Legal", "VIEWER"],
    ])
    const witness = envelope.recipients[2]?.id
    const witnessFields = envelope.fields.filter((f) => f.recipientId === witness)
    expect(witnessFields.filter((f) => f.type === "INITIALS")).toHaveLength(
      document.pageCount as number,
    )
    expect(
      new Set(witnessFields.filter((f) => f.type === "INITIALS").map((f) => f.page)).size,
    ).toBe(document.pageCount as number)
    expect(
      witnessFields
        .map((f) => f.type)
        .filter((t) => t !== "INITIALS")
        .sort(),
    ).toEqual(["CHECKBOX", "SIGNATURE", "TEXT"])
    expect(witnessFields.find((f) => f.type === "TEXT")?.label).toBe("ID number")
    expect(envelope.fields.some((f) => f.recipientId === envelope.recipients[3]?.id)).toBe(false)
    const preflight = await json<{ issues: unknown[] }>(
      await request(alice, `/api/envelopes/${envelopeId}/preflight`),
    )
    expect(preflight.issues).toEqual([])
  })

  test("refuses fields for someone who only gets a copy", async () => {
    const id = await createNda(alice)
    const res = await putSigners(alice, id, (def) => {
      def.roles = def.roles.map((r) =>
        r.key === "party_b" ? { ...r, recipientRole: "VIEWER" } : r,
      )
    })
    expect(res.status).toBe(400)
  })

  test("the assistant proposes signers; contacts it wasn't given are refused", async () => {
    const id = await createNda(alice)
    const roles = [
      { key: "party_a", label: "Employer", recipientRole: "SIGNER" },
      { key: "party_b", label: "Employee", recipientRole: "SIGNER", initialsOnEveryPage: true },
    ]
    const fields = {
      party_a: [{ fieldType: "SIGNATURE" }],
      party_b: [{ fieldType: "SIGNATURE" }, { fieldType: "DATE_SIGNED" }],
    }
    setAssistantModelForTests(
      toolThenReply("define_signers", {
        roles: roles.map((r) => (r.key === "party_b" ? { ...r, email: "emp@example.com" } : r)),
        fields,
        rationale: "Employment roles",
      }),
    )
    const refused = await request(alice, `/api/generated-documents/${id}/chat`, {
      method: "POST",
      json: {
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Set signers" }] }],
      },
    })
    expect(await refused.text()).toContain("never said")

    setAssistantModelForTests(
      toolThenReply("define_signers", { roles, fields, rationale: "Employment roles" }),
    )
    const ok = await request(alice, `/api/generated-documents/${id}/chat`, {
      method: "POST",
      json: {
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Set signers" }] }],
      },
    })
    expect(ok.status).toBe(200)
    await ok.text()
    const d = await json<Detail & { proposals: { id: string; after: string }[] }>(
      await request(alice, `/api/generated-documents/${id}`),
    )
    const proposal = d.proposals[0]
    expect(proposal?.after).toContain("Employee (signs, initials every page)")
    const accept = await request(
      alice,
      `/api/generated-documents/${id}/proposals/${proposal?.id}/accept`,
      {
        method: "POST",
      },
    )
    expect(accept.status).toBe(200)
    const after = await detail(alice, id)
    expect(after.version.data.roles.map((r) => [r.label, r.initialsOnEveryPage])).toEqual([
      ["Employer", false],
      ["Employee", true],
    ])
    const b = currentSigners(after.version.data).fields.party_b ?? []
    expect(b.map((f) => f.fieldType)).toEqual(["SIGNATURE", "DATE_SIGNED"])
  })
})

describe("starters", () => {
  beforeEach(() => enableAssistant(alice))

  test.each(STARTERS.map((s) => [s.key] as const))(
    "%s goes from a fresh draft to an envelope that can be sent",
    async (starter) => {
      const created = await request(alice, "/api/generated-documents", {
        method: "POST",
        json: { starter },
      })
      expect(created.status).toBe(201)
      const { id } = await json<{ id: string }>(created)
      const { version } = await detail(alice, id)
      const filled = await request(alice, `/api/generated-documents/${id}/variables`, {
        method: "POST",
        json: {
          baseVersionId: version.id,
          source: "answer",
          values: version.data.variables.map((v) => ({ key: v.key, value: `${v.label} value` })),
        },
      })
      expect(filled.status).toBe(200)
      const signers = await putSigners(alice, id, (def) => {
        def.roles = def.roles.map((r, i) => ({
          ...r,
          name: `Person ${i + 1}`,
          email: `person${i + 1}@example.com`,
        }))
      })
      expect(signers.status).toBe(200)
      const { version: ready } = await json<{ version: { id: string } }>(signers)

      const res = await request(alice, `/api/generated-documents/${id}/finalize`, {
        method: "POST",
        json: { versionId: ready.id, acknowledged: true },
      })
      expect(res.status).toBe(201)
      const { envelopeId } = await json<{ envelopeId: string }>(res)
      const envelope = await prisma.envelope.findUniqueOrThrow({
        where: { id: envelopeId },
        include: { recipients: true, fields: true },
      })
      expect(envelope.recipients).toHaveLength(version.data.roles.length)
      expect(envelope.fields).toHaveLength(documentFields(version.data.content).length)
      const preflight = await json<{ issues: unknown[] }>(
        await request(alice, `/api/envelopes/${envelopeId}/preflight`),
      )
      expect(preflight.issues).toEqual([])
    },
  )
})

describe("templates", () => {
  beforeEach(() => enableAssistant(alice))

  /** An offer letter with every blank and both contacts filled in. */
  async function filledOffer() {
    const created = await request(alice, "/api/generated-documents", {
      method: "POST",
      json: { starter: "offer-letter" },
    })
    const { id } = await json<{ id: string }>(created)
    const { version } = await detail(alice, id)
    await request(alice, `/api/generated-documents/${id}/variables`, {
      method: "POST",
      json: {
        baseVersionId: version.id,
        source: "answer",
        values: version.data.variables.map((v) => ({ key: v.key, value: `${v.label} value` })),
      },
    })
    const signers = await putSigners(alice, id, (def) => {
      def.roles = def.roles.map((r) =>
        r.key === "employer"
          ? { ...r, name: "Wanjiru Kariuki", email: "hr@acme.example" }
          : { ...r, name: "Otieno Ouma", email: "otieno@example.com" },
      )
    })
    const { version: filled } = await json<{ version: { id: string } }>(signers)
    return { id, versionId: filled.id }
  }

  const save = (sender: Sender, id: string, body: Record<string, unknown>) =>
    request(sender, `/api/generated-documents/${id}/template`, { method: "POST", json: body })

  test("keeps only the chosen values and contacts; a new document starts from it", async () => {
    const { id, versionId } = await filledOffer()
    const res = await save(alice, id, {
      versionId,
      name: "Acme offer letter",
      keepValues: ["employer_name", "employer_address"],
      keepContacts: ["employer"],
    })
    expect(res.status).toBe(201)
    const { id: templateId } = await json<{ id: string }>(res)

    const stored = await prisma.generationTemplate.findUniqueOrThrow({ where: { id: templateId } })
    expect(stored).toMatchObject({ starter: "offer-letter", sourceGeneratedDocumentId: id })
    const data = stored.data as unknown as GeneratedDocumentData
    expect(data.variables.filter((v) => v.value !== null).map((v) => v.key)).toEqual([
      "employer_name",
      "employer_address",
    ])
    expect(data.roles.map((r) => r.email)).toEqual(["hr@acme.example", null])

    // The event names what was kept, never the values.
    const event = await prisma.generatedDocumentEvent.findFirstOrThrow({
      where: { generatedDocumentId: id, type: "template.saved" },
    })
    expect(event.data).toEqual({
      templateId,
      keptValues: ["employer_name", "employer_address"],
      keptContacts: ["employer"],
    })
    expect(JSON.stringify(event.data)).not.toContain("Employer's name value")

    const list = await json<{ items: { id: string; name: string; canManage: boolean }[] }>(
      await request(alice, "/api/generated-documents/templates"),
    )
    expect(list.items.map((t) => [t.id, t.name, t.canManage])).toEqual([
      [templateId, "Acme offer letter", true],
    ])

    const started = await request(alice, "/api/generated-documents", {
      method: "POST",
      json: { templateId },
    })
    expect(started.status).toBe(201)
    const { id: newId } = await json<{ id: string }>(started)
    const fresh = await detail(alice, newId)
    expect(fresh.version.data).toEqual(data)
    expect(fresh.messages).toEqual([])
    expect(
      (await prisma.generatedDocument.findUniqueOrThrow({ where: { id: newId } })).templateId,
    ).toBe(templateId)
    // Only what was cleared is left to do.
    expect(fresh.issues.some((i) => i.variableKey === "employer_name")).toBe(false)
    expect(fresh.issues.some((i) => i.variableKey === "salary")).toBe(true)
    const roleIssues = fresh.issues.filter((i) => i.roleKey)
    expect(roleIssues.length).toBeGreaterThan(0)
    expect(roleIssues.every((i) => i.roleKey === "candidate")).toBe(true)
  })

  test("refuses to keep what isn't filled in, and versions of other documents", async () => {
    const { id, versionId } = await filledOffer()
    const nda = await createNda(alice)
    const { version: ndaVersion } = await detail(alice, nda)
    expect(
      (await save(alice, nda, { versionId: ndaVersion.id, name: "x", keepValues: ["term"] }))
        .status,
    ).toBe(400)
    expect((await save(alice, id, { versionId, name: "x", keepValues: ["nope"] })).status).toBe(400)
    expect((await save(alice, id, { versionId: ndaVersion.id, name: "x" })).status).toBe(404)
  })

  test("any member can save and use one; only its saver, an admin or the owner delete it", async () => {
    const { id, versionId } = await filledOffer()
    const bob = await joinOrganization(alice, "bob", "member")
    const carol = await joinOrganization(alice, "carol", "member")
    const res = await save(bob, id, { versionId, name: "Bob's offer" })
    expect(res.status).toBe(201)
    const { id: templateId } = await json<{ id: string }>(res)

    const started = await request(carol, "/api/generated-documents", {
      method: "POST",
      json: { templateId },
    })
    expect(started.status).toBe(201)
    const { id: carolsDoc } = await json<{ id: string }>(started)

    const carolList = await json<{ items: { canManage: boolean }[] }>(
      await request(carol, "/api/generated-documents/templates"),
    )
    expect(carolList.items.map((t) => t.canManage)).toEqual([false])
    const del = (s: Sender) =>
      request(s, `/api/generated-documents/templates/${templateId}`, { method: "DELETE" })
    expect((await del(carol)).status).toBe(403)
    expect((await del(alice)).status).toBe(204)
    expect((await del(alice)).status).toBe(404)

    // Documents started from it keep their content.
    const after = await detail(carol, carolsDoc)
    expect(after.version.data.title).toBe("Offer of Employment")
    expect(
      (await prisma.generatedDocument.findUniqueOrThrow({ where: { id: carolsDoc } })).templateId,
    ).toBeNull()
  })

  test("another workspace's template can't be used or deleted", async () => {
    const { id, versionId } = await filledOffer()
    const { id: templateId } = await json<{ id: string }>(
      await save(alice, id, { versionId, name: "Private" }),
    )
    const mallory = await createSender("mallory")
    await enableAssistant(mallory)
    expect(
      (
        await request(mallory, "/api/generated-documents", {
          method: "POST",
          json: { templateId },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await request(mallory, `/api/generated-documents/templates/${templateId}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(404)
    const list = await json<{ items: unknown[] }>(
      await request(mallory, "/api/generated-documents/templates"),
    )
    expect(list.items).toEqual([])
  })
})

describe("finalize, resumed", () => {
  beforeEach(() => enableAssistant(alice))

  test("concurrent calls after the PDF is stored create one envelope, its fields locked", async () => {
    const id = await createNda(alice)
    const versionId = await fillEverything(alice, id)
    const first = await request(alice, `/api/generated-documents/${id}/finalize`, {
      method: "POST",
      json: { versionId, acknowledged: true },
    })
    expect(first.status).toBe(201)
    // A call that stored the PDF and then failed before linking an envelope.
    await prisma.generatedDocument.update({ where: { id }, data: { envelopeId: null } })
    const before = await prisma.envelope.count({ where: { organizationId: alice.organizationId } })

    const call = () =>
      request(alice, `/api/generated-documents/${id}/finalize`, {
        method: "POST",
        json: { versionId, acknowledged: true },
      })
    const results = await Promise.all([call(), call()])
    const ids = await Promise.all(results.map((r) => json<{ envelopeId: string }>(r)))
    expect(results.map((r) => r.status).sort()).toEqual([200, 201])
    expect(ids[0]?.envelopeId).toBe(ids[1]?.envelopeId as string)
    expect(await prisma.envelope.count({ where: { organizationId: alice.organizationId } })).toBe(
      before + 1,
    )
    const linked = await prisma.generatedDocument.findUniqueOrThrow({ where: { id } })
    expect(linked.envelopeId).toBe(ids[0]?.envelopeId as string)
    const fields = await prisma.field.findMany({
      where: { envelopeId: linked.envelopeId as string },
    })
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every((f) => f.locked)).toBe(true)
  })
})

describe("locked fields in the envelope", () => {
  beforeEach(() => enableAssistant(alice))

  async function finalized() {
    const id = await createNda(alice)
    const versionId = await fillEverything(alice, id)
    const res = await request(alice, `/api/generated-documents/${id}/finalize`, {
      method: "POST",
      json: { versionId, acknowledged: true },
    })
    const { envelopeId } = await json<{ envelopeId: string }>(res)
    const envelope = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelopeId },
      include: { recipients: { orderBy: { colorIndex: "asc" } }, fields: true, documents: true },
    })
    return { id, envelope }
  }

  test("finalising locks every field; the editor's saves keep them and add others", async () => {
    const { envelope } = await finalized()
    expect(envelope.fields.length).toBeGreaterThan(0)
    expect(envelope.fields.every((f) => f.locked)).toBe(true)
    const signer = envelope.recipients[0]
    const doc = envelope.documents[0]
    if (!signer || !doc) throw new Error("fixture")

    // A save without them (what the editor sends) leaves them; a new field is added unlocked.
    const extra = {
      recipientId: signer.id,
      envelopeDocumentId: doc.id,
      type: "TEXT",
      page: 1,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.03,
      required: false,
      label: "Reference",
    }
    const saved = await request(alice, `/api/envelopes/${envelope.id}/fields`, {
      method: "PUT",
      json: { fields: [extra] },
    })
    expect(saved.status).toBe(200)
    // Sending a locked field back unchanged doesn't duplicate it.
    const lockedOne = envelope.fields[0]
    if (!lockedOne) throw new Error("fixture")
    const again = await request(alice, `/api/envelopes/${envelope.id}/fields`, {
      method: "PUT",
      json: {
        fields: [
          extra,
          {
            recipientId: lockedOne.recipientId,
            envelopeDocumentId: lockedOne.envelopeDocumentId,
            type: lockedOne.type,
            page: lockedOne.page,
            x: lockedOne.x,
            y: lockedOne.y,
            width: lockedOne.width,
            height: lockedOne.height,
            required: lockedOne.required,
          },
        ],
      },
    })
    expect(again.status).toBe(200)
    const after = await prisma.field.findMany({ where: { envelopeId: envelope.id } })
    expect(
      after
        .filter((f) => f.locked)
        .map((f) => f.id)
        .sort(),
    ).toEqual(envelope.fields.map((f) => f.id).sort())
    expect(after.filter((f) => !f.locked).map((f) => f.label)).toEqual(["Reference"])

    // Cleared by a save of nothing, the unlocked one goes and the locked ones stay.
    await request(alice, `/api/envelopes/${envelope.id}/fields`, {
      method: "PUT",
      json: { fields: [] },
    })
    expect(await prisma.field.count({ where: { envelopeId: envelope.id } })).toBe(
      envelope.fields.length,
    )
  })

  test("its signers can't be removed or made viewers; contacts can change", async () => {
    const { envelope } = await finalized()
    const people = envelope.recipients.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
    }))
    const put = (recipients: unknown[]) =>
      request(alice, `/api/envelopes/${envelope.id}/recipients`, {
        method: "PUT",
        json: { recipients },
      })
    const removed = await put(people.slice(1))
    expect(removed.status).toBe(409)
    expect((await json<{ error: string }>(removed)).error).toBe("locked_fields")
    expect((await put(people.map((p, i) => (i === 0 ? { ...p, role: "VIEWER" } : p)))).status).toBe(
      409,
    )
    const renamed = await put(
      people.map((p, i) => (i === 0 ? { ...p, email: "amina@acme.example" } : p)),
    )
    expect(renamed.status).toBe(200)
    expect(await prisma.field.count({ where: { envelopeId: envelope.id, locked: true } })).toBe(
      envelope.fields.length,
    )
  })

  test("its document can't be swapped for another", async () => {
    const { envelope } = await finalized()
    const res = await request(alice, `/api/envelopes/${envelope.id}/document`, {
      method: "PUT",
      json: { documentId: "another", envelopeDocumentId: envelope.documents[0]?.id },
    })
    expect(res.status).toBe(409)
    expect((await json<{ error: string }>(res)).error).toBe("locked_fields")
  })
})

describe("new versions", () => {
  beforeEach(() => enableAssistant(alice))

  test("a finalised document starts one new draft with its text, blanks and signers", async () => {
    const id = await createNda(alice)
    expect(
      (await request(alice, `/api/generated-documents/${id}/new-version`, { method: "POST" }))
        .status,
    ).toBe(409)
    const versionId = await fillEverything(alice, id)
    const fin = await request(alice, `/api/generated-documents/${id}/finalize`, {
      method: "POST",
      json: { versionId, acknowledged: true },
    })
    const { envelopeId } = await json<{ envelopeId: string }>(fin)

    const bob = await joinOrganization(alice, "bob", "member")
    expect(
      (await request(bob, `/api/generated-documents/${id}/new-version`, { method: "POST" })).status,
    ).toBe(403)

    const res = await request(alice, `/api/generated-documents/${id}/new-version`, {
      method: "POST",
    })
    expect(res.status).toBe(201)
    const { id: nextId } = await json<{ id: string }>(res)
    const finalized = await detail(alice, id)
    const next = await json<Detail & { document: { previousId: string | null } }>(
      await request(alice, `/api/generated-documents/${nextId}`),
    )
    expect(next.document.status).toBe("DRAFT")
    expect(next.document.previousId).toBe(id)
    expect(next.version.data).toEqual(finalized.version.data)
    expect(next.issues).toEqual([])
    expect(
      (finalized as unknown as { document: { newVersionId: string } }).document.newVersionId,
    ).toBe(nextId)

    // Asking again returns the same one; the finalised document and envelope are untouched.
    const again = await request(alice, `/api/generated-documents/${id}/new-version`, {
      method: "POST",
    })
    expect(again.status).toBe(200)
    expect((await json<{ id: string }>(again)).id).toBe(nextId)
    expect(await prisma.generatedDocument.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "FINALIZED",
      envelopeId,
    })
    expect(
      await prisma.generatedDocumentEvent.count({
        where: { generatedDocumentId: id, type: "document.new_version" },
      }),
    ).toBe(1)
  })
})

describe("assistant quota", () => {
  beforeEach(() => enableAssistant(alice))

  const turns = (generatedDocumentId: string, count: number, occurredAt = new Date()) =>
    prisma.generatedDocumentEvent.createMany({
      data: Array.from({ length: count }, () => ({
        generatedDocumentId,
        type: "assistant.turn",
        actor: "AI" as const,
        occurredAt,
      })),
    })

  const setPlan = (plan: string) =>
    prisma.subscription.upsert({
      where: { organizationId: alice.organizationId },
      create: { organizationId: alice.organizationId, plan },
      update: { plan },
    })

  test("the plan's monthly replies: refused with 402 once used, shown on the plan page", async () => {
    await setPlan("free")
    const id = await createNda(alice)
    // Last month's replies and another workspace's don't count.
    await turns(id, 40, new Date(Date.now() - 40 * 24 * 3600 * 1000))
    const mallory = await createSender("mallory")
    await enableAssistant(mallory)
    const theirs = await request(mallory, "/api/generated-documents", {
      method: "POST",
      json: { starter: "mutual-nda" },
    })
    await turns((await json<{ id: string }>(theirs)).id, 40)
    await turns(id, 29)

    const chat = () =>
      request(alice, `/api/generated-documents/${id}/chat`, {
        method: "POST",
        json: { messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Hi" }] }] },
      })
    const ok = await chat()
    expect(ok.status).toBe(200)
    await ok.text()

    const billing = await json<{ assistant: { used: number; limit: number; level: string } }>(
      await request(alice, "/api/billing"),
    )
    expect(billing.assistant).toEqual({ used: 30, limit: 30, level: "exceeded" })

    const refused = await chat()
    expect(refused.status).toBe(402)
    const body = await json<{ error: string; message: string; limit: number; used: number }>(
      refused,
    )
    expect(body).toMatchObject({ error: "assistant_quota_exceeded", limit: 30, used: 30 })
    expect(body.message).toContain("30 AI assistant replies")

    // Editing by hand still works.
    const { version } = await detail(alice, id)
    const edit = await request(alice, `/api/generated-documents/${id}/variables`, {
      method: "POST",
      json: { baseVersionId: version.id, source: "edit", values: [{ key: "term", value: "x" }] },
    })
    expect(edit.status).toBe(200)

    // A bigger plan lifts it.
    await setPlan("starter")
    const after = await chat()
    expect(after.status).toBe(200)
    await after.text()
  })
})

describe("selected section", () => {
  beforeEach(() => enableAssistant(alice))

  test("travels as message metadata; the assistant gets that section from the document", async () => {
    const id = await createNda(alice)
    const prompts: string[] = []
    const reply = [
      { type: "text-start" as const, id: "t" },
      { type: "text-delta" as const, id: "t", delta: "Sure." },
      { type: "text-end" as const, id: "t" },
      {
        type: "finish" as const,
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
      },
    ]
    setAssistantModelForTests(
      new MockLanguageModelV4({
        doStream: async (options) => {
          prompts.push(JSON.stringify(options.prompt))
          return { stream: simulateReadableStream({ chunks: reply }) }
        },
      }),
    )
    const res = await request(alice, `/api/generated-documents/${id}/chat`, {
      method: "POST",
      json: {
        messages: [
          {
            id: "m1",
            role: "user",
            parts: [{ type: "text", text: "Is this long enough?" }],
            metadata: { custom: { selection: { sectionId: "term" } } },
          },
        ],
      },
    })
    expect(res.status).toBe(200)
    await res.text()
    expect(prompts[0]).toContain("# Selected section")
    expect(prompts[0]).toContain("Term")
    // Kept with the conversation, so the chip shows again on reload.
    const d = await detail(alice, id)
    expect(JSON.stringify(d.messages)).toContain('"sectionId":"term"')
  })
})
