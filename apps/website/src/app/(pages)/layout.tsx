import type { ReactNode } from "react"
import { Footer } from "@/components/sections/Footer"
import { Header } from "@/components/sections/Header"
import { Inset, Section } from "@/components/ui/Section"

/** Long-form pages written in MDX: the header, one reading column, the footer. */
export default function PagesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main>
        <Section className="pb-40 pt-32 md:pt-44">
          <Inset>
            {/* A reading column; pages with code samples get room for them. */}
            <article className="max-w-[36em] has-[pre]:max-w-[46em]">{children}</article>
          </Inset>
        </Section>
      </main>
      <Footer />
    </>
  )
}
