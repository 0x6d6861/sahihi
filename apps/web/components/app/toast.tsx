"use client"

import { useEffect } from "react"
import {
  type ToastOptions,
  type ToastStackApi,
  useToastStack,
} from "@/components/arc/toast-stack/toast-stack"

/**
 * Imperative access to Arc's toast stack, so event handlers and hooks outside the provider's render
 * tree can raise a toast (`toastManager.add({ title, description, type })`). Toasts are for background
 * results; a foreground action confirms in place (docs/ui.md).
 */
let api: ToastStackApi | null = null
const queued: ToastOptions[] = []

export const toastManager = {
  add(options: ToastOptions): string | undefined {
    if (api) return api.toast(options)
    queued.push(options)
    return undefined
  },
  update(id: string, patch: Partial<Omit<ToastOptions, "id">>) {
    api?.update(id, patch)
  },
  close(id?: string) {
    api?.dismiss(id)
  },
}

/** Mounted once inside `ToastStackProvider` (components/app/providers.tsx). */
export function ToastBridge() {
  const { toast, update, dismiss } = useToastStack()
  useEffect(() => {
    const stack = { toast, update, dismiss }
    api = stack
    for (const options of queued.splice(0)) toast(options)
    return () => {
      if (api === stack) api = null
    }
  }, [toast, update, dismiss])
  return null
}
