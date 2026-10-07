"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Trash2Icon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { organization } from "@/lib/auth-client"

/**
 * Owner-only: delete the workspace with everything in it (docs/data-retention.md → Deleting a
 * workspace). Typing the name confirms. Afterwards, another workspace is opened if there is one.
 */
export function DeleteWorkspace({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")

  async function remove() {
    const { error } = await organization.delete({ organizationId: id })
    if (error) {
      toastManager.add({
        title: "Workspace not deleted",
        description: error.message,
        type: "error",
      })
      throw new Error(error.message)
    }
    const { data: others } = await organization.list()
    const next = others?.[0]
    if (next) await organization.setActive({ organizationId: next.id })
    toastManager.add({ title: `${name} was deleted`, type: "success" })
    router.push(next ? "/documents" : "/onboarding")
    router.refresh()
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2Icon aria-hidden />
        Delete workspace
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setTyped("")
        }}
        title={`Delete ${name}?`}
        description="All documents, envelopes, signed PDFs, certificates, templates, webhooks and members are deleted permanently, including their audit trails. Certificates stop verifying. Export first if you need a copy. This can't be undone."
        confirmLabel="Delete workspace"
        disabled={typed !== name}
        onConfirm={remove}
      >
        <Input
          label="Type the workspace name to confirm"
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
        />
      </ConfirmDialog>
    </>
  )
}
