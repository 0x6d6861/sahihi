# Sahihi website

The marketing site for Sahihi: a quiet, product-led landing page (draft, send, prove), with HTML mockups of the real app, a scroll-driven hero where three frames merge into one completed envelope, and MDX pages for security, privacy and terms. The layout follows subframe.com's landing page.

Built with Next.js 16 (App Router), Tailwind CSS v4, Motion and `@next/mdx`, set in Geist. Every route is static.

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

## Where things live

| What | Where |
|---|---|
| All landing-page copy: headlines, chapters, trust facts, plans, FAQ | `src/content/site.ts` (`site`) |
| The sample envelope shown in every mockup | `src/content/site.ts` (`sample`) |
| Security, privacy and terms | `src/app/(legal)/*/page.mdx`, styled by `src/mdx-components.tsx` |
| Colours, type scale, bezel, mockup palette, marquee | `src/app/globals.css` |
| Fonts | `src/app/layout.tsx` |
| Section order | `src/app/page.tsx` |
| Social card, icon, robots, sitemap | `src/app/opengraph-image.tsx`, `icon.svg`, `robots.ts`, `sitemap.ts` |

Before launch: set `site.url`, `site.appUrl` and `site.contact`, and replace the privacy and terms drafts (docs/CONTENT.md, "Before launch").

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

1. **Header**: wordmark and underlined text links (Security, Pricing, Log in), sticky.
2. **HeroStory**: the only pinned, scroll-scrubbed sequence. The headline fades, the Draft/Send/Prove frames straighten and merge into `AppWindow`, a completed envelope. It animates only `transform` and `opacity`. Users with `prefers-reduced-motion` get a static version.
3. **PillarIntro**: "Draft. Send. Prove." in grey display type.
4. **FeatureChapters**: one chapter per entry in `site.chapters` (drafting assistant, send & sign, certificate), each with a big mockup, demo panels and bold-lead captions. The draft chapter also has the metal-icon grid.
5. **ContextRow**: integrations (API, webhooks, bulk send, embedded signing) as four marquee cards.
6. **Process**: four giant numerals.
7. **Trust**: verifiable product facts in a bento grid.
8. **Pricing** (four plans by monthly envelopes, no prices yet), then **FAQ**.
9. **Footer**.

## How the mockups scale

Product UIs are built in HTML, not images, so text stays sharp at any size and follows the theme. Each mockup sits inside a `.mockup` container. `.mockup-root` sets its font size in container units (`calc(var(--mk) * 1cqw)`), and every child is sized in `em`. To make a mockup read larger or smaller, pass `scale` to `<MockupRoot>`. That sets `--mk`; 1.35 suits a full-width window.

## Swapping in real assets

- **Screenshots**: replace a screen component's contents with an `<Image>` that fills the frame. `ChromeFrame` doesn't care what's inside.
- **3D icons**: replace `<MetalIcon>` with transparent PNG or WebP renders of the same size (80×80 viewBox).
- **Font**: fonts are self-hosted from npm packages (no Google Fonts requests). Geist stands in for subframe.com's PP Neue Montreal (a licensed font). To switch, load it with `next/font/local` and point `--font-display` at it; the type scale was measured from Neue Montreal, so sizes stay the same.

## Notes

- Next 16 won't prerender a page that reads the clock, so the footer year is a constant in `site.ts`.
- Keep any new scroll effects to `transform` and `opacity`. Large blurred or filtered layers that move on scroll are what made the original page drop frames.
