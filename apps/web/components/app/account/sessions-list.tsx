"use client"

import { describeUserAgent } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { toastManager } from "@/components/app/toast"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { revokeOtherSessions, revokeSession } from "@/lib/auth-client"
import { formatDateTime } from "@/lib/format"

export interface SessionRow {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Where you're signed in (better-auth `list-sessions`). Each other device can be signed out on
 * its own, or all of them at once; the current one is signed out from the account menu.
 */
export function SessionsList({
  sessions,
  currentId,
}: {
  sessions: SessionRow[]
  currentId: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const others = sessions.filter((s) => s.id !== currentId)
  const rows = [...sessions].sort((a, b) =>
    a.id === currentId ? -1 : b.id === currentId ? 1 : b.updatedAt.localeCompare(a.updatedAt),
  )

  async function revoke(s: SessionRow) {
    setBusy(s.id)
    const { error } = await revokeSession({ token: s.token })
    setBusy(null)
    if (error) {
      toastManager.add({ title: "Not signed out", description: error.message, type: "error" })
      return
    }
    router.refresh()
  }

  async function revokeAll() {
    const { error } = await revokeOtherSessions()
    if (error) {
      toastManager.add({ title: "Not signed out", description: error.message, type: "error" })
      throw new Error(error.message)
    }
    toastManager.add({ title: "Other devices signed out", type: "success" })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>IP address</TableHead>
            <TableHead>Last active</TableHead>
            <TableHead className="w-28">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <span className="flex flex-wrap items-center gap-2">
                  {describeUserAgent(s.userAgent)}
                  {s.id === currentId && (
                    <Badge tone="info" size="sm">
                      This device
                    </Badge>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {s.ipAddress || "Unknown"}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(s.updatedAt)}</TableCell>
              <TableCell className="text-right">
                {s.id !== currentId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busy === s.id}
                    onClick={() => void revoke(s)}
                  >
                    Sign out
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {others.length > 0 && (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setConfirmAll(true)}>
            Sign out other devices
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Sign out other devices?"
        description={`Ends ${others.length === 1 ? "1 other session" : `${others.length} other sessions`}. This device stays signed in.`}
        confirmLabel="Sign out"
        onConfirm={revokeAll}
      />
    </div>
  )
}
