"use client"

import type { WebhookDeliveryStatus } from "@sahihi/core"
import {
  EllipsisIcon,
  KeyRoundIcon,
  PencilIcon,
  RotateCwIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"
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
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
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

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Nairobi",
})

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
    setBusy(true)
    try {
      const res = await api<{ secret: string }>(`/webhooks/${endpoint.id}/rotate-secret`, {
        method: "POST",
      })
      setNewSecret(res.secret)
      router.refresh()
    } catch (err) {
      fail("Secret not rotated", err)
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (
      await run(
        () => api(`/webhooks/${endpoint.id}`, { method: "DELETE" }),
        "Webhook deleted",
        "Not deleted",
      )
    )
      setConfirm(null)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate font-mono text-sm">{endpoint.url}</CardTitle>
          <CardDescription>
            {endpoint.description ? `${endpoint.description} · ` : ""}Secret{" "}
            <span className="font-mono">{maskedSecret(endpoint.secretHint)}</span>
          </CardDescription>
          <div className="flex flex-wrap gap-1 pt-1">
            {endpoint.events.map((e) => (
              <Badge key={e} variant="outline" className="font-mono">
                {e}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label className="flex items-center gap-2 font-normal">
            <Switch checked={endpoint.enabled} disabled={busy} onCheckedChange={toggle} />
            {endpoint.enabled ? "Active" : "Paused"}
          </Label>
          <Menu>
            <MenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${endpoint.url}`} />
              }
            >
              {busy ? <Spinner aria-hidden /> : <EllipsisIcon aria-hidden />}
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={test}>
                <SendIcon aria-hidden />
                Send test event
              </MenuItem>
              <MenuItem onClick={() => setEditing(true)}>
                <PencilIcon aria-hidden />
                Edit
              </MenuItem>
              <MenuItem onClick={() => setConfirm("rotate")}>
                <KeyRoundIcon aria-hidden />
                Rotate secret
              </MenuItem>
              <MenuSeparator />
              <MenuItem variant="destructive" onClick={() => setConfirm("delete")}>
                <Trash2Icon aria-hidden />
                Delete
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </CardHeader>
      <CardPanel>
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
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-muted-foreground text-xs">
                      {deliveryOutcome(d)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {when.format(new Date(d.createdAt))}
                    </TableCell>
                    <TableCell>
                      {d.status === "FAILED" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Retry ${d.type}`}
                          disabled={busy}
                          onClick={() => retry(d.id)}
                        >
                          <RotateCwIcon aria-hidden />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardPanel>

      <WebhookFormDialog open={editing} onOpenChange={setEditing} initial={endpoint} />

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (busy) return
          if (!o) {
            setConfirm(null)
            setNewSecret(null)
          }
        }}
      >
        <AlertDialogPopup>
          {newSecret ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>New signing secret</AlertDialogTitle>
              </AlertDialogHeader>
              <div className="px-6">
                <SecretReveal secret={newSecret} />
              </div>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button />}>Done</AlertDialogClose>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirm === "delete" ? "Delete this webhook?" : "Rotate the signing secret?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirm === "delete"
                    ? "Sahihi stops sending events to this URL and its delivery history is removed."
                    : "The current secret stops working immediately. Update your receiver with the new one right away."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="ghost" disabled={busy} />}>
                  Cancel
                </AlertDialogClose>
                <Button
                  variant={confirm === "delete" ? "destructive" : "default"}
                  disabled={busy}
                  onClick={confirm === "delete" ? remove : rotate}
                >
                  {busy && <Spinner aria-hidden />}
                  {confirm === "delete" ? "Delete webhook" : "Rotate secret"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogPopup>
      </AlertDialog>
    </Card>
  )
}
