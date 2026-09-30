"use client"

import { DownloadIcon, PackageIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toastManager } from "@/components/ui/toast"
import { api } from "@/lib/api"
import { exportStatus, formatBytes } from "@/lib/data"

export interface ExportRow {
  id: string
  status: "PENDING" | "READY" | "FAILED"
  sizeBytes: number | null
  envelopeCount: number | null
  error: string | null
  createdAt: string
  expiresAt: string | null
  downloadable: boolean
  requestedBy: { name: string }
}

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Nairobi",
})

/** Request and download workspace exports (docs/data-retention.md → Export). */
export function ExportsPanel({ exports }: { exports: ExportRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const pending = exports.some((x) => x.status === "PENDING")

  async function request() {
    setBusy(true)
    try {
      await api("/data/exports", { method: "POST" })
      toastManager.add({
        title: "Export requested",
        description: "It's being prepared. Refresh in a minute to download it.",
        type: "success",
      })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not requested",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setBusy(false)
    }
  }

  async function download(id: string) {
    try {
      const { url } = await api<{ url: string }>(`/data/exports/${id}/download`)
      window.location.assign(url)
    } catch (err) {
      toastManager.add({
        title: "Download unavailable",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={request} disabled={busy || pending}>
          {busy || pending ? <Spinner aria-hidden /> : <PackageIcon aria-hidden />}
          {pending ? "Preparing export…" : "Export all envelopes"}
        </Button>
      </div>
      {exports.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contents</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Download</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exports.map((x) => {
              const status = exportStatus(x, new Date())
              return (
                <TableRow key={x.id}>
                  <TableCell>
                    <div>{when.format(new Date(x.createdAt))}</div>
                    <div className="text-muted-foreground text-xs">by {x.requestedBy.name}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {x.status === "READY"
                      ? `${x.envelopeCount ?? 0} envelopes · ${formatBytes(x.sizeBytes ?? 0)}`
                      : (x.error ?? "")}
                  </TableCell>
                  <TableCell>
                    {x.downloadable && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Download export"
                        onClick={() => download(x.id)}
                      >
                        <DownloadIcon aria-hidden />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
