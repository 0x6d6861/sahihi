import { Reveal } from "@/components/ui/Reveal"
import { Inset, Section } from "@/components/ui/Section"
import { site } from "@/content/site"

export function Pricing() {
  const { headline, plans, footnote } = site.pricing
  return (
    <Section id="pricing" className="pb-48">
      <Inset>
        <Reveal>
          <h2 className="text-title">{headline}</h2>
        </Reveal>
        <div className="mt-14 grid gap-3 sm:grid-cols-2">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.06}>
              <div className="flex h-full flex-col rounded-[32px] bg-panel p-8 md:p-10">
                <p className="text-lede text-muted">{plan.name}</p>
                <p className="mt-6 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-price">{plan.price}</span>
                  <span className="text-lede font-normal text-muted">{plan.unit}</span>
                </p>
                <ul className="text-sub mt-8 flex-1 space-y-2 font-normal text-muted">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <span className="text-faint">—</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.href}
                  className={`text-button mt-10 inline-flex h-12 items-center justify-center rounded-2xl px-6 transition-[background-color,scale] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:h-[52px] ${
                    plan.featured
                      ? "bg-ink text-paper hover:bg-ink/80"
                      : "bg-pill-raised hover:bg-pill-raised-hover"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="text-caption mt-6 px-3 font-normal text-muted">{footnote}</p>
      </Inset>
    </Section>
  )
}
