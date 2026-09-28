"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { signIn } from "@/lib/auth-client"

/**
 * REFERENCE PATTERN for forms: coss Form + Field + Input, server errors in an
 * Alert, pending state on the Button. Copy this shape for new forms.
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
    const { error } = await signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not sign in")
    router.push(next)
    router.refresh()
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back to Sahihi.</CardDescription>
      </CardHeader>
      <Form className="contents" onSubmit={onSubmit}>
        <CardPanel className="flex flex-col gap-4">
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field>
            <FieldLabel>Password</FieldLabel>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
        </CardPanel>
        <CardFooter className="flex flex-col gap-2">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <Button variant="link" render={<a href="/sign-up" />}>
            Create an account
          </Button>
        </CardFooter>
      </Form>
    </Card>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}
