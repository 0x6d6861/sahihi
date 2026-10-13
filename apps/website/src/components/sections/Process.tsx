import { Reveal } from "@/components/ui/Reveal"
import { Inset, Section } from "@/components/ui/Section"
import { site } from "@/content/site"

/** Four giant numerals in a 2×2 grid; each step fades up in turn. */
export function Process() {
  const { headline, steps } = site.process
  return (
    <Section className="pb-48">
      <Inset>
        <Reveal>
          <h2 className="text-display">
            {headline[0]}
            <br />
            {headline[1]}
          </h2>
        </Reveal>
      </Inset>
      {/* Wider than the Inset column so 28px step text doesn't wrap beside 184px numerals. */}
      <ol className="mx-auto mt-20 grid max-w-[1024px] gap-8 md:grid-cols-2 md:gap-12">
        {steps.map((s, i) => (
          <li key={s.title}>
            {/* Fixed numeral box with a full-height line box, text block centred against it. */}
            <Reveal delay={i * 0.06} distance={16} className="flex items-center gap-4 md:gap-6">
              <span className="text-numeral w-20 shrink-0 text-center md:w-32">{i + 1}</span>
              <div className="text-lede">
                <p className="text-step">{s.title}</p>
                {s.lines.map((l) => (
                  <p key={l} className="font-normal text-muted">
                    {l}
                  </p>
                ))}
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  )
}
