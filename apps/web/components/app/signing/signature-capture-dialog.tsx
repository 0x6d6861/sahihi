"use client"

import { useEffect, useRef, useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { ImageUpIcon } from "@/components/app/icons"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import {
  type InkStroke,
  SignaturePad,
  signatureToPng,
} from "@/components/arc/signature-pad/signature-pad"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import {
  PDF_EDITOR_DEFAULT_SIGNATURE_FONTS_URL,
  PDF_EDITOR_SIGNATURE_FONTS,
} from "@/components/extend/pdf-editor-shared"
import { inkBounds, isAcceptablePng } from "@/lib/signing"

/**
 * Draw / type / upload a signature or initials → trimmed PNG data URL (ADR 0008, ADR 0023).
 * Draw is Arc's signature pad (pressure-aware ink, undo, cropped PNG export). Type renders with
 * Extend's exported signature fonts; Upload scales and crops an image. Every result is a data URL
 * that must pass `isAcceptablePng` before it can be adopted.
 */

export type SignatureKind = "signature" | "initials"
type Tab = "draw" | "type" | "upload"

const INK = "#1e1b4b" // stays dark on the white PDF page in either theme
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** Crop to the inked area (plus a small margin) and export as PNG. */
function exportTrimmed(source: HTMLCanvasElement, margin = 8): string | null {
  const ctx = source.getContext("2d")
  if (!ctx) return null
  const { width, height } = source
  const box = inkBounds(ctx.getImageData(0, 0, width, height).data, width, height)
  if (!box) return null
  const x = Math.max(0, box.x - margin)
  const y = Math.max(0, box.y - margin)
  const w = Math.min(width - x, box.width + margin * 2)
  const h = Math.min(height - y, box.height + margin * 2)
  const out = document.createElement("canvas")
  out.width = w
  out.height = h
  out.getContext("2d")?.drawImage(source, x, y, w, h, 0, 0, w, h)
  return out.toDataURL("image/png")
}

function useSignatureFonts(enabled: boolean) {
  useEffect(() => {
    if (!enabled || document.querySelector("link[data-signature-fonts]")) return
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = PDF_EDITOR_DEFAULT_SIGNATURE_FONTS_URL
    link.dataset.signatureFonts = ""
    document.head.appendChild(link)
  }, [enabled])
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

function DrawPad({
  signerName,
  label,
  onChange,
}: {
  signerName: string
  label: string
  onChange: (dataUrl: string | null) => void
}) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // Strokes arrive after every change; only the latest export may win.
  const latest = useRef(0)

  async function exportStrokes(strokes: InkStroke[]) {
    const run = ++latest.current
    if (strokes.length === 0) return onChangeRef.current(null)
    try {
      // Arc crops to the ink; scale 2 keeps the PNG well under the API's data-URL cap.
      const dataUrl = await blobToDataUrl(await signatureToPng(strokes, 2))
      if (run === latest.current) onChangeRef.current(dataUrl)
    } catch {
      if (run === latest.current) onChangeRef.current(null)
    }
  }

  return (
    <SignaturePad
      signer={signerName}
      label={`Draw your ${label}`}
      fileName={label}
      onChange={(strokes) => void exportStrokes(strokes)}
    />
  )
}

function TypePad({
  defaultText,
  onChange,
}: {
  defaultText: string
  onChange: (dataUrl: string | null) => void
}) {
  const [text, setText] = useState(defaultText)
  const [font, setFont] = useState<string>(PDF_EDITOR_SIGNATURE_FONTS[0]?.family ?? "cursive")
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const size = 72
    const spec = `${size}px ${font}`
    void document.fonts.load(spec, text || "a").finally(() => {
      if (cancelled) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!text.trim()) return onChange(null)
      ctx.font = spec
      const width = Math.min(canvas.width - 40, ctx.measureText(text).width)
      ctx.fillStyle = INK
      ctx.textBaseline = "middle"
      ctx.fillText(text, 20, canvas.height / 2, width)
      onChange(exportTrimmed(canvas))
    })
    return () => {
      cancelled = true
    }
  }, [text, font, onChange])

  const fontItems = PDF_EDITOR_SIGNATURE_FONTS.map((f) => ({ value: f.family, label: f.name }))
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Input
          label="Type your name"
          value={text}
          maxLength={60}
          onChange={(e) => setText(e.target.value)}
        />
        <Select label="Style" options={fontItems} value={font} onValueChange={setFont} />
      </div>
      <canvas
        ref={canvasRef}
        width={900}
        height={200}
        aria-label="Typed signature preview"
        className="h-28 w-full rounded-2xl border border-dashed bg-background"
      />
    </div>
  )
}

