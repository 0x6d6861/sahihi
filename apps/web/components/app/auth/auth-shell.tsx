import Link from "next/link"
import { ShieldCheckIcon } from "@/components/app/icons"
import { LogoMark } from "@/components/app/logo"
import { cn } from "@/lib/utils"

/**
 * The frame of the auth and onboarding pages: the Sahihi mark top left (people know where they are
 * before typing a password), the form centred, © and a way to verify a document below; `aside` on
 * the right from `lg` (the brand panel, or an onboarding step's preview).
 */
export function AuthShell({
  aside,
  children,
}: {
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh gap-4 bg-background p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-8 px-2 py-2 sm:px-6">
        <p className="flex items-center gap-2 font-medium text-lg">
          <LogoMark className="size-[0.85em]" />
          Sahihi
        </p>
        <main className="flex flex-1 items-center justify-center">{children}</main>
        <footer className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
          <span>© {new Date().getFullYear()} Sahihi</span>
          <Link
            href="/verify"
            className="flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
          >
            <ShieldCheckIcon className="size-3.5" />
            Verify a signed document
          </Link>
        </footer>
      </div>
      {aside}
    </div>
  )
}

/** The right half from `lg`: a tonal panel the brand panel and onboarding previews sit in. */
export function AuthAside({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <aside
      className={cn(
        "hidden w-2/5 max-w-[40rem] flex-col gap-10 overflow-hidden rounded-3xl bg-muted p-12 lg:flex",
        className,
      )}
    >
      {children}
    </aside>
  )
}
