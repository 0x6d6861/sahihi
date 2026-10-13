import { Reveal } from "@/components/ui/Reveal"
import { Section } from "@/components/ui/Section"
import { site } from "@/content/site"

/** Bento placement for up to five facts on a 12-column grid (md and up). */
const layout = [
  "md:col-span-4 md:row-span-2",
  "md:col-span-8",
  "md:col-span-8",
  "md:col-span-8",
  "md:col-span-4",
]

/** Verifiable product facts in the bento grid that would otherwise hold customer quotes. */
export function Trust() {
  const { headline, facts } = site.trust
  return (
    <Section className="pb-48">
      <Reveal>
        <h2 className="text-title">{headline}</h2>
      </Reveal>
      <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-12">
        {facts.map((f, i) => (
          <Reveal key={f.text} delay={(i % 3) * 0.05} className={layout[i % layout.length]}>
            <p className="flex h-full items-start text-quote rounded-[32px] bg-panel p-8 md:p-10">
              <span className="max-w-[16em]">{f.text}</span>
            </p>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
