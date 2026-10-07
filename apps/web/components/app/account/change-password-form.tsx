"use client"

import { ChangePasswordSchema, MIN_PASSWORD_LENGTH } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { changePassword } from "@/lib/auth-client"

/** Change password (better-auth `change-password`), optionally signing out every other device. */
export function ChangePasswordForm() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [revokeOthers, setRevokeOthers] = useState(true)
  // Arc's PasswordField has no error slot, so problems show in one Alert above the fields.
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const parsed = ChangePasswordSchema.safeParse({
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword: String(form.get("newPassword") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
      revokeOtherSessions: revokeOthers,
    })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the passwords")
    setError(null)
    setPending(true)
    const { error } = await changePassword({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      revokeOtherSessions: parsed.data.revokeOtherSessions,
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not change your password")
    formRef.current?.reset()
    toastManager.add({
      title: "Password changed",
      description: revokeOthers ? "Your other devices were signed out." : undefined,
      type: "success",
    })
    router.refresh()
  }

  return (
    <form ref={formRef} className="flex flex-col gap-4 sm:max-w-sm" onSubmit={onSubmit}>
      {error && <Alert tone="danger" title={error} />}
      <PasswordField
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        required
      />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        required
      />
      <PasswordField
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        required
      />
      <Checkbox
        label="Sign out of other devices"
        checked={revokeOthers}
        onCheckedChange={(v) => setRevokeOthers(v === true)}
      />
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Change password
        </Button>
      </div>
    </form>
  )
}
