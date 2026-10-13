# craft-landing-starter

A starter for a quiet, product-led marketing page: a near-monochrome layout, chrome-bezel product mockups, and a scroll-driven hero where three frames merge into one app window. The style follows subframe.com's landing page, with all copy and the sample app replaced by placeholders.

Built with Next.js 16 (App Router), Tailwind CSS v4 and Motion, set in Geist. The page is fully static.

## Run it

Part of the Sahihi monorepo (`@sahihi/website`). Install from the repo root.

```bash
bun install          # at the repo root
bun run dev          # http://localhost:3001
bun run typecheck
bun run build        # static production build
bun run shots        # screenshots + error/overflow check (needs a running server; see docs/QA_CHECKLIST.md)
```

## Working with a coding agent

Agents start at [AGENTS.md](AGENTS.md) (Claude Code reads it through `CLAUDE.md`). It links the specs in [docs/](docs/):

| Doc | Covers |
|---|---|
| [BUILD_PLAN.md](docs/BUILD_PLAN.md) | Build order with checkpoints, plus a backlog |
| [DESIGN.md](docs/DESIGN.md) | Tokens, type scale, layout, components, motion, accessibility |
| [PAGE_SPEC.md](docs/PAGE_SPEC.md) | Every section: content source, layout, behaviour, acceptance criteria |
| [HERO_ANIMATION.md](docs/HERO_ANIMATION.md) | The pinned scroll sequence: timeline, frame config, performance rules |
| [MOCKUPS.md](docs/MOCKUPS.md) | How the HTML product mockups scale, and every part and screen |
| [CONTENT.md](docs/CONTENT.md) | Voice, the `site.ts` schema, rebranding checklist |
| [QA_CHECKLIST.md](docs/QA_CHECKLIST.md) | What to run and look at before calling a change done |

## Make it yours

| What | Where |
|---|---|
| All page copy: name, headlines, features, quotes, pricing, FAQ | `src/content/site.ts` (`site`) |
| The fictional app shown in every mockup ("Larder") | `src/content/site.ts` (`sampleApp`) |
| Colours, type scale, bezel, marquee | `src/app/globals.css` |
| Fonts | `src/app/layout.tsx` |
| Section order | `src/app/page.tsx` |

The components contain no marketing text. Change `site.ts` and the whole page follows.

## Structure

```
src/
  app/            layout, page, globals.css (design tokens + utilities)
  content/        site.ts — every string on the page
  components/
    ui/           ChromeFrame, PillButton/ArrowLink, Caption, Reveal, Section/Inset
    mockups/      parts.tsx (window chrome, sample-app cards) + screens.tsx (composed screens)
    icons/        MetalIcons.tsx — SVG brushed-steel feature icons
    sections/     one file per page section
```

### Sections (in order)

1. **Header**: wordmark and underlined text links, sticky.
2. **HeroStory**: the only pinned, scroll-scrubbed sequence. The headline fades, the empty frames fill with Canvas/Browser/Agent screens, then they straighten and merge into `AppWindow`. It animates only `transform` and `opacity`. Users with `prefers-reduced-motion` get a static version.
3. **PillarIntro**: "Canvas. Browser. Agent." in grey display type.
4. **FeatureChapters**: one chapter per entry in `site.chapters`, each with a big mockup, demo panels and bold-lead captions. The canvas chapter also has the metal-icon grid.
5. **ContextRow**: four cards with marquee content.
6. **Process**: four giant numerals.
7. **Testimonials**: a bento grid. Placement is set by the `layout` array in the component.
8. **Pricing**, then **FAQ** (native `<details>`, no JS).
9. **Footer**.

## How the mockups scale

Product UIs are built in HTML, not images, so text stays sharp at any size. Each mockup sits inside a `.mockup` container. `.mockup-root` sets its font size in container units (`calc(var(--mk) * 1cqw)`), and every child is sized in `em`. To make a mockup read larger or smaller, pass `scale` to `<MockupRoot>`. That sets `--mk`; 1.35 suits a full-width window.

## Swapping in real assets

- **Screenshots**: replace a screen component's contents with an `<Image>` that fills the frame. `ChromeFrame` doesn't care what's inside.
- **3D icons**: replace `<MetalIcon>` with transparent PNG or WebP renders of the same size (80×80 viewBox).
- **Font**: fonts are self-hosted from npm packages (no Google Fonts requests). Geist stands in for subframe.com's PP Neue Montreal (a licensed font). To switch, load it with `next/font/local` and point `--font-display` at it; the type scale was measured from Neue Montreal, so sizes stay the same.

## Notes

- Next 16 won't prerender a page that reads the clock, so the footer year is a constant in `site.ts`.
- Keep any new scroll effects to `transform` and `opacity`. Large blurred or filtered layers that move on scroll are what made the original page drop frames.
