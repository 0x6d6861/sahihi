import { redirect } from "next/navigation"
import { AppShell } from "@/components/app/app-shell/app-shell"
import type { ShellOrganization } from "@/components/app/app-shell/org-switcher"
import { apiServer, getServerSession } from "@/lib/api-server"

/** Authenticated shell: coss Sidebar with the workspace switcher and user menu. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect("/sign-in")
  const activeOrganizationId = session.session.activeOrganizationId
  if (!activeOrganizationId) redirect("/onboarding")

  // better-auth returns only the organizations this user is a member of.
  const [{ data }, { data: workspace }] = await Promise.all([
    apiServer<ShellOrganization[]>("/auth/organization/list"),
    // The website icon of the active workspace only: the API serves no one else's.
    apiServer<{ icon: string | null }>("/workspace"),
  ])
  const organizations = (data ?? []).map(({ id, name }) => ({ id, name }))

  return (
    <AppShell
      user={session.user}
      organizations={organizations}
      activeOrganizationId={activeOrganizationId}
      activeIcon={workspace?.icon ?? null}
    >
      {children}
    </AppShell>
  )
}
