"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { ButtonLink } from "@/components/app/button-link"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { ApiError, api } from "@/lib/api"

/**
 * Step 2 of deleting an account (ADR 0040): the emailed link lands here. Nothing happens until
 * the button is pressed (mail scanners open links). Works signed out, on any device.
 */
function DeleteAccountConfirm() {
  const router = useRouter()
  const token = useSearchParams().get("token")
  const [state, setState] = useState<"ready" | "deleted" | "expired">(token ? "ready" : "expired")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await api("/account/delete", { method: "POST", json: { token } })
      setState("deleted")
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
        setState("expired")
      } else {
        setError(err instanceof Error ? err.message : "Could not delete your account")
      }
    } finally {
      setPending(false)
    }
  }

  if (state === "deleted") {
    return (
      <Panel title="Your account is deleted" headingLevel={1} className="w-full max-w-sm">
        <p className="text-muted-foreground text-sm">
          Your personal details and sign-in methods are gone. Thanks for using Sahihi.
        </p>
        <ButtonLink href="/sign-up" variant="ghost" className="w-full">
          Create a new account
        </ButtonLink>
      </Panel>
    )
  }

  if (state === "expired") {
    return (
      <Panel title="This link has expired" headingLevel={1} className="w-full max-w-sm">
        <p className="text-muted-foreground text-sm">
          Deletion links work once and for 1 hour. Start again from Settings → Security.
        </p>
        <ButtonLink href="/settings/security" className="w-full">
          Go to Security settings
        </ButtonLink>
      </Panel>
    )
  }

  return (
    <Panel
      title="Delete your account?"
      description="Your name, email, sign-in methods, picture and saved signatures are erased, and you leave every workspace. Documents and envelopes you created stay with their workspaces. This can't be undone."
      headingLevel={1}
      className="w-full max-w-sm"
    >
      {error && <Alert tone="danger" title={error} />}
      <Button variant="danger" className="w-full" loading={pending} onClick={confirm}>
        Delete my account
      </Button>
      <ButtonLink href="/files" variant="ghost" className="w-full">
        Keep my account
      </ButtonLink>
    </Panel>
  )
}

export default function DeleteAccountPage() {
  return (
    <Suspense>
      <DeleteAccountConfirm />
    </Suspense>
  )
}
