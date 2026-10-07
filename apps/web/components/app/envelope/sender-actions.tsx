"use client"

import {
  type EnvelopeStatus,
  type RecipientRole,
  type RecipientStatus,
  reminderAvailability,
} from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { BanIcon, BellIcon, MailIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button as ArcButton } from "@/components/arc/button/button"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Textarea } from "@/components/arc/textarea/textarea"
import { ApiError, api } from "@/lib/api"
import { reminderHint, statusSummary } from "@/lib/envelope-status"

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toastManager.add({ title: `${what} copied`, type: "success" })
  } catch {
    toastManager.add({ title: `Couldn't copy the ${what.toLowerCase()}`, type: "error" })
  }
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Please try again.")

type SummaryInput = Parameters<typeof statusSummary>[0]

/**
 * Header actions for a sent envelope: copy a status summary, and void while it's still open.
 * `canVoid` is the API's `permissions.manage` (the creator, an admin or the owner).
 */
export function EnvelopeHeaderActions({
  envelopeId,
  summary,
  canVoid: allowed,
  actions,
}: {
  envelopeId: string
  summary: SummaryInput
  canVoid: boolean
  /** Extra header buttons, shown first. */
  actions?: React.ReactNode
}) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [open, setOpen] = useState(false)
  const canVoid = allowed && (summary.status === "SENT" || summary.status === "IN_PROGRESS")

  async function voidEnvelope() {
    try {
      await api(`/envelopes/${envelopeId}/void`, {
        method: "POST",
        json: { reason: reason.trim() },
      })
      toastManager.add({
        title: "Envelope voided",
        description: "Signing links no longer work and recipients have been told.",
        type: "success",
      })
      router.refresh()
    } catch (err) {
      toastManager.add({ title: "Could not void", description: errorMessage(err), type: "error" })
      throw err
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions}
      <CopyButton value={statusSummary(summary)} label="Copy status" />
      {canVoid && (
        <>
          <ArcButton variant="danger" onClick={() => setOpen(true)}>
            <BanIcon aria-hidden />
            Void
          </ArcButton>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Void this envelope?"
            description="Every signing link stops working immediately and recipients are emailed. Signatures already given are kept in the audit trail. This can't be undone."
            confirmLabel="Void envelope"
            disabled={!reason.trim()}
            onConfirm={voidEnvelope}
          >
            <Textarea
              label="Reason"
              description="Included in the email to recipients and the audit trail."
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example, sent the wrong version"
            />
          </ConfirmDialog>
        </>
      )}
    </div>
  )
}

/** Per-recipient menu in the Recipients table: send a reminder (throttled), copy their email. */
export function RecipientActionsMenu({
  envelopeId,
  envelopeStatus,
  recipient,
  canRemind,
}: {
  envelopeId: string
  envelopeStatus: EnvelopeStatus
  /** The API's `permissions.manage`: only the creator, an admin or the owner can remind. */
  canRemind: boolean
  recipient: {
    id: string
    name: string
    email: string
    role: RecipientRole
    status: RecipientStatus
    notifiedAt: string | null
    lastRemindedAt: string | null
  }
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [availability, setAvailability] = useState<ReturnType<typeof reminderAvailability> | null>(
    null,
  )

  // Time-based, so computed in the browser only (never during SSR) and refreshed every 30 s to keep
  // the cooldown text current.
  useEffect(() => {
    const compute = () =>
      setAvailability(
        reminderAvailability(
          {
            status: recipient.status,
            notifiedAt: recipient.notifiedAt ? new Date(recipient.notifiedAt) : null,
            lastRemindedAt: recipient.lastRemindedAt ? new Date(recipient.lastRemindedAt) : null,
          },
          envelopeStatus,
        ),
      )
    compute()
    const timer = setInterval(compute, 30_000)
    return () => clearInterval(timer)
  }, [recipient.status, recipient.notifiedAt, recipient.lastRemindedAt, envelopeStatus])
  const hint = availability ? reminderHint(availability) : null

  async function remind() {
    setSending(true)
    try {
      await api(`/envelopes/${envelopeId}/recipients/${recipient.id}/remind`, { method: "POST" })
      toastManager.add({
        title: `Reminder sent to ${recipient.name}`,
        description: "Their previous link no longer works; the email has a new one.",
        type: "success",
      })
      router.refresh()
    } catch (err) {
      const retry =
        err instanceof ApiError
          ? (err.body as { retryAfterSec?: number } | null)?.retryAfterSec
          : undefined
      toastManager.add({
        title: "Reminder not sent",
        description: retry ? `Try again in ${Math.ceil(retry / 60)} min.` : errorMessage(err),
        type: "error",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <DropdownMenu
      label="Actions"
      items={[
        ...(canRemind && recipient.role !== "VIEWER"
          ? [
              {
                // Arc items are one line, so the reason it's unavailable goes in the label.
                label: sending
                  ? "Sending reminder…"
                  : hint
                    ? `Send reminder (${hint.toLowerCase()})`
                    : "Send reminder",
                icon: <BellIcon />,
                disabled: !availability?.ok || sending,
                onSelect: () => void remind(),
              } satisfies DropdownItem,
            ]
          : []),
        {
          label: "Copy email",
          icon: <MailIcon />,
          onSelect: () => void copy(recipient.email, "Email address"),
        },
      ]}
    />
  )
}
