# Sahihi website

The marketing site for Sahihi: a quiet, product-led landing page (draft, send, prove), with real full-page screenshots of the app and coded demos of its cards, both in light and dark, a scroll-driven hero where three frames merge into one completed envelope, and MDX pages for security, privacy and terms. The layout follows subframe.com's landing page.

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
| [SCREENSHOTS.md](docs/SCREENSHOTS.md) | Screenshots (captured) and coded demos: where each goes, how to re-capture |
| [CONTENT.md](docs/CONTENT.md) | Voice, the `site.ts` schema, rebranding checklist |
| [QA_CHECKLIST.md](docs/QA_CHECKLIST.md) | What to run and look at before calling a change done |

## Where things live

| What | Where |
|---|---|
| All landing-page copy: headlines, chapters, trust facts, plans, FAQ | `src/content/site.ts` (`site`) |
| App screenshots (light + dark) | `src/assets/shots/`, captured by `bun run --filter @sahihi/e2e showcase` |
| Security, privacy and terms | `src/app/(legal)/*/page.mdx`, styled by `src/mdx-components.tsx` |
| Colours, type scale, bezel, marquee | `src/app/globals.css` |
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
    shots/        Shot + shots.ts (the screenshot pairs)
    demos/        coded product demos (parts.tsx, screens.tsx)
    icons/        MetalIcons.tsx — SVG brushed-steel feature icons
    sections/     one file per page section
```

### Sections (in order)

1. **Header**: wordmark and underlined text links (Security, Pricing, Log in), sticky.
2. **HeroStory**: the only pinned, scroll-scrubbed sequence. The headline fades, the Draft/Send/Prove frames straighten and merge into `AppWindow`, a completed envelope. It animates only `transform` and `opacity`. Users with `prefers-reduced-motion` get a static version.
3. **PillarIntro**: "Draft. Send. Prove." in grey display type.
4. **FeatureChapters**: one chapter per entry in `site.chapters` (drafting assistant, send & sign, certificate), each with a big screenshot, demo panels and bold-lead captions. The draft chapter also has the metal-icon grid.
5. **ContextRow**: integrations (API, webhooks, bulk send, embedded signing) as four marquee cards.
6. **Process**: four giant numerals.
7. **Trust**: verifiable product facts in a bento grid.
8. **Pricing** (four plans by monthly envelopes, no prices yet), then **FAQ**.
9. **Footer**.

## Screenshots

Full-page pictures are real screenshots of the app on a seeded, fictional workspace, captured in light and dark by `bun run --filter @sahihi/e2e showcase` (needs `bun run infra:up`). Re-run it after UI changes; never edit the images. The smaller demo panels are coded to match the real cards. See [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md).


## Notes

- Next 16 won't prerender a page that reads the clock, so the footer year is a constant in `site.ts`.
- Keep any new scroll effects to `transform` and `opacity`. Large blurred or filtered layers that move on scroll are what made the original page drop frames.
