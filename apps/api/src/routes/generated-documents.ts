import {
  ApiCreateFromDocumentSchema,
  applyProposal,
  applySigners,
  applyVariableUpdates,
  CreateGeneratedDocumentSchema,
  canEditGeneratedDocument,
  canEditWorkspace,
  canUseAssistant,
  envelopeDraftFromGenerated,
  FinalizeGeneratedDocumentSchema,
  findStarter,
  type GeneratedDocumentData,
  GeneratedDocumentDataSchema,
  generationPreflight,
  isProposalStale,
  ProposalPayloadSchema,
  proposalTexts,
  SignersError,
  sha256Hex,
  structureIssues,
  UpdateContentSchema,
  UpdateSignersSchema,
  UpdateVariablesSchema,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { createEnvelopeFromDocument } from "@sahihi/envelopes"
import { keys, putObject } from "@sahihi/infra"
import { composeGeneratedDocument, inspectPdf } from "@sahihi/pdf"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { streamAssistantReply } from "../lib/assistant/assistant"
import { assistantConfigured } from "../lib/assistant/model"
import type { AppEnv } from "../lib/env"
import {
  appendEvent,
  appendVersionOrConflict,
  latestVersion,
  loadGeneratedDocument,
  lockGeneratedDocument,
} from "../lib/generated-documents"
import { badRequest, clientMeta, conflict, forbidden, notFound, parseJson } from "../lib/http"
import { actor } from "../lib/permissions"
import { queueThumbnail } from "../lib/thumbnails"
import { rateLimit } from "../middleware/rate-limit"
import { requireOrg } from "../middleware/session"

/**
 * AI-generated documents (docs/ai-documents.md): start from a starter, fill it in with the
 * assistant, set the signers, then finalise into a READY PDF and a DRAFT envelope.
 * Everyone in the workspace can open them; changing one follows the envelope rule (its creator,
 * an admin or the owner). Everything but the settings needs the assistant to be available.
 */

async function workspaceAiEnabled(organizationId: string) {
  const settings = await prisma.workspaceSettings.findUnique({
    where: { organizationId },
    select: { aiEnabled: true },
  })
  return settings?.aiEnabled ?? false
}

const requireAssistant = createMiddleware<AppEnv>(async (c, next) => {
  const available =
    assistantConfigured() &&
    canUseAssistant(c.get("memberRole")) &&
    (await workspaceAiEnabled(c.get("organizationId")))
  if (!available) {
    return c.json(
      { error: "assistant_unavailable", message: "The AI assistant is off for this workspace" },
      403,
    )
  }
  await next()
})

function assertCanEdit(
  c: Parameters<typeof actor>[0],
  doc: { createdById: string; status: string },
) {
  if (!canEditGeneratedDocument(actor(c), doc)) {
    forbidden("Only its creator, an admin or the owner can change this document")
  }
  if (doc.status !== "DRAFT") conflict("This document is finalised and can't change")
}

export const generatedDocuments = new Hono<AppEnv>()
  .use(requireOrg)

  /** Whether the assistant is available here, and whether the caller may switch it. */
  .get("/settings", async (c) => {
    const role = c.get("memberRole")
    return c.json({
      configured: assistantConfigured(),
      enabled: await workspaceAiEnabled(c.get("organizationId")),
      canUse: canUseAssistant(role),
      canManage: canEditWorkspace(role),
    })
  })

  .put("/settings", async (c) => {
    if (!canEditWorkspace(c.get("memberRole"))) {
      forbidden("Only owners and admins can change the workspace")
    }
    const { enabled } = await parseJson(c, z.object({ enabled: z.boolean() }))
    const organizationId = c.get("organizationId")
    await prisma.workspaceSettings.upsert({
      where: { organizationId },
      create: { organizationId, aiEnabled: enabled },
      update: { aiEnabled: enabled },
    })
    return c.json({ enabled })
  })

  .use(requireAssistant)

  .get("/", async (c) => {
    const items = await prisma.generatedDocument.findMany({
      where: forOrganization(c.get("organizationId")).generatedDocument(),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        envelopeId: true,
        updatedAt: true,
        createdBy: { select: { name: true } },
      },
    })
    return c.json({ items })
  })

  .post("/", async (c) => {
    const { starter: key } = await parseJson(c, CreateGeneratedDocumentSchema)
    const starter = findStarter(key)
    if (!starter) badRequest("Unknown starter")
    const data = starter.build()
    const userId = c.get("user").id
    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.generatedDocument.create({
        data: {
          organizationId: c.get("organizationId"),
          createdById: userId,
          title: data.title,
          starter: starter.key,
          versions: {
            create: {
              number: 1,
              data: data as unknown as object,
              actor: "USER",
              createdById: userId,
              reason: `Started from ${starter.name}`,
            },
          },
        },
        include: { versions: { select: { id: true } } },
      })
      await appendEvent(tx, {
        generatedDocumentId: created.id,
        type: "document.created",
        actor: "USER",
        actorUserId: userId,
        versionId: created.versions[0]?.id,
        data: { starter: starter.key },
      })
      return created
    })
    return c.json({ id: doc.id }, 201)
  })

  .get("/:id", async (c) => {
    const { doc, version } = await loadGeneratedDocument(c.get("organizationId"), c.req.param("id"))
    return c.json({
      document: {
        id: doc.id,
        title: doc.title,
        status: doc.status,
        envelopeId: doc.envelopeId,
        documentId: doc.documentId,
        canEdit: canEditGeneratedDocument(actor(c), doc),
      },
      version: { id: version.id, number: version.number, data: version.data },
      messages: doc.messages,
      issues: generationPreflight(version.data),
      proposals: await proposalViews(doc.id, version.data),
    })
  })

  /** The latest version as a PDF, blanks highlighted. Not stored: rendering is deterministic. */
  .get("/:id/preview", async (c) => {
    const { version } = await loadGeneratedDocument(c.get("organizationId"), c.req.param("id"))
    const { bytes } = await composeGeneratedDocument(version.data, {
      date: version.createdAt,
      allowUnresolved: true,
    })
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
    })
  })

  .post(
    "/:id/chat",
    rateLimit({ bucket: "assistant", limit: 20, windowSec: 60, key: (c) => c.get("user").id }),
    async (c) => {
      const { doc } = await loadGeneratedDocument(c.get("organizationId"), c.req.param("id"))
      assertCanEdit(c, doc)
      const body = await parseJson(
        c,
        z.object({
          messages: z.array(z.unknown()).min(1).max(200),
          /** "Selected section" chip: an id only; the server reads the section itself. */
          selection: z.object({ sectionId: z.string().min(1).max(64) }).nullish(),
        }),
      )
      const organization = await prisma.organization.findUnique({
        where: { id: c.get("organizationId") },
        select: { name: true },
      })
      try {
        return await streamAssistantReply({
          generatedDocumentId: doc.id,
          organizationName: organization?.name ?? "the workspace",
          userId: c.get("user").id,
          messages: body.messages,
          selectedSectionId: body.selection?.sectionId ?? null,
          abortSignal: c.req.raw.signal,
        })
      } catch (err) {
        if (err instanceof Error && err.name === "AI_TypeValidationError") {
          badRequest("The conversation is not in the expected format")
        }
        throw err
      }
    },
  )

  /** Question answers (null = skipped) or direct edits of blanks. */
  .post("/:id/variables", async (c) => {
    const input = await parseJson(c, UpdateVariablesSchema)
    const { doc, version } = await loadGeneratedDocument(c.get("organizationId"), c.req.param("id"))
    assertCanEdit(c, doc)
    if (input.source === "edit" && input.values.some((v) => v.value === null)) {
      badRequest("Enter a value")
    }
    let data: ReturnType<typeof applyVariableUpdates>
    try {
      data = applyVariableUpdates(version.data, input.values, input.source)
    } catch (err) {
      badRequest((err as Error).message)
    }
    const answered = input.values.filter((v) => v.value !== null).length
    const skipped = input.values.length - answered
    const next = await appendVersionOrConflict({
      generatedDocumentId: doc.id,
      baseVersionId: input.baseVersionId,
      data,
      actor: "USER",
      userId: c.get("user").id,
      reason:
        input.source === "edit"
          ? "Edited blanks"
          : [answered && `Answered ${answered}`, skipped && `skipped ${skipped}`]
              .filter(Boolean)
              .join(", "),
      event: {
        type: "variables.updated",
        data: { source: input.source, keys: input.values.map((v) => v.key), skipped },
      },
    })
    return c.json({ version: next, issues: generationPreflight(next.data) })
  })

  /**
   * The text as edited in the editor. Blanks and signers live outside the text, so an edit made
   * on an older version still applies when only they changed since (an answered question while
   * the person was typing); a text change in between is a 409.
   */
  .put("/:id/content", async (c) => {
    const input = await parseJson(c, UpdateContentSchema)
    const { doc, version: latest } = await loadGeneratedDocument(
      c.get("organizationId"),
      c.req.param("id"),
    )
    assertCanEdit(c, doc)
    if (input.baseVersionId !== latest.id) {
      const base = await prisma.generatedDocumentVersion.findFirst({
        where: { id: input.baseVersionId, generatedDocumentId: doc.id },
        select: { data: true },
      })
      if (!base) badRequest("Unknown version")
      const baseContent = GeneratedDocumentDataSchema.parse(base.data).content
      if (JSON.stringify(baseContent) !== JSON.stringify(latest.data.content)) {
        throw new HTTPException(409, {
          res: Response.json(
            {
              error: "stale_version",
              message: "The text changed since you loaded it. Reload to see the latest version.",
            },
            { status: 409 },
          ),
        })
      }
    }
    const taken = input.newVariables.find((v) => latest.data.variables.some((x) => x.key === v.key))
    if (taken) badRequest(`A blank called "${taken.key}" already exists`)
    const data = {
      ...latest.data,
      content: input.content,
      variables: [
        ...latest.data.variables,
        ...input.newVariables.map((v) => ({ ...v, value: null, status: "unresolved" as const })),
      ],
    }
    const issues = structureIssues(data)
    if (issues.length) badRequest(`The document doesn't hold together: ${issues[0]?.code}`)
    const next = await appendVersionOrConflict({
      generatedDocumentId: doc.id,
      baseVersionId: latest.id,
      data,
      actor: "USER",
      userId: c.get("user").id,
      reason: "Edited the text",
      event: {
        type: "content.updated",
        data: { newVariables: input.newVariables.map((v) => v.key) },
      },
    })
    return c.json({ version: next, issues: generationPreflight(next.data) })
  })

  /**
   * Apply an assistant proposal (docs/ai-documents.md → Proposals): a new version made on top of
   * the latest one, unless the section it changes moved on since (then it's out of date, 409).
   * Claiming the proposal and appending the version are one transaction, so it applies once.
   */
  .post("/:id/proposals/:pid/accept", async (c) => {
    const { doc, version: latest } = await loadGeneratedDocument(
      c.get("organizationId"),
      c.req.param("id"),
    )
    assertCanEdit(c, doc)
    const proposal = await loadProposal(doc.id, c.req.param("pid"))
    if (proposal.status !== "PENDING")
      conflict(`This suggestion was already ${proposal.status.toLowerCase()}`)
    const payload = ProposalPayloadSchema.parse(proposal.payload)
    const base = await prisma.generatedDocumentVersion.findUniqueOrThrow({
      where: { id: proposal.baseVersionId },
      select: { data: true },
    })
    const clash = payload.newVariables.some((v) =>
      latest.data.variables.some((x) => x.key === v.key),
    )
    if (
      clash ||
      isProposalStale(payload.change, GeneratedDocumentDataSchema.parse(base.data), latest.data)
    ) {
      await prisma.generatedDocumentProposal.updateMany({
        where: { id: proposal.id, status: "PENDING" },
        data: { status: "STALE" },
      })
      throw new HTTPException(409, {
        res: Response.json(
          {
            error: "stale_proposal",
            message: "The document changed since this was suggested. Ask the assistant again.",
          },
          { status: 409 },
        ),
      })
    }
    const userId = c.get("user").id
    const next = await appendVersionOrConflict({
      generatedDocumentId: doc.id,
      baseVersionId: latest.id,
      data: applyProposal(latest.data, payload),
      actor: "AI",
      userId,
      reason: "Accepted a suggested edit",
      event: { type: "proposal.accepted", data: { proposalId: proposal.id } },
      onAppended: async (tx, versionId) => {
        const claimed = await tx.generatedDocumentProposal.updateMany({
          where: { id: proposal.id, status: "PENDING" },
          data: {
            status: "ACCEPTED",
            resultVersionId: versionId,
            decidedById: userId,
            decidedAt: new Date(),
          },
        })
        if (claimed.count === 0) conflict("This suggestion was already decided")
      },
    })
    return c.json({ version: next, issues: generationPreflight(next.data) })
  })

  .post("/:id/proposals/:pid/reject", async (c) => {
    const { doc } = await loadGeneratedDocument(c.get("organizationId"), c.req.param("id"))
    assertCanEdit(c, doc)
    const proposal = await loadProposal(doc.id, c.req.param("pid"))
    const userId = c.get("user").id
    await prisma.$transaction(async (tx) => {
      const decided = await tx.generatedDocumentProposal.updateMany({
        where: { id: proposal.id, status: "PENDING" },
        data: { status: "REJECTED", decidedById: userId, decidedAt: new Date() },
      })
      if (decided.count === 0)
        conflict(`This suggestion was already ${proposal.status.toLowerCase()}`)
      await appendEvent(tx, {
        generatedDocumentId: doc.id,
        type: "proposal.rejected",
        actor: "USER",
        actorUserId: userId,
        data: { proposalId: proposal.id },
      })
    })
    return c.body(null, 204)
  })

  /** Who signs and where: roles, contacts and each role's fields (`applySigners`). */
  .put("/:id/signers", async (c) => {
    const input = await parseJson(c, UpdateSignersSchema)
    const { doc, version } = await loadGeneratedDocument(c.get("organizationId"), c.req.param("id"))
    assertCanEdit(c, doc)
    let data: ReturnType<typeof applySigners>
    try {
      data = applySigners(version.data, input.signers, () => `f_${crypto.randomUUID().slice(0, 8)}`)
    } catch (err) {
      if (err instanceof SignersError) badRequest(err.message)
      throw err
    }
    const issues = structureIssues(data)
    if (issues.length) badRequest(`The signers don't fit the document: ${issues[0]?.code}`)
    const next = await appendVersionOrConflict({
      generatedDocumentId: doc.id,
      baseVersionId: input.baseVersionId,
      data,
      actor: "USER",
      userId: c.get("user").id,
      reason: "Updated signers",
      event: { type: "roles.updated", data: { keys: input.signers.roles.map((r) => r.key) } },
    })
    return c.json({ version: next, issues: generationPreflight(next.data) })
  })

  /**
   * Render the reviewed version to a READY Document and create its DRAFT envelope, with the
   * signers as recipients and the rendered fields in place. Resumable: if a previous call stored
   * the PDF but failed before the envelope, calling again creates only the envelope (the render is
   * deterministic, so the fields still match the stored PDF).
   */
  .post("/:id/finalize", async (c) => {
    const input = await parseJson(c, FinalizeGeneratedDocumentSchema)
    const orgId = c.get("organizationId")
    const userId = c.get("user").id
    const { doc } = await loadGeneratedDocument(orgId, c.req.param("id"))
    if (!canEditGeneratedDocument(actor(c), doc)) {
      forbidden("Only its creator, an admin or the owner can finalise this document")
    }
    if (doc.envelopeId) return c.json({ envelopeId: doc.envelopeId })
    if (doc.status === "FINALIZED" && doc.finalizedVersionId !== input.versionId) {
      conflict("This document was finalised from another version")
    }

    const row = await prisma.generatedDocumentVersion.findFirst({
      where: { id: input.versionId, generatedDocumentId: doc.id },
      select: { id: true },
    })
    if (!row) badRequest("Unknown version")
    const latest = await latestVersion(prisma, doc.id)
    if (latest.id !== input.versionId) {
      conflict("The document changed since you reviewed it. Review the latest version.")
    }
    const issues = generationPreflight(latest.data)
    if (issues.length) {
      throw new HTTPException(400, {
        res: Response.json(
          { error: "preflight_failed", message: "The document isn't ready to finalise", issues },
          { status: 400 },
        ),
      })
    }

    const composed = await composeGeneratedDocument(latest.data, { date: latest.createdAt })
    let documentId = doc.documentId
    if (!documentId) {
      const id = crypto.randomUUID()
      const s3Key = keys.original(orgId, id)
      // UPLOADING first, like an upload: if storing fails, the maintenance sweep removes it.
      await prisma.document.create({
        data: {
          id,
          organizationId: orgId,
          uploadedById: userId,
          name: `${latest.data.title}.pdf`,
          s3Key,
          sizeBytes: composed.bytes.byteLength,
        },
      })
      await putObject(s3Key, composed.bytes, "application/pdf")
      const info = await inspectPdf(composed.bytes)
      const sha256 = await sha256Hex(composed.bytes)
      await prisma.$transaction(async (tx) => {
        const locked = await lockGeneratedDocument(tx, doc.id)
        if (locked?.status !== "DRAFT") conflict("This document is already being finalised")
        if ((await latestVersion(tx, doc.id)).id !== latest.id) {
          conflict("The document changed since you reviewed it. Review the latest version.")
        }
        await tx.document.update({
          where: { id },
          data: {
            status: "READY",
            sha256,
            pageCount: info.pageCount,
            pages: info.pages as unknown as object,
          },
        })
        await tx.generatedDocument.update({
          where: { id: doc.id },
          data: { status: "FINALIZED", finalizedVersionId: latest.id, documentId: id },
        })
      })
      await queueThumbnail(id)
      documentId = id
    }

    const draft = envelopeDraftFromGenerated(latest.data, composed.fields, composed.pages)
    const envelope = await createEnvelopeFromDocument({
      organizationId: orgId,
      actor: { userId, ...clientMeta(c) },
      data: ApiCreateFromDocumentSchema.parse({
        title: latest.data.title,
        documentIds: [documentId],
        signingOrder: "PARALLEL",
        ...draft,
      }),
    })
    await prisma.$transaction(async (tx) => {
      await tx.generatedDocument.update({
        where: { id: doc.id },
        data: { envelopeId: envelope.id },
      })
      await appendEvent(tx, {
        generatedDocumentId: doc.id,
        type: "document.finalized",
        actor: "USER",
        actorUserId: userId,
        versionId: latest.id,
        data: { documentId, envelopeId: envelope.id, acknowledged: true },
      })
    })
    return c.json({ envelopeId: envelope.id }, 201)
  })

