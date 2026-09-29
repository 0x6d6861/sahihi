"use client"

import {
  type EnvelopeStatus,
  type RecipientRole,
  type RecipientStatus,
  reminderAvailability,
} from "@sahihi/core"
import { BanIcon, BellIcon, ClipboardCopyIcon, EllipsisIcon, MailIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toastManager } from "@/components/ui/toast"
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
  const [voiding, setVoiding] = useState(false)
  const canVoid = allowed && (summary.status === "SENT" || summary.status === "IN_PROGRESS")

  async function voidEnvelope() {
    setVoiding(true)
    try {
      await api(`/envelopes/${envelopeId}/void`, {
        method: "POST",
        json: { reason: reason.trim() },
      })
      setOpen(false)
      toastManager.add({
        title: "Envelope voided",
        description: "Signing links no longer work and recipients have been told.",
        type: "success",
      })
      router.refresh()
    } catch (err) {
      toastManager.add({ title: "Could not void", description: errorMessage(err), type: "error" })
    } finally {
      setVoiding(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions}
      <Button variant="outline" onClick={() => copy(statusSummary(summary), "Status")}>
        <ClipboardCopyIcon aria-hidden />
        Copy status
      </Button>
      {canVoid && (
        <AlertDialog open={open} onOpenChange={(o) => !voiding && setOpen(o)}>
          <AlertDialogTrigger render={<Button variant="destructive-outline" />}>
            <BanIcon aria-hidden />
            Void
          </AlertDialogTrigger>
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Void this envelope?</AlertDialogTitle>
              <AlertDialogDescription>
                Every signing link stops working immediately and recipients are emailed. Signatures
                already given are kept in the audit trail. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="px-6">
              <Field>
                <FieldLabel>Reason</FieldLabel>
                <Textarea
                  value={reason}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Sent the wrong version"
                />
                <FieldDescription>
                  Included in the email to recipients and the audit trail.
                </FieldDescription>
              </Field>
            </div>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="ghost" disabled={voiding} />}>
                Cancel
              </AlertDialogClose>
              <Button
                variant="destructive"
                onClick={voidEnvelope}
                disabled={voiding || !reason.trim()}
              >
                {voiding && <Spinner aria-hidden />}
                Void envelope
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
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
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)

  // Computed when the menu opens (not during SSR), so the countdown text is always current.
  const availability = open
    ? reminderAvailability(
        {
          status: recipient.status,
          notifiedAt: recipient.notifiedAt ? new Date(recipient.notifiedAt) : null,
          lastRemindedAt: recipient.lastRemindedAt ? new Date(recipient.lastRemindedAt) : null,
        },
        envelopeStatus,
      )
    : null
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
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${recipient.name}`} />
        }
      >
        {sending ? <Spinner aria-hidden /> : <EllipsisIcon aria-hidden />}
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-56">
        {canRemind && recipient.role !== "VIEWER" && (
          <MenuItem disabled={!availability?.ok || sending} onClick={remind}>
            <BellIcon aria-hidden />
            <span className="flex flex-col">
              <span>Send reminder</span>
              {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
            </span>
          </MenuItem>
        )}
        <MenuItem onClick={() => copy(recipient.email, "Email address")}>
          <MailIcon aria-hidden />
          Copy email
        </MenuItem>
      </MenuPopup>
    </Menu>
  )
}
