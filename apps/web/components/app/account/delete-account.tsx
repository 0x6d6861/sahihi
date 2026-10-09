"use client"

import { RequestAccountDeletionSchema } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { api } from "@/lib/api"
import { organization } from "@/lib/auth-client"
import { formatDate, formatDateTime } from "@/lib/format"

/**
 * Step 1 of deleting the account (ADR 0040): the password, then a confirmation link by email.
 * The last owner of a workspace is told to hand it on (or delete it) first.
 */
/** A workspace the user is the last owner of (`GET /me/deletion`). */
export interface DeletionBlocker {
  id: string
  name: string
  createdAt: string
}

export function DeleteAccount({ blockers }: { blockers: DeletionBlocker[] }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Arc's PasswordField has no error slot, so problems show in one Alert above it.
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (blockers.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <Alert
          tone="warning"
          title={
            blockers.length === 1
              ? "You're the only owner of a workspace"
              : `You're the only owner of ${blockers.length} workspaces`
          }
        >
          Make someone else an owner, or delete the workspace, then come back.
        </Alert>
        <ul className="flex flex-col divide-y rounded-xl border">
          {blockers.map((b) => (
            <BlockerRow
              key={b.id}
              blocker={b}
              // Same-named workspaces are often made the same day: add the time to tell them apart.
              withTime={blockers.some((o) => o.id !== b.id && o.name === b.name)}
            />
          ))}
        </ul>
      </div>
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

/**
 * One blocking workspace. Members and Data act on the active workspace, so both switch to this one
 * first. The creation date (and time, for repeated names) tells apart workspaces with the same name.
 */
function BlockerRow({ blocker, withTime }: { blocker: DeletionBlocker; withTime: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)

  async function open(href: string) {
    setPending(href)
    const { error } = await organization.setActive({ organizationId: blocker.id })
    if (error) {
      setPending(null)
      toastManager.add({
        title: "Could not switch workspace",
        description: error.message,
        type: "error",
      })
      return
    }
    router.push(href)
    router.refresh()
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 ps-4 pe-2">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-sm">{blocker.name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          Created {withTime ? formatDateTime(blocker.createdAt) : formatDate(blocker.createdAt)}
        </span>
      </div>
      <span className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          loading={pending === "/settings/members"}
          disabled={pending !== null}
          onClick={() => open("/settings/members")}
        >
          Members
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={pending === "/settings/data"}
          disabled={pending !== null}
          onClick={() => open("/settings/data")}
        >
          Delete workspace
        </Button>
      </span>
    </li>
  )
}
