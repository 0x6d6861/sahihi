/// <reference path="./assets.d.ts" />
import { isAbsolute, join } from "node:path"
import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium"
// Bun copies the WASM next to the bundle (`bun build`) and resolves it to a path in source mode.
import wasmPath from "@embedpdf/pdfium/pdfium.wasm" with { type: "file" }

// PDFium (the same build the web viewer uses) reads text and renders pages: pdf-lib can do neither.
let pdfium: Promise<WrappedPdfiumModule> | undefined

/** The shared PDFium module, initialised once per process. */
export function loadPdfium(): Promise<WrappedPdfiumModule> {
  pdfium ??= (async () => {
    const path = isAbsolute(wasmPath) ? wasmPath : join(import.meta.dir, wasmPath)
    const m = await init({ wasmBinary: await Bun.file(path).arrayBuffer() })
    m.PDFiumExt_Init()
    return m
  })()
  return pdfium
}

/** Emscripten replaces the heap views when memory grows (malloc), so read them at each use. */
export function pdfiumHeap(m: WrappedPdfiumModule) {
  return m.pdfium as unknown as { HEAPU8: Uint8Array; HEAPF32: Float32Array; HEAPF64: Float64Array }
}
