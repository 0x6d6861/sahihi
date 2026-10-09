"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { organization } from "@/lib/auth-client"
import { HOME_HREF } from "@/lib/nav"

/**
 * Leave the active workspace (better-auth `organization.leave`). Afterwards the next workspace you
 * belong to becomes active, or you create one on /onboarding.
 */
export function LeaveWorkspace({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function leave() {
    const { error } = await organization.leave({ organizationId: id })
    if (error) {
      toastManager.add({ title: "Could not leave", description: error.message, type: "error" })
      throw new Error(error.message)
    }
    const { data: remaining } = await organization.list()
    const next = remaining?.find((o) => o.id !== id)
    if (next) await organization.setActive({ organizationId: next.id })
    router.push(next ? HOME_HREF : "/onboarding")
    router.refresh()
  }

  return (
    <>
      <div>
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          Leave workspace
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Leave ${name}?`}
        description="You lose access to its documents, envelopes and templates. Envelopes you sent keep going; owners and admins can still manage them. Someone has to invite you to come back."
        confirmLabel="Leave"
        onConfirm={leave}
      />
    </>
  )
}
