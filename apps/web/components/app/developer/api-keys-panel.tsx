"use client"

import {
  API_KEY_SCOPE_DESCRIPTIONS,
  API_KEY_SCOPES,
  type ApiKeyScope,
  CreateApiKeySchema,
} from "@sahihi/core"
import { KeyRoundIcon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { SecretReveal } from "@/components/app/webhooks/secret-reveal"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { CheckboxGroup } from "@/components/ui/checkbox-group"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"

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

const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" })
const EXPIRY = [
  { value: "never", label: "Never" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In a year" },
]

function keyStatus(k: ApiKeyRow) {
  if (k.revokedAt) return { label: "Revoked", variant: "secondary" as const }
  if (k.expiresAt && new Date(k.expiresAt) <= new Date())
    return { label: "Expired", variant: "secondary" as const }
  return { label: "Active", variant: "success" as const }
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
                      by {k.createdBy.name}, {day.format(new Date(k.createdAt))}
                      {k.expiresAt ? ` · expires ${day.format(new Date(k.expiresAt))}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-72 flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="font-mono">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {k.lastUsedAt ? day.format(new Date(k.lastUsedAt)) : "Never"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
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
      <DialogTrigger render={<Button />}>
        <PlusIcon aria-hidden />
        Create API key
      </DialogTrigger>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create an API key</DialogTitle>
          <DialogDescription>
            For your own systems to call the Sahihi API. Give each system its own key with only the
            permissions it needs.
          </DialogDescription>
        </DialogHeader>
        {key ? (
          <>
            <DialogPanel>
              <SecretReveal
                secret={key}
                label="API key"
                hint="Store it in your system's secret manager; never in browser code."
              />
            </DialogPanel>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <Form errors={errors} onSubmit={onSubmit} className="contents">
            <DialogPanel className="flex flex-col gap-5">
              <Field name="name">
                <FieldLabel>Name</FieldLabel>
                <Input
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Customer portal"
                />
                <FieldError />
              </Field>
              <Field name="scopes">
                <FieldLabel>Permissions</FieldLabel>
                <CheckboxGroup value={scopes} onValueChange={(v) => setScopes(v as string[])}>
                  {API_KEY_SCOPES.map((s: ApiKeyScope) => (
                    <Label key={s} className="flex items-start gap-2 font-normal">
                      <Checkbox name="scopes" value={s} />
                      <span className="flex flex-col">
                        <span className="font-mono text-xs">{s}</span>
                        <span className="text-muted-foreground text-xs">
                          {API_KEY_SCOPE_DESCRIPTIONS[s]}
                        </span>
                      </span>
                    </Label>
                  ))}
                </CheckboxGroup>
                <FieldError />
              </Field>
              <Field name="expiresInDays">
                <FieldLabel>Expires</FieldLabel>
                <Select
                  items={EXPIRY}
                  value={expiry}
                  onValueChange={(v) => v && setExpiry(String(v))}
                >
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {EXPIRY.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            </DialogPanel>
            <DialogFooter>
              <Button variant="ghost" type="button" disabled={busy} onClick={() => change(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner aria-hidden /> : <KeyRoundIcon aria-hidden />}
                Create key
              </Button>
            </DialogFooter>
          </Form>
        )}
      </DialogPopup>
    </Dialog>
  )
}

function RevokeKey({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function revoke() {
    setBusy(true)
    try {
      await api(`/api-keys/${id}`, { method: "DELETE" })
      setOpen(false)
      toastManager.add({ title: `“${name}” revoked`, type: "success" })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not revoked",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Revoke</AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Requests with this key fail immediately. Systems using it need a new key.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" disabled={busy} />}>
            Cancel
          </AlertDialogClose>
          <Button variant="destructive" onClick={revoke} disabled={busy}>
            {busy && <Spinner aria-hidden />}
            Revoke key
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
