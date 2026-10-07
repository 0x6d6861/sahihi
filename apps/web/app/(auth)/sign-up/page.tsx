"use client"

import Link from "next/link"
import { useState } from "react"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { signUp } from "@/lib/auth-client"

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get("email"))
    setPending(true)
    setError(null)
    const { error } = await signUp.email({
      name: String(form.get("name")),
      email,
      password: String(form.get("password")),
      callbackURL: "/onboarding",
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not create account")
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <Panel
        title="Check your email"
        description={`We sent a verification link to ${sentTo}.`}
        headingLevel={1}
        className="w-full max-w-sm"
      />
    )
  }

  return (
    <Panel
      title="Create your account"
      description="Start sending documents for signature."
      headingLevel={1}
      className="w-full max-w-sm"
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="danger" title={error} />}
        <Input label="Full name" name="name" autoComplete="name" required />
        <Input label="Work email" name="email" type="email" autoComplete="email" required />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          description="At least 10 characters."
          required
        />
        <Button type="submit" className="mt-2 w-full" loading={pending}>
          Create account
        </Button>
      </form>
      <p className="text-center text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </Panel>
  )
}
