import Link from "next/link"
import { redirect } from "next/navigation"
import { UserMenu } from "@/components/app/app-shell/user-menu"
import { ButtonLink } from "@/components/app/button-link"
import { PlusIcon } from "@/components/app/icons"
import { LogoMark } from "@/components/app/logo"
import { getServerSession } from "@/lib/api-server"

/**
 * A signer's own pages (ADR 0062): no workspace needed. The Sahihi mark, "Personal", a way to
 * create a workspace (or back to one), and the account menu.
 */
export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect("/sign-in?next=/signed")
  const hasWorkspace = Boolean(session.session.activeOrganizationId)
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-3 md:px-6">
        <Link href="/signed" className="flex items-center gap-2 font-medium text-lg no-underline">
          <LogoMark className="size-[0.85em]" />
          Sahihi
        </Link>
        <span className="h-5 w-px bg-border" aria-hidden />
        <span className="text-muted-foreground text-sm">Personal</span>
        <div className="ms-auto flex items-center gap-3">
          {hasWorkspace ? (
            <ButtonLink href="/files" size="sm">
              Go to your workspace
            </ButtonLink>
          ) : (
            <ButtonLink href="/onboarding" size="sm">
              <PlusIcon aria-hidden />
              Create a workspace
            </ButtonLink>
          )}
          <UserMenu user={session.user} showSettings={hasWorkspace} />
        </div>
      </header>
      <main className="app-canvas flex-1 px-4 pt-8 pb-14 md:px-6">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