async function loadProposal(generatedDocumentId: string, id: string) {
  const proposal = await prisma.generatedDocumentProposal.findFirst({
    where: { id, generatedDocumentId },
  })
  if (!proposal) notFound("Suggestion")
  return proposal
}

/**
 * The last proposals for the page: before and after text against the version each was made on,
 * and pending ones whose section has moved on reported as STALE.
 */
async function proposalViews(generatedDocumentId: string, latest: GeneratedDocumentData) {
  const rows = await prisma.generatedDocumentProposal.findMany({
    where: { generatedDocumentId },
    orderBy: { createdAt: "desc" },
    take: 30,
  })
  const bases = await prisma.generatedDocumentVersion.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.baseVersionId))] } },
    select: { id: true, data: true },
  })
  const baseData = new Map(bases.map((b) => [b.id, GeneratedDocumentDataSchema.parse(b.data)]))
  return rows.map((r) => {
    const payload = ProposalPayloadSchema.parse(r.payload)
    const base = baseData.get(r.baseVersionId) ?? latest
    const stale = r.status === "PENDING" && isProposalStale(payload.change, base, latest)
    return {
      id: r.id,
      kind: payload.change.kind,
      sectionId: r.sectionId,
      status: stale ? "STALE" : r.status,
      rationale: r.rationale,
      ...proposalTexts(payload, base),
      createdAt: r.createdAt,
    }
  })
}
