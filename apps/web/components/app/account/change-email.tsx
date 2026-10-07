"use client"

import { ChangeEmailSchema } from "@sahihi/core"
import { useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { changeEmail } from "@/lib/auth-client"

/**
 * Current email and the change flow (better-auth `change-email`): a confirmation goes to the
 * current address first, then a verification link to the new one. Nothing changes until both
 * links are followed.
 */
export function ChangeEmail({ email, verified }: { email: string; verified: boolean }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sentFor, setSentFor] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = ChangeEmailSchema.safeParse({ newEmail: value })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the email")
    if (parsed.data.newEmail === email) return setError("That's already your email")
    setError(null)
    setPending(true)
    const { error } = await changeEmail({
      newEmail: parsed.data.newEmail,
      callbackURL: "/settings/profile",
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not start the change")
    setSentFor(parsed.data.newEmail)
    setOpen(false)
    setValue("")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-sm">{email}</span>
        <Badge tone={verified ? "success" : "warning"} size="sm">
          {verified ? "Verified" : "Not verified"}
        </Badge>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Change email
        </Button>
      </div>
      {sentFor && (
        <Alert tone="info" title="Check your inbox">
          {`We sent a confirmation link to ${email}. After you confirm, we'll send a link to ${sentFor} to verify it. Your email changes once both are done.`}
        </Alert>
      )}

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent
          title="Change email"
          description={`You'll confirm the change from ${email}, then verify the new address.`}
        >
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <Input
              label="New email"
              type="email"
              autoComplete="email"
              value={value}
              error={error ?? undefined}
              onChange={(e) => setValue(e.target.value)}
              required
            />
            <DialogActions>
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Send confirmation
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
