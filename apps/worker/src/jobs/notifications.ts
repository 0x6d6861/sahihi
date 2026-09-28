import { getEnv } from "@sahihi/config"
import { issueSigningLink, prisma } from "@sahihi/db"
import * as t from "@sahihi/emails"
import { brandFor } from "@sahihi/emails"
import type { NotificationJobs } from "@sahihi/infra"
import type { Job } from "bullmq"
import { sendEmail } from "../lib/mailer"
import { sendSms } from "../lib/sms"

type AnyNotification = {
  [K in keyof NotificationJobs]: Job<NotificationJobs[K], unknown, K>
}[keyof NotificationJobs]

/** Links to completed documents stay valid for 30 days. */
const COMPLETED_LINK_TTL_MS = 30 * 86_400_000

export async function handleNotification(job: AnyNotification) {
  const web = getEnv().WEB_URL
  switch (job.name) {
    case "auth.verify-email": {
      const d = job.data
      return sendEmail({
        to: d.email,
        tag: "auth",
        ...(await t.authLink({
          name: d.name,
          heading: "Verify your email",
          body: "Confirm your email address to finish setting up your Sahihi account.",
          label: "Verify email",
          url: d.url,
        })),
      })
    }
    case "auth.reset-password": {
      const d = job.data
      return sendEmail({
        to: d.email,
        tag: "auth",
        ...(await t.authLink({
          name: d.name,
          heading: "Reset your password",
          body: "Use the button below to choose a new password. The link expires in 1 hour.",
          label: "Reset password",
          url: d.url,
        })),
      })
    }
    case "auth.org-invitation": {
      const d = job.data
      return sendEmail({
        to: d.email,
        tag: "auth",
        ...(await t.authLink({
          name: d.email,
          heading: `Join ${d.organizationName} on Sahihi`,
          body: `${d.inviterName} invited you to join ${d.organizationName}.`,
          label: "Accept invitation",
          url: d.url,
        })),
      })
    }

    case "envelope.invite":
    case "envelope.reminder": {
      const r = await prisma.recipient.findUniqueOrThrow({
        where: { id: job.data.recipientId },
        include: { envelope: { include: { organization: true, createdBy: true } } },
      })
      return sendEmail({
        to: r.email,
        tag: "signing",
        // Replies reach the person who sent it, not a no-reply mailbox.
        replyTo: r.envelope.createdBy.email,
        ...(await t.signingInvite({
          brand: brandFor(r.envelope.organization),
          recipientName: r.name,
          senderName: r.envelope.createdBy.name,
          title: r.envelope.title,
          message: r.envelope.message,
          url: `${web}/sign/${job.data.token}`,
          reminder: job.name === "envelope.reminder",
        })),
      })
    }

    case "recipient.otp": {
      const r = await prisma.recipient.findUniqueOrThrow({ where: { id: job.data.recipientId } })
      if (job.data.channel === "SMS_OTP") {
        if (!r.phone) throw new Error("Recipient has no phone")
        return sendSms(
          r.phone,
          `Your Sahihi code is ${job.data.code}. It expires in 10 minutes. Do not share it.`,
        )
      }
      return sendEmail({
        to: r.email,
        tag: "otp",
        ...(await t.otpEmail({ name: r.name, code: job.data.code })),
      })
    }

    case "envelope.completed": {
      const e = await prisma.envelope.findUniqueOrThrow({
        where: { id: job.data.envelopeId },
        include: { recipients: true, createdBy: true, organization: true },
      })
      const brand = brandFor(e.organization)
      // Fresh links for every recipient (signers + viewers) to fetch the final documents
      const links = await prisma.$transaction(async (tx) => {
        const out: { name: string; email: string; token: string }[] = []
        for (const r of e.recipients) {
          const l = await issueSigningLink(tx, r.id, new Date(Date.now() + COMPLETED_LINK_TTL_MS))
          out.push({ name: r.name, email: r.email, token: l.token })
        }
        return out
      })
      await sendEmail({
        to: e.createdBy.email,
        tag: "completed",
        ...(await t.envelopeCompleted({
          brand,
          name: e.createdBy.name,
          title: e.title,
          url: `${web}/envelopes/${e.id}`,
        })),
      })
      for (const l of links) {
        await sendEmail({
          to: l.email,
          tag: "completed",
          replyTo: e.createdBy.email,
          ...(await t.envelopeCompleted({
            brand,
            name: l.name,
            title: e.title,
            url: `${web}/sign/${l.token}`,
          })),
        })
      }
      return
    }

    case "envelope.declined": {
      const e = await prisma.envelope.findUniqueOrThrow({
        where: { id: job.data.envelopeId },
        include: { recipients: true, createdBy: true, organization: true },
      })
      const decliner = e.recipients.find((r) => r.id === job.data.recipientId)
      const payload = {
        brand: brandFor(e.organization),
        title: e.title,
        declinedBy: decliner?.name ?? "A recipient",
        reason: decliner?.declineReason ?? null,
      }
      await sendEmail({
        to: e.createdBy.email,
        tag: "declined",
        ...(await t.envelopeDeclined({ name: e.createdBy.name, ...payload })),
      })
      for (const r of e.recipients.filter((x) => x.id !== job.data.recipientId && x.notifiedAt)) {
        await sendEmail({
          to: r.email,
          tag: "declined",
          replyTo: e.createdBy.email,
          ...(await t.envelopeDeclined({ name: r.name, ...payload })),
        })
      }
      return
    }

    case "envelope.voided": {
      const e = await prisma.envelope.findUniqueOrThrow({
        where: { id: job.data.envelopeId },
        include: { recipients: true, createdBy: true, organization: true },
      })
      const brand = brandFor(e.organization)
      for (const r of e.recipients.filter((x) => x.notifiedAt && x.status !== "SIGNED")) {
        await sendEmail({
          to: r.email,
          tag: "voided",
          replyTo: e.createdBy.email,
          ...(await t.envelopeVoided({
            brand,
            name: r.name,
            title: e.title,
            reason: e.voidReason,
          })),
        })
      }
      return
    }
  }
}
