"use client"

import type { WebhookDeliveryStatus } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog, DialogActions } from "@/components/app/confirm-dialog"
import {
  KeyRoundIcon,
  PencilIcon,
  RotateCwIcon,
  SendIcon,
  Trash2Icon,
} from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Badge } from "@/components/arc/badge/badge"
import { Button as ArcButton } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Switch } from "@/components/arc/switch/switch"
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
import { DELIVERY_BADGE, deliveryOutcome, maskedSecret } from "@/lib/webhooks"
import { SecretReveal } from "./secret-reveal"
import { WebhookFormDialog } from "./webhook-form-dialog"

export interface WebhookDeliveryRow {
  id: string
  eventId: string
  type: string
  status: WebhookDeliveryStatus
  attempts: number
  lastStatusCode: number | null
  lastError: string | null
  createdAt: string
}

export interface WebhookEndpointRow {
  id: string
  url: string
  description: string | null
  events: string[]
  enabled: boolean
  secretHint: string
  deliveries: WebhookDeliveryRow[]
}

const fail = (title: string, err: unknown) =>
  toastManager.add({
    title,
    description: err instanceof Error ? err.message : undefined,
    type: "error",
  })

/** One endpoint: settings, actions, and its latest 20 deliveries (docs/webhooks.md). */
export function EndpointCard({ endpoint }: { endpoint: WebhookEndpointRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<"rotate" | "delete" | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>, done: string, failure: string) {
    setBusy(true)
    try {
      await fn()
      toastManager.add({ title: done, type: "success" })
      router.refresh()
      return true
    } catch (err) {
      fail(failure, err)
      return false
    } finally {
      setBusy(false)
    }
  }

  const toggle = (enabled: boolean) =>
    run(
      () => api(`/webhooks/${endpoint.id}`, { method: "PATCH", json: { enabled } }),
      enabled ? "Webhook enabled" : "Webhook paused",
      "Not changed",
    )
  const test = () =>
    run(
      () => api(`/webhooks/${endpoint.id}/test`, { method: "POST" }),
      "Test event queued; refresh in a moment to see the result",
      "Test not sent",
    )
  const retry = (deliveryId: string) =>
    run(
      () => api(`/webhooks/${endpoint.id}/deliveries/${deliveryId}/retry`, { method: "POST" }),
      "Retry queued",
      "Retry not queued",
    )

  async function rotate() {
    try {
      const res = await api<{ secret: string }>(`/webhooks/${endpoint.id}/rotate-secret`, {
        method: "POST",
      })
      setNewSecret(res.secret)
      router.refresh()
    } catch (err) {
      fail("Secret not rotated", err)
      throw err
    }
  }

  async function remove() {
    const ok = await run(
      () => api(`/webhooks/${endpoint.id}`, { method: "DELETE" }),
      "Webhook deleted",
      "Not deleted",
    )
    if (!ok) throw new Error("Not deleted")
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
      <header className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate font-medium font-mono text-sm">{endpoint.url}</h3>
          <p className="text-muted-foreground text-sm">
            {endpoint.description ? `${endpoint.description} · ` : ""}Secret{" "}
            <span className="font-mono">{maskedSecret(endpoint.secretHint)}</span>
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {endpoint.events.map((e) => (
              <Badge key={e} size="sm">
                <span className="font-mono">{e}</span>
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Applies immediately, so a switch (Arc), not a checkbox. */}
          <Switch
            label={endpoint.enabled ? "Active" : "Paused"}
            checked={endpoint.enabled}
            disabled={busy}
            onCheckedChange={toggle}
          />
          <DropdownMenu
            label="Actions"
            items={[
              { label: "Send test event", icon: <SendIcon />, disabled: busy, onSelect: test },
              { label: "Edit", icon: <PencilIcon />, onSelect: () => setEditing(true) },
              {
                label: "Rotate secret",
                icon: <KeyRoundIcon />,
                onSelect: () => setConfirm("rotate"),
              },
              {
                label: "Delete",
                icon: <Trash2Icon />,
                destructive: true,
                separatorBefore: true,
                onSelect: () => setConfirm("delete"),
              },
            ]}
          />
        </div>
      </header>
      <div>
        {endpoint.deliveries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No deliveries yet. Send a test event to check the endpoint.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoint.deliveries.map((d) => {
                const badge = DELIVERY_BADGE[d.status]
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.type}</TableCell>
                    <TableCell>
                      <Badge tone={badge.tone} size="sm">
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-muted-foreground text-xs">
                      {deliveryOutcome(d)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(new Date(d.createdAt))}
                    </TableCell>
                    <TableCell>
                      {d.status === "FAILED" && (
                        <ArcButton
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => retry(d.id)}
                        >
                          <RotateCwIcon aria-hidden />
                          Retry
                        </ArcButton>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <WebhookFormDialog open={editing} onOpenChange={setEditing} initial={endpoint} />

      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this webhook?"
        description="Sahihi stops sending events to this URL and its delivery history is removed."
        confirmLabel="Delete webhook"
        onConfirm={remove}
      />
      <ConfirmDialog
        open={confirm === "rotate" && newSecret === null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Rotate the signing secret?"
        description="The current secret stops working immediately. Update your receiver with the new one right away."
        confirmLabel="Rotate secret"
        tone="primary"
        onConfirm={rotate}
      />
      <Dialog
        open={newSecret !== null}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null)
            setNewSecret(null)
          }
        }}
      >
        <DialogContent title="New signing secret">
          {newSecret && <SecretReveal secret={newSecret} />}
          <DialogActions>
            <ArcButton
              onClick={() => {
                setConfirm(null)
                setNewSecret(null)
              }}
            >
              Done
            </ArcButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </section>
  )
}
