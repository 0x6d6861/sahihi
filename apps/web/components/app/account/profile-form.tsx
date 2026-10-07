"use client"

import { UpdateProfileSchema } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { updateUser } from "@/lib/auth-client"

/** Your display name (better-auth `update-user`). */
export function ProfileForm({ name }: { name: string }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = UpdateProfileSchema.safeParse({ name: value })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your name")
    setError(null)
    setPending(true)
    const { error } = await updateUser({ name: parsed.data.name })
    setPending(false)
    if (error) {
      toastManager.add({ title: "Not saved", description: error.message, type: "error" })
      return
    }
    toastManager.add({ title: "Name saved", type: "success" })
    router.refresh()
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="sm:max-w-sm">
        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          value={value}
          maxLength={80}
          error={error ?? undefined}
          description="Shown to recipients on envelopes you send and in invitations."
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
