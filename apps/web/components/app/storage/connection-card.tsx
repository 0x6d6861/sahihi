"use client"

import { DEFAULT_SYNC_FOLDER } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog, DialogActions } from "@/components/app/confirm-dialog"
import {
  DownloadIcon,
  PencilIcon,
  RotateCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Input } from "@/components/arc/input/input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { Progress } from "@/components/arc/progress/progress"
import { Select } from "@/components/arc/select/select"
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
import {
  connectionBadge,
  connectionDetails,
  connectionWhere,
  DELIVERY_BADGE,
  deliveryOutcome,
  primaryStatus,
  type StorageConnectionRow,
} from "@/lib/storage"

const fail = (title: string, err: unknown) =>
  toastManager.add({
    title,
    description: err instanceof Error ? err.message : undefined,
    type: "error",
  })

/** One connection: where it writes, whether it works, its actions and (sync) latest deliveries. */
export function ConnectionCard({ connection: c }: { connection: StorageConnectionRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<"edit" | "backfill" | "disconnect" | "activate" | null>(null)
  const badge = connectionBadge(c)
  const primary = c.purpose === "PRIMARY" ? primaryStatus(c) : null
  const migrating = c.primaryState === "MIGRATING_IN" || c.primaryState === "MIGRATING_OUT"

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

  async function test() {
    setBusy(true)
    try {
      const res = await api<{ test: { ok: boolean; message?: string } }>(
        `/storage/connections/${c.id}/test`,
        { method: "POST" },
      )
      toastManager.add(
        res.test.ok
          ? { title: "The connection works", type: "success" }
          : { title: "The test failed", description: res.test.message, type: "error" },
      )
      router.refresh()
    } catch (err) {
      fail("Not tested", err)
    } finally {
      setBusy(false)
    }
  }

  async function retryFailed() {
    setBusy(true)
    try {
      const { retried } = await api<{ retried: number }>(
        `/storage/connections/${c.id}/retry-failed`,
        { method: "POST" },
      )
      toastManager.add({
        title:
          retried === 0
            ? "No failed copies to retry"
            : `${retried} ${retried === 1 ? "copy" : "copies"} queued again`,
        type: "success",
      })
      router.refresh()
    } catch (err) {
      fail("Not retried", err)
    } finally {
      setBusy(false)
    }
  }
  const retryDelivery = (id: string) =>
    run(
      () => api(`/storage/connections/${c.id}/deliveries/${id}/retry`, { method: "POST" }),
      "Copy queued again",
      "Not retried",
    )
  const retryMigration = () =>
    run(
      () => api(`/storage/connections/${c.id}/migration/retry`, { method: "POST" }),
      "Moving files again",
      "Not restarted",
    )

  async function disconnect() {
    const ok = await run(
      () => api(`/storage/connections/${c.id}`, { method: "DELETE" }),
      c.primaryState ? "Moving files back to Sahihi" : "Disconnected",
      "Not disconnected",
    )
    if (!ok) throw new Error("Not disconnected")
  }

  async function activate() {
    const ok = await run(
      () => api(`/storage/connections/${c.id}/activate`, { method: "POST" }),
      "Moving files into your bucket",
      "Not started",
    )
    if (!ok) throw new Error("Not started")
  }

  const items = [
    { label: "Test connection", icon: <ShieldCheckIcon />, disabled: busy, onSelect: test },
    { label: "Edit", icon: <PencilIcon />, onSelect: () => setDialog("edit") },
    ...(c.purpose === "SYNC"
      ? [
          {
            label: "Copy earlier envelopes",
            icon: <DownloadIcon />,
            disabled: c.status === "PENDING",
            onSelect: () => setDialog("backfill"),
          },
          { label: "Retry failed copies", icon: <RotateCwIcon />, onSelect: retryFailed },
        ]
      : []),
    {
      label: "Disconnect",
      icon: <Trash2Icon />,
      destructive: true,
      separatorBefore: true,
      disabled: c.primaryState === "MIGRATING_OUT",
      onSelect: () => setDialog("disconnect"),
    },
  ]

  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
      <header className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-base">{c.name}</h3>
            <Badge tone={badge.tone} size="sm">
              {badge.label}
            </Badge>
            {primary && (
              <Badge tone={primary.tone} size="sm">
                {primary.label}
              </Badge>
            )}
          </div>
          <p
            className="truncate font-mono text-muted-foreground text-sm"
            title={connectionWhere(c)}
          >
            {connectionWhere(c)}
          </p>
          <p className="text-muted-foreground text-sm">
            {connectionDetails(c)}
            {c.lastCheckedAt && ` · Checked ${formatDateTime(new Date(c.lastCheckedAt))}`}
            {c.purpose === "SYNC" && (
              <>
                {" "}
                · Folders <span className="font-mono">{c.folderTemplate}</span>
              </>
            )}
          </p>
        </div>
        <DropdownMenu label="Actions" items={items} />
      </header>

      {c.lastError && c.status !== "ACTIVE" && (
        <Alert
          tone={c.status === "FAILING" ? "danger" : "warning"}
          title={c.status === "FAILING" ? "Sahihi can't reach it" : "The last test failed"}
        >
          {c.lastError}
        </Alert>
      )}

      {c.purpose === "PRIMARY" && (
        <PrimaryBody
          connection={c}
          migrating={migrating}
          progress={primary?.progress ?? null}
          busy={busy}
          onActivate={() => setDialog("activate")}
          onRetry={retryMigration}
        />
      )}

      {c.purpose === "SYNC" && <Deliveries connection={c} busy={busy} onRetry={retryDelivery} />}

      <EditDialog
        connection={c}
        open={dialog === "edit"}
        onOpenChange={(o) => setDialog(o ? "edit" : null)}
      />
      <BackfillDialog
        connectionId={c.id}
        open={dialog === "backfill"}
        onOpenChange={(o) => setDialog(o ? "backfill" : null)}
      />
      <ConfirmDialog
        open={dialog === "activate"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Keep every file in this bucket?"
        description="New files go to your bucket straight away and existing ones are copied over in the background, then removed from Sahihi's storage. Files stay readable throughout."
        confirmLabel="Use this bucket"
        tone="primary"
        onConfirm={activate}
      />
      <ConfirmDialog
        open={dialog === "disconnect"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={c.primaryState ? "Move files back to Sahihi?" : "Disconnect this storage?"}
        description={
          c.primaryState
            ? "Every file the workspace uses is copied back to Sahihi's storage, then the bucket is disconnected. Nothing in your bucket is deleted."
            : "Completed envelopes stop being copied here. Files already copied stay in your storage."
        }
        confirmLabel={c.primaryState ? "Move files back" : "Disconnect"}
        onConfirm={disconnect}
      />
    </section>
  )
}

function PrimaryBody({
  connection: c,
  migrating,
  progress,
  busy,
  onActivate,
  onRetry,
}: {
  connection: StorageConnectionRow
  migrating: boolean
  progress: number | null
  busy: boolean
  onActivate: () => void
  onRetry: () => void
}) {
  if (migrating) {
    return (
      <div className="flex flex-col gap-3">
        <Progress
          value={progress ?? 0}
          label={
            c.migrateTotal > 0
              ? `${c.migratedCount} of ${c.migrateTotal} files checked`
              : "Counting files…"
          }
          showValue
        />
        <div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onRetry}>
            <RotateCwIcon aria-hidden />
            Restart moving files
          </Button>
        </div>
      </div>
    )
  }
  if (!c.primaryState) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {c.status === "ACTIVE"
            ? "The bucket works. Use it to move the workspace's files there."
            : "Test the connection successfully before using it."}
        </p>
        <Button disabled={busy || c.status !== "ACTIVE"} onClick={onActivate}>
          Use this bucket
        </Button>
      </div>
    )
  }
  return (
    <p className="text-muted-foreground text-sm">
      Every document, signed PDF, certificate and export of this workspace is stored in this bucket.
      Files you delete in Sahihi stay there and are listed under Released files.
    </p>
  )
}

