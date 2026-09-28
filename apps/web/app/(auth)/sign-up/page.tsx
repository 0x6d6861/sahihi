"use client"

import { useState } from "react"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>We sent a verification link to {sentTo}.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Start sending documents for signature.</CardDescription>
      </CardHeader>
      <Form className="contents" onSubmit={onSubmit}>
        <CardPanel className="flex flex-col gap-4">
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel>Full name</FieldLabel>
            <Input name="name" autoComplete="name" required />
          </Field>
          <Field>
            <FieldLabel>Work email</FieldLabel>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field>
            <FieldLabel>Password</FieldLabel>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
            <FieldDescription>At least 10 characters.</FieldDescription>
          </Field>
        </CardPanel>
        <CardFooter className="flex flex-col gap-2">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
          <Button variant="link" render={<a href="/sign-in" />}>
            I already have an account
          </Button>
        </CardFooter>
      </Form>
    </Card>
  )
}
