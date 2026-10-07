"use client"

import { UpdateWorkspaceSchema } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { organization } from "@/lib/auth-client"

/** Rename the active workspace (better-auth `organization.update`, owners and admins). */
export function WorkspaceNameForm({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = UpdateWorkspaceSchema.safeParse({ name: value })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the name")
    setError(null)
    setPending(true)
    const { error } = await organization.update({
      organizationId: id,
      data: { name: parsed.data.name },
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not rename the workspace")
    toastManager.add({ title: "Workspace renamed", type: "success" })
    router.refresh()
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="sm:max-w-sm">
        <Input
          label="Workspace name"
          value={value}
          maxLength={80}
          error={error ?? undefined}
          description="Recipients see it in signing emails and on the signing page."
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div>
        <Button
          type="submit"
          variant="secondary"
          loading={pending}
          disabled={value.trim() === name}
        >
          Save
        </Button>
      </div>
    </form>
  )
}
