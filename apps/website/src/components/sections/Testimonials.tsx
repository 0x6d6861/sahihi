import { Reveal } from "@/components/ui/Reveal"
import { Section } from "@/components/ui/Section"
import { site } from "@/content/site"

/** Bento placement for up to five quotes on a 12-column grid (md and up). */
const layout = [
  "md:col-span-4 md:row-span-2",
  "md:col-span-8",
  "md:col-span-8",
  "md:col-span-8",
  "md:col-span-4",
]

export function Testimonials() {
  const { headline, quotes } = site.testimonials
  return (
    <Section className="pb-48">
      <Reveal>
        <h2 className="text-title">{headline}</h2>
      </Reveal>
      <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-12">
        {quotes.map((q, i) => (
          <Reveal key={q.text} delay={(i % 3) * 0.05} className={layout[i % layout.length]}>
            <blockquote className="flex h-full items-start text-quote rounded-[32px] bg-panel p-8 md:p-10">
              <p className="max-w-[16em]">“{q.text}”</p>
            </blockquote>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
