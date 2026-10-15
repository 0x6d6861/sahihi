import Link from "next/link"
import { LogoMark } from "@/components/app/logo"

/** Public verify pages: the Sahihi mark, so people know who is vouching for the result. */
export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-4 md:px-6">
        <Link href="/verify" className="flex items-center gap-2 font-medium text-lg no-underline">
          <LogoMark className="size-[0.85em]" />
          Sahihi
        </Link>
      </header>
      {children}
    </div>
  )
}
