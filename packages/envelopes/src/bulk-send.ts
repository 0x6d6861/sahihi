import {
  type BulkRow,
  billingPeriod,
  type CreateBulkSendInput,
  renderBulkTitle,
  type TemplateForUse,
  validateBulkRows,
} from "@sahihi/core"
import { countEnvelopesSent, getOrgPlan, notifyUsers, Prisma, prisma } from "@sahihi/db"
import { getQueues } from "@sahihi/infra"
import { EnvelopeError, notFound } from "./errors"
import { createEnvelopeFromTemplate } from "./from-template"
import { type Actor, sendEnvelope } from "./send"

async function loadTemplate(templateId: string, organizationId: string) {
  const t = await prisma.template.findFirst({
    where: { id: templateId, organizationId },
    include: {
      document: { select: { status: true, deletedAt: true } },
      roles: {
        select: {
          id: true,
          label: true,
          role: true,
          order: true,
          verification: true,
          colorIndex: true,
          name: true,
          email: true,
          phone: true,
        },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!t) notFound("Template")
  return t as NonNullable<typeof t>
}

/**
 * Validate every row (like a single "Use template"), check the plan has room for all of them,
 * then record the batch and queue it for the worker (docs/bulk-send.md). All-or-nothing: any
 * invalid row → 400 with every row's issues and nothing created.
 */
export async function startBulkSend(input: {
  templateId: string
  organizationId: string
  actor: Actor
  data: CreateBulkSendInput
}) {
  const template = await loadTemplate(input.templateId, input.organizationId)
  if (template.document.status !== "READY" || template.document.deletedAt) {
    throw new EnvelopeError(
      400,
      "document_unavailable",
      "This template's document is no longer available",
    )
  }
  const forUse: TemplateForUse = {
    signingOrder: template.signingOrder,
    roles: template.roles,
    fields: [],
  }
  const issues = validateBulkRows(forUse, input.data.rows)
  if (issues.length > 0) {
    throw new EnvelopeError(400, "validation_error", `${issues.length} problem(s) in the rows`, {
      issues: issues.map((i) => ({ path: `rows.${i.row - 1}`, row: i.row, message: i.message })),
    })
  }
  // Refuse up front when the batch can't fit (sends still check the quota one by one).
  const plan = await getOrgPlan(prisma, input.organizationId)
  if (plan.envelopesPerMonth !== null) {
    const used = await countEnvelopesSent(prisma, input.organizationId, billingPeriod())
    const left = Math.max(0, plan.envelopesPerMonth - used)
    if (input.data.rows.length > left) {
      throw new EnvelopeError(
        402,
        "quota_exceeded",
        `This batch has ${input.data.rows.length} envelopes but your ${plan.name} plan has ${left} left this month.`,
        { plan: plan.id, limit: plan.envelopesPerMonth, used, left },
      )
    }
  }

  const bulk = await prisma.bulkSend.create({
    data: {
      organizationId: input.organizationId,
      templateId: template.id,
      createdById: input.actor.userId,
      apiKeyId: input.actor.apiKeyId ?? null,
      title: input.data.title,
      message: input.data.message ?? null,
      total: input.data.rows.length,
      items: {
        create: input.data.rows.map((r, i) => ({
          row: i + 1,
          recipients: r.recipients as unknown as Prisma.InputJsonValue,
        })),
      },
    },
  })
  await getQueues().maintenance.add(
    "bulk.send",
    { bulkSendId: bulk.id },
    { jobId: `bulk-${bulk.id}` },
  )
  return bulk
}

/**
 * Worker: create and send one envelope per pending row. Two phases per row (draft id saved
 * before sending), so a retry after a crash sends the existing draft instead of duplicating it.
 * A row that fails (e.g. quota reached mid-batch) is recorded and the batch continues.
 */
export async function processBulkSend(bulkSendId: string) {
  const bulk = await prisma.bulkSend.findUnique({ where: { id: bulkSendId } })
  if (!bulk || bulk.status === "DONE") return { skipped: true }
  if (!bulk.templateId) {
    await prisma.bulkSend.update({
      where: { id: bulk.id },
      data: { status: "DONE", completedAt: new Date() },
    })
    return { skipped: true, reason: "template deleted" }
  }
  await prisma.bulkSend.update({ where: { id: bulk.id }, data: { status: "RUNNING" } })
  const template = await loadTemplate(bulk.templateId, bulk.organizationId)
  const forUse: TemplateForUse = {
    signingOrder: template.signingOrder,
    roles: template.roles,
    fields: [],
  }
  const actor: Actor = { userId: bulk.createdById, apiKeyId: bulk.apiKeyId ?? undefined }

  const items = await prisma.bulkSendItem.findMany({
    where: { bulkSendId: bulk.id, status: "PENDING" },
    orderBy: { row: "asc" },
  })
  for (const item of items) {
    try {
      let envelopeId = item.envelopeId
      if (!envelopeId) {
        const row = { recipients: item.recipients } as unknown as BulkRow
        const envelope = await createEnvelopeFromTemplate({
          templateId: template.id,
          organizationId: bulk.organizationId,
          actor,
          data: {
            title: renderBulkTitle(bulk.title, forUse, row),
            message: bulk.message ?? undefined,
            recipients: row.recipients,
          },
          auditExtra: { bulkSendId: bulk.id, row: item.row },
        })
        envelopeId = envelope.id
        await prisma.bulkSendItem.update({ where: { id: item.id }, data: { envelopeId } })
      }
      await sendEnvelope({ envelopeId, organizationId: bulk.organizationId, actor })
      await prisma.$transaction([
        // The row's people now live on the envelope; the batch keeps only the outcome.
        prisma.bulkSendItem.update({
          where: { id: item.id },
          data: { status: "SENT", recipients: Prisma.DbNull, error: null },
        }),
        prisma.bulkSend.update({ where: { id: bulk.id }, data: { sent: { increment: 1 } } }),
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : "Failed"
      await prisma.$transaction([
        prisma.bulkSendItem.update({
          where: { id: item.id },
          data: { status: "FAILED", error: message, recipients: Prisma.DbNull },
        }),
        prisma.bulkSend.update({ where: { id: bulk.id }, data: { failed: { increment: 1 } } }),
      ])
    }
  }
  const done = await prisma.$transaction(async (tx) => {
    const done = await tx.bulkSend.update({
      where: { id: bulk.id },
      data: { status: "DONE", completedAt: new Date() },
    })
    await notifyUsers(tx, {
      organizationId: done.organizationId,
      userIds: [done.createdById],
      type: "bulk_send.finished",
      data: {
        bulkSendId: done.id,
        bulkSendTitle: done.title,
        sent: done.sent,
        failed: done.failed,
      },
    })
    return done
  })
  return { sent: done.sent, failed: done.failed }
}
