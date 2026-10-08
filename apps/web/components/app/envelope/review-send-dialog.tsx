"use client"

import type { PreflightIssue } from "@sahihi/core"
import { DialogActions } from "@/components/app/confirm-dialog"
import { DIALOG_WITH_POPOVERS, RevealPopovers } from "@/components/app/dialog-popovers"
import { SendIcon } from "@/components/app/icons"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { DatePicker } from "@/components/arc/date-picker/date-picker"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { Switch } from "@/components/arc/switch/switch"
import { Textarea } from "@/components/arc/textarea/textarea"
import type { EnvelopeDetails, FormErrors } from "@/lib/envelope-form"

function startOfToday() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Errors with no input of their own in the dialog (fields, document), listed together. */
const isUnplacedError = (key: string) =>
  key === "form" || key === "documentId" || key.startsWith("fields")

/**
 * "Review & send": the envelope's title, message, signing order and expiry, then Send or save.
 * The same controls and rules as the new-envelope form. Opened by Send in the draft editor
 * (ADR 0021). Preflight issues (a signer without a signature field…) are listed above the buttons.
 */
export function ReviewSendDialog({
  open,
  onOpenChange,
  details,
  onDetailsChange,
  errors,
  issues,
  pending,
  onSend,
  onSaveDraft,
  saveLabel = "Save changes",
  description = "Each recipient gets an email with their own signing link.",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  details: EnvelopeDetails
  onDetailsChange: (patch: Partial<EnvelopeDetails>) => void
  errors: FormErrors
  issues: PreflightIssue[]
  pending: "send" | "draft" | null
  onSend: () => void
  onSaveDraft: () => void
  saveLabel?: string
  description?: string
}) {
  const unplaced = Object.entries(errors).filter(([key]) => isUnplacedError(key))

  return (
    <Dialog open={open} onOpenChange={(o) => pending === null && onOpenChange(o)}>
      <DialogContent
        title="Review & send"
        description={description}
        // Room for the expiry DatePicker's calendar (it would be cut off at the dialog's edge).
        className={DIALOG_WITH_POPOVERS}
      >
        <RevealPopovers>
          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              onSend()
            }}
          >
            <Input
              label="Title"
              name="title"
              value={details.title}
              maxLength={200}
              description="Recipients see this in the email subject."
              error={errors.title}
              onChange={(e) => onDetailsChange({ title: e.target.value })}
            />

            {/* High in the form: the calendar opens downwards and needs the room below it. */}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <DatePicker
                  label="Expires (optional)"
                  value={details.expiresOn ?? undefined}
                  onChange={(day) => onDetailsChange({ expiresOn: day ?? null })}
                  minDate={startOfToday()}
                  placeholder="No expiry"
                  locale="en-GB"
                  description="Links stop working at the end of this day."
                />
                {/* Arc's DatePicker has no error state: say it below, announced. */}
                {errors.expiresAt && (
                  <p role="alert" className="pt-1.5 text-destructive-foreground text-xs">
                    {errors.expiresAt}
                  </p>
                )}
              </div>
              {details.expiresOn && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onDetailsChange({ expiresOn: null })}
                >
                  Clear
                </Button>
              )}
            </div>

            <Textarea
              label="Message (optional)"
              name="message"
              value={details.message}
              maxLength={2000}
              rows={3}
              error={errors.message}
              onChange={(e) => onDetailsChange({ message: e.target.value })}
              placeholder="Hi, please review and sign."
            />

            <div className="flex flex-col gap-1.5">
              <Switch
                label="Sign in order"
                checked={details.sequential}
                onCheckedChange={(sequential) => onDetailsChange({ sequential })}
              />
              <p className="text-muted-foreground text-sm">
                {details.sequential
                  ? "Recipients are invited one after another, following their step."
                  : "Everyone is invited at the same time."}
              </p>
            </div>

            {issues.length > 0 && (
              <Alert tone="warning" title="Before you send">
                <ul className="list-disc ps-4">
                  {issues.map((i) => (
                    <li key={`${i.code}-${i.recipientId ?? ""}`}>{i.message}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {unplaced.length > 0 && (
              <Alert tone="danger" title="Fix these first">
                <ul className="list-disc ps-4">
                  {unplaced.map(([key, msg]) => (
                    <li key={key}>{msg}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <DialogActions>
              <Button
                type="button"
                variant="ghost"
                disabled={pending !== null}
                onClick={() => onOpenChange(false)}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="secondary"
                loading={pending === "draft"}
                disabled={pending === "send"}
                onClick={onSaveDraft}
              >
                {saveLabel}
              </Button>
              <Button type="submit" loading={pending === "send"} disabled={pending === "draft"}>
                <SendIcon aria-hidden />
                Send
              </Button>
            </DialogActions>
          </form>
        </RevealPopovers>
      </DialogContent>
    </Dialog>
  )
}
