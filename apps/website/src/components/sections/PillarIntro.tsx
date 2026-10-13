import { PillButton } from "@/components/ui/Button"
import { Reveal } from "@/components/ui/Reveal"
import { site } from "@/content/site"

/** "Canvas. Browser. Agent." in stacked grey display type. */
export function PillarIntro() {
  return (
    <section className="flex flex-col items-center px-4 pb-40 pt-16 text-center">
      <Reveal>
        <p className="text-headline text-ghost">
          {site.pillars.map((p) => (
            <span key={p} className="block">
              {p}.
            </span>
          ))}
        </p>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="text-lede mx-auto mt-8 max-w-[22em] text-ink">{site.pillarIntro}</p>
        <div className="mt-8">
          <PillButton href={site.cta.primary.href}>{site.cta.primary.label}</PillButton>
        </div>
      </Reveal>
    </section>
  )
}
