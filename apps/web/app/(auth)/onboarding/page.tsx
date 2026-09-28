"use client"

import { useRouter } from "next/navigation"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { organization } from "@/lib/auth-client"

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)

/** First-run: create a workspace (better-auth organization) and make it active. */
export default function OnboardingPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get("name"))
    setPending(true)
    setError(null)
    const suffix = Math.random().toString(36).slice(2, 6)
    const { data, error } = await organization.create({ name, slug: `${slugify(name)}-${suffix}` })
    if (error || !data) {
      setPending(false)
      return setError(error?.message ?? "Could not create workspace")
    }
    await organization.setActive({ organizationId: data.id })
    router.push("/documents")
    router.refresh()
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Name your workspace</CardTitle>
        <CardDescription>Usually your company or team name.</CardDescription>
      </CardHeader>
      <Form className="contents" onSubmit={onSubmit}>
        <CardPanel className="flex flex-col gap-4">
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel>Workspace name</FieldLabel>
            <Input name="name" required maxLength={80} />
          </Field>
        </CardPanel>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Continue"}
          </Button>
        </CardFooter>
      </Form>
    </Card>
  )
}
