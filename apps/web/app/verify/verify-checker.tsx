"use client"

import { normalizeCertificateCode, sha256Hex, type VerifyHashMatch } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { FileSearchIcon, ShieldCheckIcon } from "@/components/app/icons"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { FileUpload } from "@/components/extend/file-upload"
// coss Spinner: Arc has no standalone spinner, and the hash time is unknown (no progress to show).
import { Spinner } from "@/components/ui/spinner"
import { ApiError, api } from "@/lib/api"
import { shortHash } from "@/lib/documents"

const PDF_ONLY = [{ label: "PDF", icon: FileSearchIcon }]

/** Hashing happens in memory; very large files would strain low-end phones. */
const MAX_VERIFY_BYTES = 100 * 1024 * 1024

type Result =
  | { state: "idle" }
  | { state: "hashing"; name: string }
  | { state: "no_match"; name: string; sha256: string }
  | { state: "error"; message: string }

/**
 * Drop a PDF: it's hashed here with Web Crypto and only the SHA-256 is sent to
 * `POST /api/verify/hash`. The file never leaves the device (docs/certificates.md → Verification).
 */
export function VerifyChecker() {
  const router = useRouter()
  const [result, setResult] = useState<Result>({ state: "idle" })
  const [codeInput, setCodeInput] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)

  async function check(file: File) {
    if (file.size > MAX_VERIFY_BYTES) {
      return setResult({ state: "error", message: "That file is larger than 100 MB." })
    }
    setResult({ state: "hashing", name: file.name })
    try {
      const sha256 = await sha256Hex(await file.arrayBuffer())
      const { match, code } = await api<{ match: VerifyHashMatch; code?: string }>("/verify/hash", {
        method: "POST",
        json: { sha256 },
      })
      if (match && code) {
        router.push(`/verify/${encodeURIComponent(code)}?match=${match}`)
        return
      }
      setResult({ state: "no_match", name: file.name, sha256 })
    } catch (err) {
      setResult({
        state: "error",
        message:
          err instanceof ApiError && err.status === 429
            ? "Too many checks in a short time. Please wait a minute and try again."
            : "The file couldn't be checked. Please try again.",
      })
    }
  }

  function openCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const code = normalizeCertificateCode(codeInput)
    if (!code) return setCodeError("Codes look like K7QM-2XDP-9RTA (12 letters and digits).")
    setCodeError(null)
    router.push(`/verify/${code}`)
  }

  return (
    <div className="flex flex-col gap-6">
      {result.state === "hashing" ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed text-center">
          <Spinner aria-hidden />
          <p className="font-medium text-sm">Checking {result.name}…</p>
          <p className="text-muted-foreground text-xs">Computing its fingerprint on this device</p>
        </div>
      ) : (
        <FileUpload
          accept=".pdf,application/pdf"
          acceptedFileTypes={PDF_ONLY}
          multiple={false}
          showFileList={false}
          title="Drop a signed PDF or certificate to verify"
          description="It stays on your device. Only its SHA-256 fingerprint is sent."
          onFilesAccepted={(files) => {
            const file = files[0]
            if (file) void check(file)
          }}
        />
      )}

      {result.state === "no_match" && (
        <Alert tone="warning" title={`No match for ${result.name}`}>
          <div className="flex flex-col gap-2">
            <p>
              This exact file wasn't signed or certified with Sahihi. If it came from Sahihi, it has
              been changed since signing: even re-saving or printing to PDF creates a new file.
              Download the original from your completion email and check that one.
            </p>
            <p className="font-mono text-xs" title={`SHA-256 ${result.sha256}`}>
              SHA-256 {shortHash(result.sha256)}
            </p>
          </div>
        </Alert>
      )}
      {result.state === "error" && <Alert tone="danger" title={result.message} />}

      <form className="flex items-end gap-2" noValidate onSubmit={openCode}>
        <div className="min-w-0 flex-1">
          <Input
            label="Or enter the code from a certificate"
            name="code"
            value={codeInput}
            error={codeError ?? undefined}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="K7QM-2XDP-9RTA"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            style={{ fontFamily: "var(--font-mono)" }}
          />
        </div>
        <Button type="submit" variant="secondary" className={codeError ? "mb-7" : undefined}>
          <ShieldCheckIcon aria-hidden />
          Check
        </Button>
      </form>
    </div>
  )
}
