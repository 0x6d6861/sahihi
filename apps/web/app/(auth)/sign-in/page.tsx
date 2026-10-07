"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { signIn } from "@/lib/auth-client"

/**
 * REFERENCE PATTERN for forms: a native form with Arc fields (label, description and error on the
 * field itself), server errors in an Alert, pending state on the Button. Copy this shape for new forms.
 */
function SignInForm() {
  const router = useRouter()
  const next = useSearchParams().get("next") ?? "/documents"
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    const { data, error } = await signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not sign in")
    // Two-factor accounts get no session yet: the second step finishes signing in.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      return router.push(`/sign-in/two-factor?next=${encodeURIComponent(next)}`)
    }
    router.push(next)
    router.refresh()
  }

  return (
    <Panel
      title="Sign in"
      description="Welcome back to Sahihi."
      headingLevel={1}
      className="w-full max-w-sm"
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="danger" title={error} />}
        <Input label="Email" name="email" type="email" autoComplete="email" required />
        <PasswordField label="Password" name="password" autoComplete="current-password" required />
        <Button type="submit" className="mt-2 w-full" loading={pending}>
          Sign in
        </Button>
      </form>
      <p className="text-center text-muted-foreground text-sm">
        New to Sahihi?{" "}
        <Link href="/sign-up" className="text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </Panel>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}
