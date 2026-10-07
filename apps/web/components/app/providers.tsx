"use client"

import Link from "next/link"
import { ArcProvider } from "@/components/arc/lib/arc-provider"
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"
import { ToastBridge } from "./toast"

/**
 * Client-side providers for the whole app: Arc renders links with next/link, and one toast stack
 * serves background results (foreground actions confirm in place, see docs/ui.md).
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ArcProvider link={Link}>
      <ToastStackProvider>
        <ToastBridge />
        {children}
        <ToastStack />
      </ToastStackProvider>
    </ArcProvider>
  )
}
