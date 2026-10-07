import type { Metadata } from "next"
import "./globals.css"
import "@/components/arc/foundation.css"
import "./app.css"
import { Geist, Geist_Mono, Inter } from "next/font/google"
import { cookies, headers } from "next/headers"
import { AppProviders } from "@/components/app/providers"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  parseThemePreference,
  SYSTEM_THEME_SCRIPT,
  serverThemeAttributes,
  THEME_COOKIE,
} from "@/lib/theme"
import { cn } from "@/lib/utils"

// Arc type: Geist for display headings, Inter for everything else (app.css maps coss's font tokens).
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: { default: "Sahihi", template: "%s · Sahihi" },
  description: "Send documents for electronic signature",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers makes every page render per request, so Next can put proxy.ts's CSP nonce on its
  // scripts. A prerendered page would ship scripts without it, and the CSP would block them.
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const nonce = headerStore.get("x-nonce") ?? undefined
  const preference = parseThemePreference(cookieStore.get(THEME_COOKIE)?.value)
  const { className: themeClass, ...themeAttributes } = serverThemeAttributes(preference)

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme-preference={preference}
      {...themeAttributes}
      className={cn(geist.variable, inter.variable, geistMono.variable, themeClass)}
    >
      <head>
        {preference === "system" && (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static script from lib/theme.ts, nonce'd for the CSP
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
        )}
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) add attributes to <body>
          before React hydrates. It only silences attribute mismatches on <body> itself. */}
      <body
        className="min-h-dvh bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        <AppProviders>
          <TooltipProvider>{children}</TooltipProvider>
        </AppProviders>
      </body>
    </html>
  )
}
