"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Join workspace</CardTitle>
          <CardDescription>You've been invited to a Sahihi workspace.</CardDescription>
        </CardHeader>
        {error && (
          <div className="px-6">
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}
        <CardFooter>
          <Button className="w-full" onClick={accept} disabled={pending}>
            Accept invitation
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
