"use client"

import { EraserIcon, ImageUpIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type SignaturePad from "signature_pad"
import {
  PDF_EDITOR_DEFAULT_SIGNATURE_FONTS_URL,
  PDF_EDITOR_SIGNATURE_FONTS,
} from "@/components/extend/pdf-editor-shared"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { inkBounds, isAcceptablePng } from "@/lib/signing"

/**
 * Draw / type / upload a signature or initials → trimmed PNG data URL.
 * Composed from coss parts + `signature_pad` (the library Extend's own dialog uses) because Extend's
 * signature dialogs aren't exported for reuse (ADR 0008). Typed signatures use Extend's exported
 * signature fonts.
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

function DrawPad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return
    void import("signature_pad").then(({ default: Pad }) => {
      if (cancelled) return
      // Crisp lines on high-DPI screens: back the canvas with device pixels.
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext("2d")?.scale(ratio, ratio)
      const pad = new Pad(canvas, { penColor: INK, minWidth: 0.8, maxWidth: 2.6 })
      pad.addEventListener("endStroke", () => onChangeRef.current(exportTrimmed(canvas)))
      padRef.current = pad
    })
    return () => {
      cancelled = true
      padRef.current?.off()
      padRef.current = null
    }
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        aria-label="Signature drawing area"
        className="h-44 w-full touch-none rounded-lg border border-dashed bg-background"
      />
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>Draw with your mouse, finger or stylus.</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            padRef.current?.clear()
            onChange(null)
          }}
        >
          <EraserIcon aria-hidden />
          Clear
        </Button>
      </div>
    </div>
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
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field>
          <FieldLabel>Type your name</FieldLabel>
          <Input value={text} maxLength={60} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Style</FieldLabel>
          <Select items={fontItems} value={font} onValueChange={(v) => v && setFont(String(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {fontItems.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  <span style={{ fontFamily: f.value }}>{f.label}</span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
      </div>
      <canvas
        ref={canvasRef}
        width={900}
        height={200}
        aria-label="Typed signature preview"
        className="h-28 w-full rounded-lg border border-dashed bg-background"
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
      <Button variant="outline" className="self-start" onClick={() => inputRef.current?.click()}>
        <ImageUpIcon aria-hidden />
        Choose an image
      </Button>
      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex h-28 items-center justify-center rounded-lg border border-dashed bg-background p-2">
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: SignatureKind
  signerName: string
  /** A signature/initials already created in this session, offered for reuse. */
  adopted: string | null
  onConfirm: (dataUrl: string) => void
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
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {kind === "initials" ? "Add your initials" : "Add your signature"}
          </DialogTitle>
          <DialogDescription>
            Your {label} will be placed on the document when you finish signing.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-4">
          {adopted && (
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              {/* biome-ignore lint/performance/noImgElement: local data URL preview */}
              <img src={adopted} alt={`Your ${label}`} className="h-10 max-w-48 object-contain" />
              <Button
                variant="outline"
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
            <TabsList>
              <TabsTab value="draw">Draw</TabsTab>
              <TabsTab value="type">Type</TabsTab>
              <TabsTab value="upload">Upload</TabsTab>
            </TabsList>
            <TabsPanel value="draw" className="pt-3">
              {tab === "draw" && <DrawPad onChange={setValue} />}
            </TabsPanel>
            <TabsPanel value="type" className="pt-3">
              {tab === "type" && (
                <TypePad
                  defaultText={kind === "initials" ? initials : signerName}
                  onChange={setValue}
                />
              )}
            </TabsPanel>
            <TabsPanel value="upload" className="pt-3">
              {tab === "upload" && <UploadPad onChange={setValue} />}
            </TabsPanel>
          </Tabs>
        </DialogPanel>
        <DialogFooter>
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
            Adopt and place
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
