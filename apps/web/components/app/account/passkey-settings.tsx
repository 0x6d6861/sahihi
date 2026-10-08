"use client"

import { describeUserAgent } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog, DialogActions } from "@/components/app/confirm-dialog"
import { toastManager } from "@/components/app/toast"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { passkey } from "@/lib/auth-client"
import { formatDate } from "@/lib/format"

export interface PasskeyRow {
  id: string
  /** The name the user gave it, else the authenticator's ("iCloud Keychain"), else "Passkey". */
  label: string
  /** Synced across the user's devices (iCloud, Google Password Manager) or bound to one. */
  synced: boolean
  createdAt: string | null
}

/**
 * Passkeys (`@better-auth/passkey`, docs/auth.md → Account settings): add one with the browser's
 * own prompt, rename or remove it. Signing in with one skips the password and the second step.
 */
export function PasskeySettings({ passkeys }: { passkeys: PasskeyRow[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<PasskeyRow | null>(null)
  const [removing, setRemoving] = useState<PasskeyRow | null>(null)

  async function add() {
    setAdding(true)
    const { error } = await passkey.addPasskey({ name: describeUserAgent(navigator.userAgent) })
    setAdding(false)
    // Closing the browser's prompt is a choice, not an error worth a toast.
    if (error) {
      const code = "code" in error ? error.code : undefined
      if (code !== "ERROR_CEREMONY_ABORTED" && code !== "AUTH_CANCELLED") {
        toastManager.add({ title: "Passkey not added", description: error.message, type: "error" })
      }
      return
    }
    toastManager.add({ title: "Passkey added", type: "success" })
    router.refresh()
  }

  async function remove(row: PasskeyRow) {
    const { error } = await passkey.deletePasskey({ id: row.id })
    if (error) {
      toastManager.add({ title: "Passkey not removed", description: error.message, type: "error" })
      throw new Error(error.message)
    }
    toastManager.add({ title: `“${row.label}” removed`, type: "success" })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      {passkeys.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Passkey</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-40">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {passkeys.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    {p.label}
                    <Badge tone="neutral" size="sm">
                      {p.synced ? "Synced" : "This device"}
                    </Badge>
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {p.createdAt ? formatDate(p.createdAt) : "—"}
                </TableCell>
                <TableCell>
                  <span className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setRenaming(p)}>
                      Rename
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(p)}>
                      Remove
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div>
        <Button variant="secondary" loading={adding} onClick={add}>
          Add a passkey
        </Button>
      </div>

      <RenamePasskeyDialog row={renaming} onClose={() => setRenaming(null)} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove “${removing?.label ?? ""}”?`}
        description="You won't be able to sign in with it any more. Remove it from your password manager too."
        confirmLabel="Remove passkey"
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />
    </div>
  )
}

function RenamePasskeyDialog({ row, onClose }: { row: PasskeyRow | null; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = useState<string | undefined>()
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!row) return
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim()
    if (!name) return setError("Enter a name")
    if (name.length > 60) return setError("Use 60 characters or fewer")
    setPending(true)
    const { error } = await passkey.updatePasskey({ id: row.id, name })
    setPending(false)
    if (error) return setError(error.message ?? "Could not rename it")
    onClose()
    router.refresh()
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent title="Rename passkey" description="A name you'll recognise, like the device.">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Input
            label="Name"
            name="name"
            defaultValue={row?.label}
            maxLength={60}
            error={error}
            autoFocus
            required
          />
          <DialogActions>
            <Button variant="ghost" type="button" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  )
}
