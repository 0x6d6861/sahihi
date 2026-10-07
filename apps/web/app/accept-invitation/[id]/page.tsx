"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { organization } from "@/lib/auth-client"

export default function AcceptInvitationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function accept() {
    setPending(true)
    const { data, error } = await organization.acceptInvitation({ invitationId: id })
    if (error || !data) {
      setPending(false)
      return setError(
        error?.message ?? "Could not accept invitation. Sign in with the invited email first.",
      )
    }
    await organization.setActive({ organizationId: data.invitation.organizationId })
    router.push("/documents")
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Panel
        title="Join workspace"
        description="You've been invited to a Sahihi workspace."
        headingLevel={1}
        className="w-full max-w-sm"
      >
        {error && <Alert tone="danger" title={error} />}
        <Button className="w-full" onClick={accept} loading={pending}>
          Accept invitation
        </Button>
      </Panel>
    </main>
  )
}
