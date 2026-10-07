"use client"

import { InviteMemberSchema, type OrgRole } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { UserPlusIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { RadioGroup } from "@/components/arc/radio-group/radio-group"
import { organization } from "@/lib/auth-client"
import { type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"
import { MEMBER_ROLE_DESCRIPTIONS, MEMBER_ROLE_LABELS } from "@/lib/members"

/**
 * "Invite member": better-auth creates the invitation and enqueues the email
 * (auth.org-invitation → /accept-invitation/<id>). `roles` comes from `invitableRoles`.
 */
export function InviteDialog({ roles }: { roles: OrgRole[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<OrgRole>(
    roles.includes("member") ? "member" : (roles[0] ?? "member"),
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const [pending, setPending] = useState(false)

  function reset(next: boolean) {
    if (pending) return
    setOpen(next)
    if (!next) {
      setEmail("")
      setErrors({})
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = InviteMemberSchema.safeParse({ email, role })
    if (!parsed.success) return setErrors(issuesToFormErrors(parsed.error.issues))
    setErrors({})
    setPending(true)
    const { error } = await organization.inviteMember(parsed.data)
    setPending(false)
    if (error) {
      // "Already a member" / "already invited" belong to the email field.
      return setErrors({ email: error.message ?? "Could not send the invitation" })
    }
    toastManager.add({
      title: "Invitation sent",
      description: `${parsed.data.email} can join as ${MEMBER_ROLE_LABELS[parsed.data.role]}.`,
      type: "success",
    })
    reset(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon aria-hidden />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Invite a member"
        description="They get an email with a link to join. The link works for 48 hours."
      >
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <Input
            label="Email"
            name="email"
            type="email"
            value={email}
            autoComplete="off"
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.co.ke"
          />
          {/* Up to three roles, each with what it can do: a radio group, not a select. */}
          <RadioGroup
            label="Role"
            name="role"
            value={role}
            onValueChange={(v) => setRole(v as OrgRole)}
            options={roles.map((r) => ({
              value: r,
              label: MEMBER_ROLE_LABELS[r],
              description: MEMBER_ROLE_DESCRIPTIONS[r],
            }))}
          />
          {errors.role && (
            <p role="alert" className="text-destructive-foreground text-sm">
              {errors.role}
            </p>
          )}
          <DialogActions>
            <Button variant="ghost" type="button" disabled={pending} onClick={() => reset(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Send invitation
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  )
}
