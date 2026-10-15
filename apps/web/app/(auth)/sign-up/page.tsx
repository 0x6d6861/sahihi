"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { AuthForm } from "@/components/app/auth/auth-form"
import { Button } from "@/components/app/button"
import { Input, PasswordField } from "@/components/app/fields"
import { SIGNUP_EMAIL_KEY } from "@/components/app/signing/account-invite"
import { Alert } from "@/components/arc/alert/alert"
import { signUp } from "@/lib/auth-client"

function SignUpForm() {
  // Arriving from a signing page (ADR 0062): the signer's email is prefilled from sessionStorage
  // (never the URL), and after confirming it they may skip creating a workspace.
  const fromSigning = useSearchParams().get("from") === "signing"
  const [prefill, setPrefill] = useState("")
  useEffect(() => {
    if (!fromSigning) return
    try {
      setPrefill(sessionStorage.getItem(SIGNUP_EMAIL_KEY) ?? "")
    } catch {
      // Private mode: they type it.
    }
  }, [fromSigning])
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
      callbackURL: fromSigning ? "/signed" : "/onboarding",
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not create account")
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <AuthForm
        title="Check your email"
        description={`We sent a verification link to ${sentTo}.`}
      />
    )
  }

  return (
    <AuthForm
      title={fromSigning ? "Keep track of what you sign" : "Create your account"}
      description={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="danger" title={error} />}
        <Input label="Full name" name="name" autoComplete="name" required />
        {fromSigning ? (
          <Input
            key={prefill}
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={prefill}
            description="The address the document was sent to. Documents sent to it appear in your account once you confirm it."
            required
          />
        ) : (
          <Input label="Work email" name="email" type="email" autoComplete="email" required />
        )}
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
    </AuthForm>
  )
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  )
}
