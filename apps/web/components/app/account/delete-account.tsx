"use client"

import { RequestAccountDeletionSchema } from "@sahihi/core"
import Link from "next/link"
import { useState } from "react"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { api } from "@/lib/api"

/**
 * Step 1 of deleting the account (ADR 0040): the password, then a confirmation link by email.
 * The last owner of a workspace is told to hand it on (or delete it) first.
 */
export function DeleteAccount({ blockers }: { blockers: { id: string; name: string }[] }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Arc's PasswordField has no error slot, so problems show in one Alert above it.
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (blockers.length > 0) {
    return (
      <Alert tone="warning" title="You're the only owner of a workspace">
        Make someone else an owner of {blockers.map((b) => b.name).join(", ")} in{" "}
        <Link href="/settings/members" className="underline underline-offset-4">
          Members
        </Link>
        , or delete it in{" "}
        <Link href="/settings/data" className="underline underline-offset-4">
          Data
        </Link>
        , then come back.
      </Alert>
    )
  }

  if (sentTo) {
    return (
      <Alert tone="info" title="Check your email">
        We sent a link to {sentTo}. Your account is deleted only when you follow it, within 1 hour.
      </Alert>
    )
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = RequestAccountDeletionSchema.safeParse({
      password: String(new FormData(e.currentTarget).get("password") ?? ""),
    })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Enter your password")
    setPending(true)
    setError(null)
    try {
      const { sentTo } = await api<{ sentTo: string }>("/me/deletion", {
        method: "POST",
        json: parsed.data,
      })
      setSentTo(sentTo)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start deleting your account")
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="flex flex-col gap-4 sm:max-w-sm" onSubmit={onSubmit}>
      {error && <Alert tone="danger" title={error} />}
      <PasswordField label="Password" name="password" autoComplete="current-password" required />
      <div>
        <Button type="submit" variant="danger" loading={pending}>
          Email me a link to delete my account
        </Button>
      </div>
    </form>
  )
}
