"use client"

import { useRouter } from "next/navigation"
import { type DragEvent, type FormEvent, useRef, useState } from "react"
import { site } from "@/content/site"
import { type HashMatch, MAX_VERIFY_BYTES, normalizeCode, sha256Hex, shortHash } from "./verify"

const t = site.verify

type State =
  | { kind: "idle" }
  | { kind: "hashing"; name: string }
  | { kind: "no_match"; name: string; sha256: string }
  | { kind: "error"; message: string }

/**
 * Drop a PDF: it's hashed here with Web Crypto and only the SHA-256 goes to
 * `POST /api/verify/hash` (proxied to the API, next.config.ts). A match opens the certificate.
 */
export function VerifyChecker() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ kind: "idle" })
  const [over, setOver] = useState(false)
  const [code, setCode] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)

  async function check(file: File) {
    if (file.type && file.type !== "application/pdf") {
      return setState({ kind: "error", message: t.errors.notPdf })
    }
    if (file.size > MAX_VERIFY_BYTES) {
      return setState({ kind: "error", message: t.errors.tooLarge })
    }
    setState({ kind: "hashing", name: file.name })
    try {
      const sha256 = await sha256Hex(await file.arrayBuffer())
      const res = await fetch("/api/verify/hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha256 }),
      })
      if (res.status === 429) return setState({ kind: "error", message: t.errors.rateLimited })
      if (!res.ok) throw new Error(String(res.status))
      const { match, code: found } = (await res.json()) as {
        match: HashMatch | null
        code?: string
      }
      if (match && found) {
        router.push(`/verify/${encodeURIComponent(found)}?match=${match}`)
        return
      }
      setState({ kind: "no_match", name: file.name, sha256 })
    } catch {
      setState({ kind: "error", message: t.errors.failed })
    }
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void check(file)
  }

  function openCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const normal = normalizeCode(code)
    if (!normal) return setCodeError(t.code.invalid)
    setCodeError(null)
    router.push(`/verify/${normal}`)
  }

  const hashing = state.kind === "hashing"
  return (
    <div className="mt-10 flex flex-col gap-8">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border border-dashed px-6 py-10 text-center transition-[background-color,border-color] duration-150 ease-out ${
          over ? "border-ink/40 bg-pill" : "border-line bg-panel hover:bg-pill"
        }`}
      >
        <input
          ref={input}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          disabled={hashing}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void check(file)
            e.target.value = ""
          }}
        />
        {hashing ? (
          <>
            <span
              aria-hidden
              className="size-6 animate-spin rounded-full border-2 border-ghost border-t-ink"
            />
            <span className="text-sub" aria-live="polite">
              {t.drop.checking} {state.name}…
            </span>
            <span className="text-caption font-normal text-muted">{t.drop.checkingHint}</span>
          </>
        ) : (
          <>
            <span className="text-sub">{t.drop.title}</span>
            <span className="text-caption font-normal text-muted">{t.drop.hint}</span>
            <span className="text-button mt-3 inline-flex h-12 items-center rounded-2xl bg-pill-raised px-6 transition-[scale] duration-150 ease-out active:scale-[0.97]">
              {t.drop.choose}
            </span>
          </>
        )}
      </label>

      {state.kind === "no_match" && (
        <div role="status" className="rounded-3xl bg-panel px-6 py-5 md:px-8">
          <p className="text-sub">
            {t.noMatch.title} {state.name}
          </p>
          <p className="text-caption mt-2 font-normal text-muted">{t.noMatch.body}</p>
          <p className="mt-3 font-mono text-[0.8125rem] text-muted" title={state.sha256}>
            SHA-256 {shortHash(state.sha256)}
          </p>
        </div>
      )}
      {state.kind === "error" && (
        <p role="alert" className="text-caption rounded-3xl bg-panel px-6 py-5 md:px-8">
          {state.message}
        </p>
      )}

      <form className="flex flex-col gap-2" noValidate onSubmit={openCode}>
        <label htmlFor="verify-code" className="text-caption">
          {t.code.label}
        </label>
        <div className="flex gap-2">
          <input
            id="verify-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t.code.placeholder}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={Boolean(codeError)}
            aria-describedby={codeError ? "verify-code-error" : undefined}
            className="h-12 min-w-0 flex-1 rounded-2xl bg-panel px-4 font-mono text-[1rem] tracking-[0.04em] text-ink outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-ink md:h-[52px]"
          />
          <button
            type="submit"
            className="text-button h-12 shrink-0 rounded-2xl bg-ink px-6 text-paper transition-[background-color,scale] duration-150 ease-out hover:bg-ink/80 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:h-[52px]"
          >
            {t.code.button}
          </button>
        </div>
        {codeError && (
          <p id="verify-code-error" className="text-caption font-normal text-muted">
            {codeError}
          </p>
        )}
      </form>
    </div>
  )
}
