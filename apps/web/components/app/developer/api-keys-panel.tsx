"use client"

import {
  API_KEY_SCOPE_DESCRIPTIONS,
  API_KEY_SCOPES,
  type ApiKeyScope,
  CreateApiKeySchema,
} from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog, DialogActions } from "@/components/app/confirm-dialog"
import { KeyRoundIcon, PlusIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { SecretReveal } from "@/components/app/webhooks/secret-reveal"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { RadioGroup } from "@/components/arc/radio-group/radio-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/lib/api"
import { type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"
import { formatDate } from "@/lib/format"

export interface ApiKeyRow {
  id: string
  name: string
  hint: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  createdBy: { name: string }
}

const EXPIRY = [
  { value: "never", label: "Never" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In a year" },
]

function keyStatus(k: ApiKeyRow) {
  if (k.revokedAt) return { label: "Revoked", tone: "neutral" as const }
  if (k.expiresAt && new Date(k.expiresAt) <= new Date())
    return { label: "Expired", tone: "neutral" as const }
  return { label: "Active", tone: "success" as const }
}

/** Public API keys (docs/public-api.md): create (shown once), list, revoke. */
export function ApiKeysPanel({ keys }: { keys: ApiKeyRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <CreateKeyDialog />
      </div>
      {keys.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Revoke</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => {
              const status = keyStatus(k)
              return (
                <TableRow key={k.id}>
                  <TableCell>
                    <div className="font-medium">{k.name}</div>
                    <div className="font-mono text-muted-foreground text-xs">{k.hint}</div>
                    <div className="text-muted-foreground text-xs">
                      by {k.createdBy.name}, {formatDate(new Date(k.createdAt))}
                      {k.expiresAt ? ` · expires ${formatDate(new Date(k.expiresAt))}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-72 flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s} size="sm">
                          <span className="font-mono">{s}</span>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {k.lastUsedAt ? formatDate(new Date(k.lastUsedAt)) : "Never"}
                  </TableCell>
                  <TableCell>
                    <Badge tone={status.tone} size="sm">
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {status.label === "Active" && <RevokeKey id={k.id} name={k.name} />}
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

function CreateKeyDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<string[]>(["envelopes:read", "envelopes:write"])
  const [expiry, setExpiry] = useState("never")
  const [errors, setErrors] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<string | null>(null)

  function change(next: boolean) {
    if (busy) return
    setOpen(next)
    if (next) {
      setName("")
      setScopes(["envelopes:read", "envelopes:write"])
      setExpiry("never")
      setErrors({})
      setKey(null)
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = CreateApiKeySchema.safeParse({
      name,
      scopes,
      expiresInDays: expiry === "never" ? null : Number(expiry),
    })
    if (!parsed.success) return setErrors(issuesToFormErrors(parsed.error.issues))
    setErrors({})
    setBusy(true)
    try {
      const res = await api<{ key: string }>("/api-keys", { method: "POST", json: parsed.data })
      setKey(res.key)
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Key not created",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden />
          Create API key
        </Button>
      </DialogTrigger>
      <DialogContent
        title={key ? "Copy your API key" : "Create an API key"}
        description="For your own systems to call the Sahihi API. Give each system its own key with only the permissions it needs."
      >
        {key ? (
          <div className="flex flex-col gap-4">
            <SecretReveal
              secret={key}
              label="API key"
              hint="Store it in your system's secret manager; never in browser code."
            />
            <DialogActions>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogActions>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <Input
              label="Name"
              name="name"
              value={name}
              maxLength={80}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example, customer portal"
            />
            <fieldset className="flex flex-col gap-3">
              <legend className="pb-3 font-medium text-sm">Permissions</legend>
              {API_KEY_SCOPES.map((s: ApiKeyScope) => (
                <Checkbox
                  key={s}
                  name="scopes"
                  value={s}
                  label={s}
                  description={API_KEY_SCOPE_DESCRIPTIONS[s]}
                  checked={scopes.includes(s)}
                  onCheckedChange={(checked) =>
                    setScopes((all) =>
                      checked === true ? [...all, s] : all.filter((x) => x !== s),
                    )
                  }
                />
              ))}
              {errors.scopes && (
                <p role="alert" className="text-destructive-foreground text-sm">
                  {errors.scopes}
                </p>
              )}
            </fieldset>
            <RadioGroup
              label="Expires"
              name="expiresInDays"
              options={EXPIRY}
              value={expiry}
              onValueChange={setExpiry}
            />
            <DialogActions>
              <Button variant="ghost" type="button" disabled={busy} onClick={() => change(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                <KeyRoundIcon aria-hidden />
                Create key
              </Button>
            </DialogActions>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RevokeKey({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  async function revoke() {
    try {
      await api(`/api-keys/${id}`, { method: "DELETE" })
      toastManager.add({ title: `“${name}” revoked`, type: "success" })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not revoked",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
      throw err
    }
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Revoke
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Revoke “${name}”?`}
        description="Requests with this key fail immediately. Systems using it need a new key."
        confirmLabel="Revoke key"
        onConfirm={revoke}
      />
    </>
  )
}
