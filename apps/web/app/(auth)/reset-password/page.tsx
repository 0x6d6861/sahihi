"use client"

import { MIN_PASSWORD_LENGTH, ResetPasswordSchema } from "@sahihi/core"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { ButtonLink } from "@/components/app/button-link"
import { Panel } from "@/components/app/panel"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { authClient } from "@/lib/auth-client"

/**
 * Step 2 of a password reset: the emailed link goes through better-auth, which checks the token
 * and lands here with `?token=…` (or `?error=INVALID_TOKEN`). Saving signs out every device
 * (`revokeSessionsOnPasswordReset`), so the user signs in again with the new password.
 */
function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token")
  // Arc's PasswordField has no error slot, so problems show in one Alert above the fields.
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!token || params.get("error")) {
    return (
      <Panel title="This link doesn't work" headingLevel={1} className="w-full max-w-sm">
        <p className="text-muted-foreground text-sm">
          {params.get("error")
            ? "Reset links work once and for 1 hour. Ask for a new one."
            : "Open the link from the reset email, or ask for a new one."}
        </p>
        <ButtonLink href="/forgot-password" variant="primary" className="w-full">
          Send a new link
        </ButtonLink>
      </Panel>
    )
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const parsed = ResetPasswordSchema.safeParse({
      newPassword: String(form.get("newPassword") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
    })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the passwords")
    setPending(true)
    setError(null)
    const { error } = await authClient.resetPassword({
      newPassword: parsed.data.newPassword,
      token: token as string,
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not reset your password")
    toastManager.add({
      title: "Password changed",
      description: "Sign in with your new password.",
      type: "success",
    })
    router.push("/sign-in")
  }

  return (
    <Panel
      title="Choose a new password"
      description="You'll be signed out everywhere and can sign in again with it."
      headingLevel={1}
      className="w-full max-w-sm"
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="danger" title={error} />}
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
        <Button type="submit" className="mt-2 w-full" loading={pending}>
          Save password
        </Button>
      </form>
      <p className="text-center text-muted-foreground text-sm">
        <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </Panel>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
