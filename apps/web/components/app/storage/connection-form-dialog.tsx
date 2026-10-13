"use client"

import {
  CreateS3ConnectionSchema,
  DEFAULT_SYNC_FOLDER,
  STORAGE_PROVIDER_INFO,
  type StorageProvider,
} from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { RadioGroup } from "@/components/arc/radio-group/radio-group"
import { Select } from "@/components/arc/select/select"
import { ApiError, api } from "@/lib/api"
import { type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"
import { formProviders } from "@/lib/storage"

export interface AwsRoleSetup {
  accountId: string
  externalId: string
}

interface Policies {
  externalId: string
  trustPolicy: unknown
  permissionsPolicy: unknown
}

/**
 * Connect an S3-compatible bucket (docs/storage.md). The connection is tested as it's saved; a
 * failed test still saves it (as "Not tested") and shows why, so a fix is one edit away.
 */
export function ConnectionFormDialog({
  open,
  onOpenChange,
  purpose,
  awsRole,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  purpose: "SYNC" | "PRIMARY"
  awsRole: AwsRoleSetup | null
}) {
  const router = useRouter()
  const [provider, setProvider] = useState<StorageProvider>("AWS_S3")
  const [name, setName] = useState("")
  const [bucket, setBucket] = useState("")
  const [region, setRegion] = useState(STORAGE_PROVIDER_INFO.AWS_S3.defaultRegion ?? "")
  const [accountId, setAccountId] = useState("")
  const [endpoint, setEndpoint] = useState("")
  const [prefix, setPrefix] = useState(purpose === "PRIMARY" ? "sahihi" : "")
  const [folderTemplate, setFolderTemplate] = useState(DEFAULT_SYNC_FOLDER)
  const [auth, setAuth] = useState<"ACCESS_KEYS" | "AWS_ROLE">("ACCESS_KEYS")
  const [accessKeyId, setAccessKeyId] = useState("")
  const [secretAccessKey, setSecretAccessKey] = useState("")
  const [roleArn, setRoleArn] = useState("")
  const [errors, setErrors] = useState<FormErrors>({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [policies, setPolicies] = useState<Policies | null>(null)

  const info = STORAGE_PROVIDER_INFO[provider]
  const roleOffered = Boolean(awsRole) && info.supportsRole

  useEffect(() => {
    if (!open || auth !== "AWS_ROLE" || !roleOffered) return
    const query = new URLSearchParams({ bucket: bucket || "your-bucket", prefix })
    const timer = setTimeout(() => {
      api<Policies>(`/storage/aws-policies?${query}`)
        .then(setPolicies)
        .catch(() => setPolicies(null))
    }, 300)
    return () => clearTimeout(timer)
  }, [open, auth, roleOffered, bucket, prefix])

  function reset() {
    setProvider("AWS_S3")
    setName("")
    setBucket("")
    setRegion(STORAGE_PROVIDER_INFO.AWS_S3.defaultRegion ?? "")
    setAccountId("")
    setEndpoint("")
    setPrefix(purpose === "PRIMARY" ? "sahihi" : "")
    setFolderTemplate(DEFAULT_SYNC_FOLDER)
    setAuth("ACCESS_KEYS")
    setAccessKeyId("")
    setSecretAccessKey("")
    setRoleArn("")
    setErrors({})
    setFailure(null)
  }

  function change(next: boolean) {
    if (pending) return
    if (next) reset()
    onOpenChange(next)
  }

  function pickProvider(value: string) {
    const p = value as StorageProvider
    setProvider(p)
    setRegion(STORAGE_PROVIDER_INFO[p].defaultRegion ?? "")
    if (!STORAGE_PROVIDER_INFO[p].supportsRole) setAuth("ACCESS_KEYS")
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = {
      purpose,
      name: name.trim() || STORAGE_PROVIDER_INFO[provider].label,
      provider,
      bucket,
      region,
      prefix,
      ...(info.needsAccountId && { accountId }),
      ...(provider === "S3_COMPATIBLE" && { endpoint }),
      ...(purpose === "SYNC" && { folderTemplate }),
      ...(auth === "ACCESS_KEYS" ? { auth, accessKeyId, secretAccessKey } : { auth, roleArn }),
    }
    const parsed = CreateS3ConnectionSchema.safeParse(input)
    if (!parsed.success) return setErrors(issuesToFormErrors(parsed.error.issues))
    setErrors({})
    setFailure(null)
    setPending(true)
    try {
      const res = await api<{ test: { ok: boolean; message?: string } }>("/storage/connections", {
        method: "POST",
        json: input,
      })
      router.refresh()
      if (res.test.ok) {
        toastManager.add({ title: "Connected and tested", type: "success" })
        onOpenChange(false)
      } else {
        setFailure(res.test.message ?? "The test failed")
      }
    } catch (err) {
      if (err instanceof ApiError && err.body?.issues?.length) {
        setErrors(issuesToFormErrors(err.body.issues))
      } else {
        toastManager.add({
          title: "Not connected",
          description: err instanceof Error ? err.message : undefined,
          type: "error",
        })
      }
    } finally {
      setPending(false)
    }
  }

  const title = purpose === "PRIMARY" ? "Keep every file in your bucket" : "Sync to a bucket"
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        title={failure ? "Saved, but the test failed" : title}
        description={
          failure
            ? undefined
            : purpose === "PRIMARY"
              ? "Sahihi needs to write, read and list in this bucket. It never deletes anything in it."
              : "When an envelope is completed, its signed PDFs, certificate and audit trail are copied here. Sahihi never deletes anything in it."
        }
      >
        {failure ? (
          <div className="flex flex-col gap-4">
            <Alert tone="warning" title="Sahihi couldn't use the bucket">
              {failure}. The connection is saved: fix the bucket or its permissions, then use Test
              connection on its card.
            </Alert>
            <DialogActions>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogActions>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <Select
              label="Provider"
              description={info.help}
              options={formProviders(purpose)}
              value={provider}
              onValueChange={pickProvider}
            />
            <Input
              label="Name"
              name="name"
              value={name}
              maxLength={80}
              error={errors.name}
              placeholder={`For example, ${purpose === "PRIMARY" ? "Contracts bucket" : "Signed archive"}`}
              onChange={(e) => setName(e.target.value)}
            />
            {info.needsAccountId && (
              <Input
                label="Account ID"
                name="accountId"
                value={accountId}
                error={errors.accountId}
                description="In the Cloudflare dashboard, under R2 → Account details."
                onChange={(e) => setAccountId(e.target.value)}
              />
            )}
            {provider === "S3_COMPATIBLE" && (
              <Input
                label="Endpoint URL"
                name="endpoint"
                type="url"
                value={endpoint}
                error={errors.endpoint}
                placeholder="https://s3.example.com"
                description="HTTPS, reachable from the internet."
                onChange={(e) => setEndpoint(e.target.value)}
              />
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Bucket"
                name="bucket"
                value={bucket}
                error={errors.bucket}
                autoComplete="off"
                onChange={(e) => setBucket(e.target.value)}
              />
              <Input
                label="Region"
                name="region"
                value={region}
                error={errors.region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>
            <Input
              label="Folder in the bucket (optional)"
              name="prefix"
              value={prefix}
              error={errors.prefix}
              description="Sahihi only writes under this folder."
              onChange={(e) => setPrefix(e.target.value)}
            />
            {purpose === "SYNC" && (
              <Input
                label="Folder for each envelope"
                name="folderTemplate"
                value={folderTemplate}
                error={errors.folderTemplate}
                description="Use {yyyy}, {mm}, {dd}, {title} and {id}. {id} keeps every envelope apart."
                onChange={(e) => setFolderTemplate(e.target.value)}
              />
            )}
            {roleOffered && (
              <RadioGroup
                label="Access"
                value={auth}
                onValueChange={(v) => setAuth(v as "ACCESS_KEYS" | "AWS_ROLE")}
                options={[
                  {
                    value: "AWS_ROLE",
                    label: "IAM role (recommended)",
                    description: "No keys to store or rotate. Sahihi assumes a role you create.",
                  },
                  {
                    value: "ACCESS_KEYS",
                    label: "Access key",
                    description: "An IAM user's key, stored encrypted.",
                  },
                ]}
              />
            )}
            {auth === "ACCESS_KEYS" ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  label="Access key ID"
                  name="accessKeyId"
                  value={accessKeyId}
                  error={errors.accessKeyId}
                  autoComplete="off"
                  onChange={(e) => setAccessKeyId(e.target.value)}
                />
                <PasswordField
                  label="Secret access key"
                  name="secretAccessKey"
                  value={secretAccessKey}
                  description={errors.secretAccessKey}
                  aria-invalid={errors.secretAccessKey ? true : undefined}
                  autoComplete="off"
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                />
              </div>
            ) : (
              <RoleSetup
                awsRole={awsRole as AwsRoleSetup}
                policies={policies}
                roleArn={roleArn}
                error={errors.roleArn}
                onRoleArn={setRoleArn}
              />
            )}
            <p className="text-muted-foreground text-sm">
              Give Sahihi permission to put, get and list objects only. Leave delete out: Sahihi
              never deletes your files, and the bucket's own permissions then guarantee it.
            </p>
            <DialogActions>
              <Button
                variant="ghost"
                type="button"
                disabled={pending}
                onClick={() => change(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Connect and test
              </Button>
            </DialogActions>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RoleSetup({
  awsRole,
  policies,
  roleArn,
  error,
  onRoleArn,
}: {
  awsRole: AwsRoleSetup
  policies: Policies | null
  roleArn: string
  error?: string
  onRoleArn: (v: string) => void
}) {
  const trust = policies ? JSON.stringify(policies.trustPolicy, null, 2) : ""
  const permissions = policies ? JSON.stringify(policies.permissionsPolicy, null, 2) : ""
  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <p className="text-sm">
        In AWS IAM, create a role for <strong>another AWS account</strong>: account ID{" "}
        <span className="font-mono">{awsRole.accountId}</span>, with{" "}
        <strong>Require external ID</strong> set to{" "}
        <span className="font-mono">{awsRole.externalId}</span>. Attach the permissions below, then
        paste the role's ARN.
      </p>
      {policies && (
        <>
          <PolicyBlock title="Trust policy" text={trust} />
          <PolicyBlock title="Permissions policy" text={permissions} />
        </>
      )}
      <Input
        label="Role ARN"
        name="roleArn"
        value={roleArn}
        error={error}
        placeholder="arn:aws:iam::123456789012:role/sahihi-storage"
        onChange={(e) => onRoleArn(e.target.value)}
      />
    </div>
  )
}

function PolicyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-sm">{title}</span>
        <CopyButton value={text} label={`Copy ${title.toLowerCase()}`} />
      </div>
      <pre
        className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {text}
      </pre>
    </div>
  )
}
