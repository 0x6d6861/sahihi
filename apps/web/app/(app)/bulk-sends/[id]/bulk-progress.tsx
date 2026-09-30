"use client"

import type { BulkItemStatus, BulkSendStatus } from "@sahihi/core"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface BulkSendView {
  id: string
  title: string
  status: BulkSendStatus
  total: number
  sent: number
  failed: number
  items: { row: number; status: BulkItemStatus; envelopeId: string | null; error: string | null }[]
}

const ITEM_BADGE: Record<
  BulkItemStatus,
  { label: string; variant: "outline" | "success" | "error" }
> = {
  PENDING: { label: "Waiting", variant: "outline" },
  SENT: { label: "Sent", variant: "success" },
  FAILED: { label: "Failed", variant: "error" },
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
        <Progress value={bulk.total ? Math.round((processed / bulk.total) * 100) : 0} />
        <p className="text-muted-foreground text-sm">
          {done ? "Done: " : "Sending… "}
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
                <TableCell className="text-muted-foreground">{i.row}</TableCell>
                <TableCell>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {i.envelopeId && i.status === "SENT" ? (
                    <Link href={`/envelopes/${i.envelopeId}`} className="underline">
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
