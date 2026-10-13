import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { ThemeHotkey } from "@/components/ui/ThemeHotkey"
import { themeScript } from "@/components/ui/themeScript"
import { site } from "@/content/site"
import "./globals.css"

// Fonts are self-hosted from npm packages (geist, @fontsource-variable/inter), not
// next/font/google: Google sometimes serves font URLs with extra query params that
// Turbopack's dev server can't resolve ("Can't resolve '@vercel/turbopack-next/internal/font/google/font'").
// Self-hosting also means builds need no network.

// Geist for everything outside the mockups. subframe.com uses PP Neue Montreal (licensed);
// to use it, point this at its files instead.
const display = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-display",
  weight: "100 900",
})

// Plain Inter for the small UI text inside product mockups, where a tight face gets cramped.
const ui = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-ui",
  weight: "100 900",
})

const mono = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-mono-face",
  weight: "100 900",
})

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  openGraph: {
    title: site.title,
    description: site.description,
    siteName: site.name,
    type: "website",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f9" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // themeScript sets data-theme on <html> before React hydrates, so the attribute differs from the server HTML.
    <html
      lang="en"
      className={`${display.variable} ${ui.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme script, runs before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-svh overflow-x-clip">
        {children}
        <ThemeHotkey />
      </body>
    </html>
  )
}
