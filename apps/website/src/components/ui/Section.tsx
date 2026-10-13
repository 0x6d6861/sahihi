import type { ReactNode } from "react"

/** Standard content column. Sections are separated by space, never borders. */
export function Section({
  id,
  children,
  className = "",
}: {
  id?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-[1120px] px-4 sm:px-8 ${className}`}>
      {children}
    </section>
  )
}

/** Narrower column used for headlines and body copy, matching the inset in the original. */
export function Inset({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[860px] ${className}`}>{children}</div>
}
