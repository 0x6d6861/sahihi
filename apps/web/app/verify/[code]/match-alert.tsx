"use client"

import { normalizeCertificateCode } from "@sahihi/core"
import { useEffect, useState } from "react"
import { Alert } from "@/components/arc/alert/alert"
import { MATCH_KEY } from "../verify-checker"

const MATCH_TEXT: Record<string, string> = {
  signed_document:
    "The file you checked is exactly the signed document for this certificate. It hasn't been changed since signing.",
  certificate: "The file you checked is exactly this Certificate of Completion, unchanged.",
}

/**
 * "File verified", shown only when this browser just hashed a matching file (the checker leaves
 * the result in sessionStorage). A URL parameter would let anyone forge it.
 */
export function MatchAlert({ code }: { code: string }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MATCH_KEY)
      sessionStorage.removeItem(MATCH_KEY)
      const saved = raw ? (JSON.parse(raw) as { code?: string; match?: string }) : null
      if (saved && normalizeCertificateCode(saved.code ?? "") === code && saved.match) {
        // Strict mode runs this twice and the first read clears it, so never reset to null.
        setText(MATCH_TEXT[saved.match] ?? null)
      }
    } catch {}
  }, [code])

  if (!text) return null
  return (
    <Alert tone="success" title="File verified">
      {text}
    </Alert>
  )
}