function UploadPad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function load(file: File) {
    setError(null)
    if (!["image/png", "image/jpeg"].includes(file.type)) return setError("Use a PNG or JPG image.")
    if (file.size > MAX_UPLOAD_BYTES) return setError("Use an image under 5 MB.")
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1200 / bitmap.width, 400 / bitmap.height)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const url = exportTrimmed(canvas)
    if (!url) return setError("That image looks blank.")
    setPreview(url)
    onChange(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void load(file)
          e.target.value = ""
        }}
      />
      <div>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          <ImageUpIcon aria-hidden />
          Choose an image
        </Button>
      </div>
      {error && <Alert tone="danger" title={error} />}
      <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed bg-background p-2">
        {preview ? (
          // biome-ignore lint/performance/noImgElement: local data URL preview, not a remote asset
          <img src={preview} alt="Uploaded signature preview" className="max-h-full max-w-full" />
        ) : (
          <span className="text-muted-foreground text-xs">A photo or scan of your signature</span>
        )}
      </div>
    </div>
  )
}

export function SignatureCaptureDialog({
  open,
  onOpenChange,
  kind,
  signerName,
  adopted,
  onConfirm,
  description,
  confirmLabel = "Adopt and place",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: SignatureKind
  signerName: string
  /** A signature/initials already created in this session, offered for reuse. */
  adopted: string | null
  onConfirm: (dataUrl: string) => void
  /** Defaults to the signing page's wording; Settings → Profile saves instead of placing. */
  description?: string
  confirmLabel?: string
}) {
  const [tab, setTab] = useState<Tab>("draw")
  const [value, setValue] = useState<string | null>(null)
  useSignatureFonts(open)

  // Fresh state each time the dialog opens.
  useEffect(() => {
    if (open) {
      setTab("draw")
      setValue(null)
    }
  }, [open])

  const initials = signerName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .join("")
  const label = kind === "initials" ? "initials" : "signature"
  const usable = value !== null && isAcceptablePng(value)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Wider than Arc's 440px default: the drawing pad is 600px wide.
        style={{ width: "min(calc(100vw - 2rem), 40rem)" }}
        title={kind === "initials" ? "Add your initials" : "Add your signature"}
        description={
          description ?? `Your ${label} will be placed on the document when you finish signing.`
        }
      >
        <div className="flex flex-col gap-4">
          {adopted && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border p-3">
              {/* biome-ignore lint/performance/noImgElement: local data URL preview */}
              <img src={adopted} alt={`Your ${label}`} className="h-10 max-w-48 object-contain" />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onConfirm(adopted)
                  onOpenChange(false)
                }}
              >
                Use this {label}
              </Button>
            </div>
          )}
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as Tab)
              setValue(null)
            }}
          >
            <TabsList aria-label={`How to add your ${label}`}>
              <TabsTrigger value="draw">Draw</TabsTrigger>
              <TabsTrigger value="type">Type</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="draw" className="pt-3">
              {tab === "draw" && (
                <DrawPad signerName={signerName} label={label} onChange={setValue} />
              )}
            </TabsContent>
            <TabsContent value="type" className="pt-3">
              {tab === "type" && (
                <TypePad
                  defaultText={kind === "initials" ? initials : signerName}
                  onChange={setValue}
                />
              )}
            </TabsContent>
            <TabsContent value="upload" className="pt-3">
              {tab === "upload" && <UploadPad onChange={setValue} />}
            </TabsContent>
          </Tabs>
          <DialogActions>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!usable}
              onClick={() => {
                if (!value) return
                onConfirm(value)
                onOpenChange(false)
              }}
            >
              {confirmLabel}
            </Button>
          </DialogActions>
        </div>
      </DialogContent>
    </Dialog>
  )
}
