"use client"

import { ForgotPasswordSchema } from "@sahihi/core"
import Link from "next/link"
import { useState } from "react"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { authClient } from "@/lib/auth-client"

/**
 * Step 1 of a password reset (docs/auth.md → Web flows): better-auth `request-password-reset`
 * emails a link that lands on /reset-password. The answer is the same whether or not the address
 * has an account, so the page never tells anyone who has signed up.
 */
export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = ForgotPasswordSchema.safeParse({
      email: String(new FormData(e.currentTarget).get("email") ?? ""),
    })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the email")
    setPending(true)
    setError(null)
    const { error } = await authClient.requestPasswordReset({
      email: parsed.data.email,
      redirectTo: "/reset-password",
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not send the link. Try again.")
    setSentTo(parsed.data.email)
  }

  return (
    <Panel
      title="Reset your password"
      description={
        sentTo
          ? undefined
          : "Enter the email you sign in with and we'll send you a link to choose a new password."
      }
      headingLevel={1}
      className="w-full max-w-sm"
    >
      {sentTo ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="Check your email">
            If {sentTo} has a Sahihi account, a reset link is on its way. It expires in 1 hour.
          </Alert>
          <Button variant="ghost" onClick={() => setSentTo(null)}>
            Use another email
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          {error && <Alert tone="danger" title={error} />}
          <Input label="Email" name="email" type="email" autoComplete="email" required />
          <Button type="submit" className="mt-2 w-full" loading={pending}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="text-center text-muted-foreground text-sm">
        Remembered it?{" "}
        <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </Panel>
  )
}
