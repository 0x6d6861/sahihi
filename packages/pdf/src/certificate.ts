import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib"
import QRCode from "qrcode"
import { embedUnicodeFonts } from "./fonts"
import { sanitizeForFont, wrapText } from "./text"

/**
 * Certificate of Completion — v1 (INTERNAL provider).
 * A standalone PDF summarising who signed what, when, how they were verified,
 * and the document hashes. Stored separately from the signed PDF so it can
 * reference the signed PDF's hash. See docs/certificates.md.
 */

export interface CertificateSigner {
  name: string
  email: string
  phone: string | null
  role: string
  verification: string
  ipAddress: string | null
  userAgent: string | null
  viewedAt: Date | null
  signedAt: Date | null
  /** From the signer's `recipient.consented` event; null for envelopes signed before versions. */
  consent: { version: string; textSha256: string } | null
}

export interface CertificateEvent {
  occurredAt: Date
  type: string
  actor: string
  ipAddress: string | null
}

export interface CertificateInput {
  code: string
  verifyUrl: string
  provider: "INTERNAL" | "CA"
  envelope: {
    id: string
    title: string
    organizationName: string
    documentName: string
    pageCount: number
    sender: { name: string; email: string }
    createdAt: Date
    sentAt: Date | null
    completedAt: Date
    originalSha256: string
    signedSha256: string
  }
  signers: CertificateSigner[]
  events: CertificateEvent[]
  /** hash of the last audit event — anchors the full chain */
  auditChainHead: string
}

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = 48
const INK = rgb(0.09, 0.09, 0.11)
const MUTED = rgb(0.42, 0.42, 0.47)
const RULE = rgb(0.86, 0.86, 0.88)

export const formatUtc = (d: Date | null) =>
  d ? `${d.toISOString().replace("T", " ").slice(0, 19)} UTC` : "—"

class Writer {
  page!: PDFPage
  y = 0
  constructor(
    private doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private footer: string,
  ) {
    this.newPage()
  }
  get contentWidth() {
    return A4.width - MARGIN * 2
  }
  newPage() {
    this.page = this.doc.addPage([A4.width, A4.height])
    this.y = A4.height - MARGIN
    this.page.drawText(sanitizeForFont(this.footer, this.regular), {
      x: MARGIN,
      y: MARGIN / 2,
      size: 7,
      font: this.regular,
      color: MUTED,
    })
  }
  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage()
  }
  text(
    text: string,
    opts: {
      size?: number
      bold?: boolean
      color?: ReturnType<typeof rgb>
      x?: number
      width?: number
    } = {},
  ) {
    const size = opts.size ?? 9
    const font = opts.bold ? this.bold : this.regular
    const x = opts.x ?? MARGIN
    const width = opts.width ?? this.contentWidth - (x - MARGIN)
    const lines = wrapText(sanitizeForFont(text, font), font, size, width)
    for (const line of lines) {
      this.ensure(size * 1.4)
      this.y -= size * 1.4
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? INK })
    }
  }
  /** Label/value row with the label in a fixed-width column. */
  row(label: string, value: string, labelWidth = 130) {
    const startY = this.y
    const startPage = this.page
    this.text(label, { color: MUTED, width: labelWidth - 8 })
    const labelEndY = this.y
    if (this.page === startPage) this.y = startY
    this.text(value, { x: MARGIN + labelWidth })
    if (this.page === startPage) this.y = Math.min(this.y, labelEndY)
  }
  gap(h = 8) {
    this.y -= h
  }
  heading(text: string) {
    this.ensure(40)
    this.gap(14)
    this.text(text.toUpperCase(), { size: 8, bold: true, color: MUTED })
    this.gap(4)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4.width - MARGIN, y: this.y },
      thickness: 0.5,
      color: RULE,
    })
    this.gap(2)
  }
}

export async function renderCertificate(input: CertificateInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Certificate of Completion — ${input.envelope.title}`)
  doc.setSubject(`Envelope ${input.envelope.id}`)
  doc.setProducer("Sahihi")
  doc.setCreationDate(input.envelope.completedAt)

  // Signer names, titles and org names are user input in any language.
  const { regular, bold } = await embedUnicodeFonts(doc)
  const w = new Writer(
    doc,
    regular,
    bold,
    `Certificate ${input.code} · Envelope ${input.envelope.id} · Verify at ${input.verifyUrl}`,
  )

  // ── Header + QR ──
  const qrPng = await QRCode.toBuffer(input.verifyUrl, { type: "png", margin: 0, width: 240 })
  const qr = await doc.embedPng(new Uint8Array(qrPng))
  const qrSize = 84
  w.page.drawImage(qr, {
    x: A4.width - MARGIN - qrSize,
    y: A4.height - MARGIN - qrSize,
    width: qrSize,
    height: qrSize,
  })

  const headerWidth = w.contentWidth - qrSize - 16
  w.text("Certificate of Completion", { size: 20, bold: true, width: headerWidth })
  w.gap(4)
  w.text(input.envelope.title, { size: 11, width: headerWidth })
  w.gap(2)
  w.text(`Verification code: ${input.code}`, { size: 9, bold: true, width: headerWidth })
  w.text(
    input.provider === "INTERNAL"
      ? "Electronic signatures captured with audit trail. Not a qualified/advanced digital signature."
      : "Sealed with a digital signature from a licensed certification service provider.",
    { size: 7.5, color: MUTED, width: headerWidth },
  )
  w.y = Math.min(w.y, A4.height - MARGIN - qrSize - 4)

  // ── Summary ──
  const e = input.envelope
  w.heading("Envelope")
  w.row("Envelope ID", e.id)
  w.row("Organization", e.organizationName)
  w.row("Document", `${e.documentName} (${e.pageCount} page${e.pageCount === 1 ? "" : "s"})`)
  w.row("Sender", `${e.sender.name} <${e.sender.email}>`)
  w.row("Created", formatUtc(e.createdAt))
  w.row("Sent", formatUtc(e.sentAt))
  w.row("Completed", formatUtc(e.completedAt))

  w.heading("Document integrity (SHA-256)")
  w.row("Original document", e.originalSha256)
  w.row("Signed document", e.signedSha256)
  w.row("Audit chain head", input.auditChainHead)

  // ── Signers ──
  w.heading(`Recipients (${input.signers.length})`)
  input.signers.forEach((s, i) => {
    w.ensure(90)
    if (i > 0) w.gap(6)
    w.text(`${s.name} <${s.email}>`, { bold: true, size: 9.5 })
    w.row("Role", s.role)
    w.row("Verification", s.verification + (s.phone ? ` (${s.phone})` : ""))
    w.row("Viewed", formatUtc(s.viewedAt))
    w.row("Signed", formatUtc(s.signedAt))
    w.row(
      "E-sign consent",
      s.consent
        ? `Version ${s.consent.version} (text SHA-256 ${s.consent.textSha256})`
        : s.signedAt
          ? "Not recorded"
          : "—",
    )
    w.row("IP address", s.ipAddress ?? "—")
    w.row("User agent", s.userAgent ?? "—")
  })

  // ── Events ──
  w.heading("Audit trail")
  for (const ev of input.events) {
    w.ensure(14)
    const y = w.y
    w.text(formatUtc(ev.occurredAt), { size: 7.5, color: MUTED, width: 110 })
    const endY = w.y
    w.y = y
    w.text(`${ev.type} — ${ev.actor}${ev.ipAddress ? ` · ${ev.ipAddress}` : ""}`, {
      size: 7.5,
      x: MARGIN + 118,
    })
    w.y = Math.min(w.y, endY)
  }

  return doc.save()
}
