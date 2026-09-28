import type { Metadata } from "next"
import "./globals.css"
import { Geist_Mono, Inter } from "next/font/google"
import { connection } from "next/server"
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

const interHeading = Inter({ subsets: ["latin"], variable: "--font-heading" })

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: { default: "Sahihi", template: "%s · Sahihi" },
  description: "Send documents for electronic signature",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request so Next can put proxy.ts's CSP nonce on its scripts. A
  // prerendered page would ship scripts without it, and the CSP would block them.
  await connection()
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-mono", inter.variable, interHeading.variable, geistMono.variable)}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) add attributes to <body>
          before React hydrates. It only silences attribute mismatches on <body> itself. */}
      <body
        className="min-h-dvh bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        <ToastProvider>
          <AnchoredToastProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </AnchoredToastProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
