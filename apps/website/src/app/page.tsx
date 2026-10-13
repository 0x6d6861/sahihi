import { ContextRow } from "@/components/sections/ContextRow"
import { Faq } from "@/components/sections/Faq"
import { FeatureChapters } from "@/components/sections/FeatureChapters"
import { Footer } from "@/components/sections/Footer"
import { Header } from "@/components/sections/Header"
import { HeroStory } from "@/components/sections/HeroStory"
import { PillarIntro } from "@/components/sections/PillarIntro"
import { Pricing } from "@/components/sections/Pricing"
import { Process } from "@/components/sections/Process"
import { Trust } from "@/components/sections/Trust"

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <HeroStory />
        <PillarIntro />
        <FeatureChapters />
        <ContextRow />
        <Process />
        <Trust />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </>
  )
}
