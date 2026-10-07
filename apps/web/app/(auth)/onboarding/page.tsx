"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
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
    <Panel
      title="Name your workspace"
      description="Usually your company or team name."
      headingLevel={1}
      className="w-full max-w-sm"
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="danger" title={error} />}
        <Input label="Workspace name" name="name" required maxLength={80} />
        <Button type="submit" className="mt-2 w-full" loading={pending}>
          Continue
        </Button>
      </form>
    </Panel>
  )
}
