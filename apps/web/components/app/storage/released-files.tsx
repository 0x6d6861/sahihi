"use client"

import { STORAGE_RELEASE_REASON_LABELS, type StorageReleaseReason } from "@sahihi/core"
import { useState } from "react"
import { Button } from "@/components/app/button"
import { toastManager } from "@/components/app/toast"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { releasedKeyLabel } from "@/lib/storage"

export interface ReleaseRow {
  id: string
  key: string
  reason: StorageReleaseReason
  releasedAt: string
}

/**
 * Files in the workspace's own bucket that Sahihi no longer uses (ADR 0051). Sahihi never deletes
 * them; this list (and its CSV) is what a cleanup script or lifecycle rule works from.
 */
export function ReleasedFiles({
  initial,
  nextCursor: firstCursor,
}: {
  initial: ReleaseRow[]
  nextCursor: string | null
}) {
  const [rows, setRows] = useState(initial)
  const [cursor, setCursor] = useState(firstCursor)
  const [loading, setLoading] = useState(false)

  async function more() {
    if (!cursor) return
    setLoading(true)
    try {
      const page = await api<{ items: ReleaseRow[]; nextCursor: string | null }>(
        `/storage/releases?cursor=${encodeURIComponent(cursor)}`,
      )
      setRows((r) => [...r, ...page.items])
      setCursor(page.nextCursor)
    } catch (err) {
      toastManager.add({
        title: "Not loaded",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setLoading(false)
    }
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No released files.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Why</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-96 truncate font-mono text-xs" title={r.key}>
                {releasedKeyLabel(r.key)}
                {r.key.endsWith("/") && " (everything under it)"}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {STORAGE_RELEASE_REASON_LABELS[r.reason]}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {formatDateTime(new Date(r.releasedAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {cursor && (
        <div>
          <Button variant="ghost" size="sm" loading={loading} onClick={more}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