function Deliveries({
  connection: c,
  busy,
  onRetry,
}: {
  connection: StorageConnectionRow
  busy: boolean
  onRetry: (id: string) => void
}) {
  const deliveries = c.deliveries ?? []
  if (deliveries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing copied yet. Each envelope is copied when everyone has signed.
      </p>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Envelope</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.map((d) => {
          const badge = DELIVERY_BADGE[d.status]
          return (
            <TableRow key={d.id}>
              <TableCell className="max-w-48 truncate">{d.envelope.title}</TableCell>
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
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRetry(d.id)}>
                    <RotateCwIcon aria-hidden />
                    Retry
                  </Button>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function EditDialog({
  connection: c,
  open,
  onOpenChange,
}: {
  connection: StorageConnectionRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [name, setName] = useState(c.name)
  const [folderTemplate, setFolderTemplate] = useState(c.folderTemplate || DEFAULT_SYNC_FOLDER)
  const [accessKeyId, setAccessKeyId] = useState("")
  const [secretAccessKey, setSecretAccessKey] = useState("")
  const [pending, setPending] = useState(false)

  function change(next: boolean) {
    if (pending) return
    if (next) {
      setName(c.name)
      setFolderTemplate(c.folderTemplate || DEFAULT_SYNC_FOLDER)
      setAccessKeyId("")
      setSecretAccessKey("")
    }
    onOpenChange(next)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    try {
      const rotating = accessKeyId.trim() !== "" || secretAccessKey.trim() !== ""
      const res = await api<{ test?: { ok: boolean; message?: string } }>(
        `/storage/connections/${c.id}`,
        {
          method: "PATCH",
          json: {
            name,
            ...(c.purpose === "SYNC" && { folderTemplate }),
            ...(rotating && { accessKeyId, secretAccessKey }),
          },
        },
      )
      toastManager.add(
        res.test && !res.test.ok
          ? { title: "Saved, but the test failed", description: res.test.message, type: "error" }
          : { title: "Saved", type: "success" },
      )
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      fail("Not saved", err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent title="Edit storage">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <Input
            label="Name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          {c.purpose === "SYNC" && (
            <Input
              label="Folder for each envelope"
              value={folderTemplate}
              description="Use {yyyy}, {mm}, {dd}, {title} and {id}. Applies to the next copies."
              onChange={(e) => setFolderTemplate(e.target.value)}
            />
          )}
          {c.auth === "ACCESS_KEYS" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="New access key ID"
                value={accessKeyId}
                autoComplete="off"
                description="Leave empty to keep the current key."
                onChange={(e) => setAccessKeyId(e.target.value)}
              />
              <PasswordField
                label="New secret access key"
                value={secretAccessKey}
                autoComplete="off"
                onChange={(e) => setSecretAccessKey(e.target.value)}
              />
            </div>
          )}
          <DialogActions>
            <Button variant="ghost" type="button" disabled={pending} onClick={() => change(false)}>
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

function BackfillDialog({
  connectionId,
  open,
  onOpenChange,
}: {
  connectionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [days, setDays] = useState("30")
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      const res = await api<{ queued: number }>(`/storage/connections/${connectionId}/backfill`, {
        method: "POST",
        json: { days: Number(days) },
      })
      toastManager.add({
        title:
          res.queued === 0
            ? "Nothing to copy: every completed envelope is already there"
            : `${res.queued} ${res.queued === 1 ? "envelope" : "envelopes"} queued`,
        type: "success",
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      fail("Not queued", err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent
        title="Copy earlier envelopes"
        description="Envelopes completed before you connected this storage are copied too (up to 1,000)."
      >
        <div className="flex flex-col gap-5">
          <Select
            label="Completed in the last"
            value={days}
            onValueChange={setDays}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "365", label: "12 months" },
            ]}
          />
          <DialogActions>
            <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={submit}>
              Copy envelopes
            </Button>
          </DialogActions>
        </div>
      </DialogContent>
    </Dialog>
  )
}
