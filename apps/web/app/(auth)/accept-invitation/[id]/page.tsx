"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { AuthForm } from "@/components/app/auth/auth-form"
import { Button } from "@/components/app/button"
import { Alert } from "@/components/arc/alert/alert"
import { organization } from "@/lib/auth-client"
import { HOME_HREF } from "@/lib/nav"

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
    router.push(HOME_HREF)
  }

  return (
    <AuthForm title="Join workspace">
      {error && <Alert tone="danger" title={error} />}
      <Button className="w-full" onClick={accept} loading={pending}>
        Accept invitation
      </Button>
    </AuthForm>
  )
}
