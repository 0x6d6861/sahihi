import { AuthShell } from "@/components/app/auth/auth-shell"
import { BrandPanel } from "@/components/app/auth/brand-panel"

/** Sign in, sign up and the account flows: the form beside the brand panel. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell aside={<BrandPanel />}>{children}</AuthShell>
}
