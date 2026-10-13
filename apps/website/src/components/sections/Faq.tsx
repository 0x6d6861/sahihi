import { Reveal } from "@/components/ui/Reveal"
import { Inset, Section } from "@/components/ui/Section"
import { site } from "@/content/site"
import { FaqList } from "./FaqList"

export function Faq() {
  const { headline, items } = site.faq
  return (
    <Section className="pb-48">
      <Inset>
        <Reveal>
          <h2 className="text-title">{headline}</h2>
        </Reveal>
        <FaqList items={items} />
      </Inset>
    </Section>
  )
}
