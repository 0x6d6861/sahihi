import { LogoMark } from "@/components/app/logo"

/** Auth pages: the Sahihi mark above the panel, so people know where they are before typing a password. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <p className="flex items-center gap-2 font-medium text-lg">
        <LogoMark className="size-[0.85em]" />
        Sahihi
      </p>
      {children}
    </main>
  )
}
