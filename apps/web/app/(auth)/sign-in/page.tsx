"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { signIn } from "@/lib/auth-client"
import { HOME_HREF } from "@/lib/nav"

/**
 * REFERENCE PATTERN for forms: a native form with Arc fields (label, description and error on the
 * field itself), server errors in an Alert, pending state on the Button. Copy this shape for new forms.
 */
function SignInForm() {
  const router = useRouter()
  const next = useSearchParams().get("next") ?? HOME_HREF
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [passkeyPending, setPasskeyPending] = useState(false)

  const finish = useCallback(() => {
    router.push(next)
    router.refresh()
  }, [router, next])

  // Passkeys in the email field's autofill (WebAuthn conditional UI), where the browser offers them.
  // A passkey is a full sign-in: no password, no second step.
  useEffect(() => {
    let active = true
    void (async () => {
      const available = await window.PublicKeyCredential?.isConditionalMediationAvailable?.()
      if (!available || !active) return
      const { data } = await signIn.passkey({ autoFill: true })
      if (data && active) finish()
    })()
    return () => {
      active = false
    }
  }, [finish])

  async function withPasskey() {
    setPasskeyPending(true)
    setError(null)
    const { data, error } = await signIn.passkey()
    setPasskeyPending(false)
    if (data) return finish()
    // Closing the browser's prompt isn't an error worth showing.
    const code = error && "code" in error ? error.code : undefined
    if (error && code !== "AUTH_CANCELLED" && code !== "ERROR_CEREMONY_ABORTED") {
      setError(error.message ?? "Could not sign in with a passkey")
    }
  }

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
    finish()
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
        <Input label="Email" name="email" type="email" autoComplete="email webauthn" required />
        <div className="flex flex-col gap-1.5">
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            required
          />
          <Link
            href="/forgot-password"
            className="self-end text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="mt-2 w-full" loading={pending}>
          Sign in
        </Button>
      </form>
      <div className="flex items-center gap-3 text-muted-foreground text-xs" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button variant="secondary" className="w-full" loading={passkeyPending} onClick={withPasskey}>
        Sign in with a passkey
      </Button>
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
