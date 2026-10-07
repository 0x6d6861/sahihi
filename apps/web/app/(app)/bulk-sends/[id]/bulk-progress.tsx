"use client"

import type { BulkItemStatus, BulkSendStatus } from "@sahihi/core"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Badge } from "@/components/arc/badge/badge"
import { Progress } from "@/components/arc/progress/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BadgeTone } from "@/lib/constants"

export interface BulkSendView {
  id: string
  title: string
  status: BulkSendStatus
  total: number
  sent: number
  failed: number
  items: { row: number; status: BulkItemStatus; envelopeId: string | null; error: string | null }[]
}

const ITEM_BADGE: Record<BulkItemStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Waiting", tone: "neutral" },
  SENT: { label: "Sent", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
}

/** Progress of a bulk send; refreshes itself until the batch is done. */
export function BulkProgress({ bulk }: { bulk: BulkSendView }) {
  const router = useRouter()
  const done = bulk.status === "DONE"
  useEffect(() => {
    if (done) return
    const t = setInterval(() => router.refresh(), 2500)
    return () => clearInterval(t)
  }, [done, router])

  const processed = bulk.sent + bulk.failed
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Progress value={processed} max={bulk.total || 1} showValue />
        <p className="text-muted-foreground text-sm">
          {done ? "Done: " : "Sending: "}
          {bulk.sent} of {bulk.total} sent
          {bulk.failed > 0 ? `, ${bulk.failed} failed` : ""}.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Row</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bulk.items.map((i) => {
            const badge = ITEM_BADGE[i.status]
            return (
              <TableRow key={i.row}>
                <TableCell className="text-muted-foreground tabular-nums">{i.row}</TableCell>
                <TableCell>
                  <Badge tone={badge.tone} size="sm">
                    {badge.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {i.envelopeId && i.status === "SENT" ? (
                    <Link
                      href={`/envelopes/${i.envelopeId}`}
                      className="underline underline-offset-4"
                    >
                      Open envelope
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{i.error ?? ""}</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
