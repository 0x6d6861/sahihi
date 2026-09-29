"use client"

import { Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
import { organization } from "@/lib/auth-client"

/**
 * Owner-only: delete the workspace with everything in it (docs/data-retention.md → Deleting a
 * workspace). Typing the name confirms. Afterwards, another workspace is opened if there is one.
 */
export function DeleteWorkspace({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    const { error } = await organization.delete({ organizationId: id })
    if (error) {
      setBusy(false)
      toastManager.add({
        title: "Workspace not deleted",
        description: error.message,
        type: "error",
      })
      return
    }
    const { data: others } = await organization.list()
    const next = others?.[0]
    if (next) await organization.setActive({ organizationId: next.id })
    toastManager.add({ title: `${name} was deleted`, type: "success" })
    router.push(next ? "/documents" : "/onboarding")
    router.refresh()
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        setOpen(o)
        if (!o) setTyped("")
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive-outline" />}>
        <Trash2Icon aria-hidden />
        Delete workspace
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            All documents, envelopes, signed PDFs, certificates, templates, webhooks and members are
            deleted permanently, including their audit trails. Certificates stop verifying. Export
            first if you need a copy. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-6">
          <Field>
            <FieldLabel>Type the workspace name to confirm</FieldLabel>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} />
          </Field>
        </div>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" disabled={busy} />}>
            Cancel
          </AlertDialogClose>
          <Button variant="destructive" onClick={remove} disabled={busy || typed !== name}>
            {busy && <Spinner aria-hidden />}
            Delete workspace
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
