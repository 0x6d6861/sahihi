"use client"

import { InviteMemberSchema, type OrgRole } from "@sahihi/core"
import { UserPlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
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
      <DialogTrigger render={<Button />}>
        <UserPlusIcon aria-hidden />
        Invite member
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            They get an email with a link to join. The link works for 48 hours.
          </DialogDescription>
        </DialogHeader>
        <Form errors={errors} onSubmit={onSubmit} className="contents">
          <DialogPanel className="flex flex-col gap-5">
            <Field name="email">
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                value={email}
                autoComplete="off"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.co.ke"
              />
              <FieldError />
            </Field>
            <Field name="role">
              <FieldLabel>Role</FieldLabel>
              <Select
                items={roles.map((r) => ({ value: r, label: MEMBER_ROLE_LABELS[r] }))}
                value={role}
                onValueChange={(v) => v && setRole(v as OrgRole)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {MEMBER_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <FieldDescription>{MEMBER_ROLE_DESCRIPTIONS[role]}</FieldDescription>
              <FieldError />
            </Field>
          </DialogPanel>
          <DialogFooter>
            <Button variant="ghost" type="button" disabled={pending} onClick={() => reset(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner aria-hidden />}
              Send invitation
            </Button>
          </DialogFooter>
        </Form>
      </DialogPopup>
    </Dialog>
  )
}
