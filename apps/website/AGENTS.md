<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent guide: Sahihi website

The fully static marketing site for Sahihi, the e-signature product in this monorepo: a landing page plus MDX developer, security, privacy and terms pages. It is quiet, near-monochrome and product-led, modelled on the layout of subframe.com, with coded recreations of the Sahihi app (no screenshots). Read this file first, then the doc for the area you are changing.

**The site follows the product.** When a feature in the app is added, changed or removed, the matching copy, coded screen, pricing, `/developers` or `/security` content changes with it, in the same piece of work. The map from kind of change to place on the site is in the root `AGENTS.md` → "Keep the website in step".

## Docs map

| Read this | When you are… |
|---|---|
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | building the page from scratch, or picking up the next task |
| [docs/DESIGN.md](docs/DESIGN.md) | touching colour, type, spacing, buttons, panels, the chrome bezel or icons |
| [docs/PAGE_SPEC.md](docs/PAGE_SPEC.md) | adding, changing or reordering a section |
| [docs/HERO_ANIMATION.md](docs/HERO_ANIMATION.md) | touching the pinned scroll sequence at the top |
| [docs/PRODUCT_UI.md](docs/PRODUCT_UI.md) | changing or adding a coded app screen or demo |
| [docs/CONTENT.md](docs/CONTENT.md) | changing copy, or swapping the placeholder product for a real one |
| [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md) | before you say a change is done |

## Skills

Design skills live in `.agents/skills/` (symlinked into `.claude/skills/`; edit the `.agents` copy).

| Skill | Use it when… |
|---|---|
| `emil-design-eng` | polishing a component or deciding whether, and how, something should animate |
| `apple-design` | working on springs, interruptible motion, depth and materials, type tracking and leading |
| `find-animation-opportunities` | asked "what could animate here?". It is read-only and only proposes |
| `review-animations` | reviewing a diff that adds or changes motion |
| `improve-animations` | auditing the page's existing motion and writing fix plans. It is read-only and only plans |

They are general-purpose, and **the Rules below override them**. In particular:

- **Animate only `transform` and `opacity`**, whatever the skill says. That rules out blur-masked crossfades (`filter: blur`), "materialize" blur-ins, `clip-path` reveals and height+opacity accordions. Use `scaleY` instead of height. The header's static `backdrop-blur-md` is the one allowed `backdrop-filter`. It is never animated.
- Import from `motion/react`, not `framer-motion`, and use `useSafeReducedMotion()`, not `useReducedMotion()`.
- Don't add a second pinned or scroll-scrubbed sequence. Anything new is a `<Reveal>` or a CSS transition.
- When a review or audit skill flags one of the above as missing polish, it isn't a finding here.

## Stack

- **Next.js 16** (App Router) with `cacheComponents: true`. See "Gotchas" below.
- **Tailwind CSS v4**. Tokens live in `@theme` in `src/app/globals.css`. There is no `tailwind.config.js`.
- **Motion v14**: import from `motion/react`, not `framer-motion`.
- **TypeScript**, strict. **bun** is the package manager.
- Fonts are **self-hosted** with `next/font/local`, from the `geist` and `@fontsource-variable/inter` npm packages: Geist for display, Inter for the coded app UI (the app's face), Geist Mono for labels.

## Commands

This app lives in the Sahihi monorepo (`apps/website`, package `@sahihi/website`). Install from the repo root (one `bun.lock` there); run the scripts below from this folder, or from the root with `bun run dev:website` / `bun run --filter @sahihi/website <script>`. It must stay self-contained: no `@sahihi/*` imports.

```bash
bun install          # at the repo root
bun run dev          # http://localhost:3001
bun run typecheck    # next typegen + tsc --noEmit — must pass
bun run build        # must pass; the page must stay "○ (Static)"
bun run start        # serve the build
bun run shots        # screenshots + error/overflow check against :3001 (see QA_CHECKLIST)
```

There is no test runner. Biome (root `biome.json`, run `bun run lint` at the root) lints and formats this app too, so code follows the repo style: double quotes, no semicolons, 100 columns. Lint, `typecheck`, `build` and `shots` are the whole gate. `shots` needs a server already running (`bun run build && bun run start &`); first run on a new machine needs `bunx playwright install chromium`. It writes `.shots/{desktop,mobile}-NN.jpg`, the same in dark mode as `dark-{desktop,mobile}-NN.jpg`, plus `reduced-00.jpg` (reduced motion) and one full-page shot per MDX page and pass (`desktop-security.jpg`, …), exits 1 on any page/console error, hydration mismatch or horizontal overflow, and takes `BASE_URL` / `OUT_DIR` env overrides.

## Layout of the code

```
src/
  app/            layout.tsx (fonts, metadata) · page.tsx (section order) · globals.css (tokens, utilities)
                  opengraph-image.tsx · icon.svg · robots.ts · sitemap.ts
  app/(pages)/    developers, security, privacy, terms as page.mdx · layout.tsx (header, reading column, footer)
  mdx-components.tsx  the only place MDX prose is styled
  content/site.ts every landing-page string (`site`) + `sample`, the data the app UI shows
  components/
    ui/           ChromeFrame · PillButton/ArrowLink · Caption · Reveal · Section/Inset
    demos/        pages.tsx (full app screens) · screens.tsx (card demos) · parts.tsx
    icons/        MetalIcons.tsx (SVG brushed-steel icons + shared <defs>)
    sections/     one file per page section, in page order
scripts/          screenshots.mjs (visual QA)
docs/             the specs listed above
```

## Rules

1. **No copy in components.** Every visible landing-page string comes from `src/content/site.ts`; long-form pages are `.mdx` content. Demos and marquee cards may hard-code UI chrome text (button labels, endpoints), but example data comes from `sample`. **Every claim must be true of the product today** (CONTENT.md, "Claims").
2. **Use the tokens.** Colours come from the tokens, which also carry dark mode (see DESIGN.md): `bg-paper`, `text-ink`, `text-muted`, `text-faint`, `text-ghost`, `bg-panel`, `bg-pill` and the rest; text colours are black at fixed opacities (white in dark mode). Type comes from the stepped scale in DESIGN.md (`text-display`, `text-headline`, `text-title`, `text-lede`, `text-sub`, `text-caption` and the others). **Weight:** ink text is 500 (the `body` default); grey text adds `font-normal`. The coded app UI is the exception: it uses the `--dm-*` palette copied from the app (PRODUCT_UI.md).
3. **Sections are separated by space, never by borders or background changes.** The whole page is one `paper` surface (`#f9f9f9`, `#111111` in dark mode).
4. **Animate only `transform` and `opacity`.** No scroll-linked `filter`, `blur`, `box-shadow`, width or height. The original page froze the browser renderer, and this is the rule that prevents that.
5. **There is exactly one pinned, scroll-scrubbed sequence (the hero).** Everything else uses `<Reveal>`, a one-shot fade-and-rise, or `<Settle>`, the one-shot settle inside product pictures.
6. **Every animation respects `prefers-reduced-motion`.** `Reveal` and `HeroStory` already branch on `useSafeReducedMotion()` (in `components/ui/`). **Never call Motion's `useReducedMotion()` directly to choose what to render**: it reads the setting on the client's first render, the server can't, and the mismatch is a hydration error. CSS animations are disabled in the `@media (prefers-reduced-motion)` block in `globals.css`.
7. **The product is shown in code, sized in `em`.** Full screens and card demos live in `components/demos` and copy the real app; match them against the showcase captures (`bun run --filter @sahihi/e2e showcase`). No screenshots or `px`/`rem` inside them. See PRODUCT_UI.md.
8. **Server components by default.** Add `"use client"` only where a hook needs it. Today that is `Reveal.tsx`, `Settle.tsx`, `HeroStory.tsx`, `FaqList.tsx` and `ThemeHotkey.tsx`. Helpers that server components call live in plain modules (`settleMarks.ts`), never in a `"use client"` file, and their names must not differ from a component file only by case (macOS file names are case-insensitive).
9. **Mobile matters.** The page needs a 16px side gutter (`px-4`) and no horizontal scroll at 390px. `body` has `overflow-x-clip` as a safety net, not as a fix.
10. **Match the surrounding code.** Comments are sparse and explain *why*.

## Gotchas

- **Dark mode is `<html data-theme>`, not a media query.** An inline script in `layout.tsx` (`themeScript.ts`) sets it before first paint from the saved choice or the system setting, so `<html>` has `suppressHydrationWarning`. Style dark with the tokens or `dark:` (a custom variant on `data-theme`); never `@media (prefers-color-scheme)` in new CSS, or the D hotkey won't reach it. `themeScript` lives outside `ThemeHotkey.tsx` because exports of a `"use client"` file reach server components as client references, not values.

- **No clock reads during render.** With `cacheComponents: true`, prerender fails on `new Date()`, `Date.now()` or `Math.random()` in a server component ("blocking-prerender-current-time"). Keep values like the footer year as constants in `site.ts`.
- **Tailwind v4 `translate-*`/`rotate-*` use the separate CSS `translate`/`rotate` properties**, so they compose with Motion's `transform`. Centring a Motion element with `-translate-x-1/2` is safe.
- **Invisible elements still take clicks.** Any layer faded to `opacity: 0` that sits over interactive content needs `pointer-events-none`, or a Motion-driven `pointerEvents`, as the hero copy has.
- **`.frame` (ChromeFrame) and `.demo` set `container-type: inline-size`** (`Screen` a size container). Their size comes from their parent, so it must have a definite width.
- **Don't use `next/font/google`.** Google sometimes returns font URLs with extra query parameters (`/l/font?kit=…&skey=…`), and Turbopack's dev server then fails with "Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'". It depends on Google's response, so it can work in one build and fail in the next. Add new fonts as npm packages or files and load them with `next/font/local`.
- **The build cache can serve stale CSS.** A `globals.css` edit once built cleanly but shipped the old values. If a CSS change doesn't show up, `rm -rf .next && bun run build` before debugging anything else.
- **Feature icons depend on `<MetalDefs />`**, which `FeatureChapters` renders once. If you use `<MetalIcon>` somewhere else, the defs must be on the page.

## Definition of done

`bun run typecheck` and `bun run build` pass, and `bun run shots` reports no problems. You have looked at the screenshots for the sections you touched, at both desktop and mobile widths, **in both light and dark mode** (`dark-*` shots). This applies to every UI creation or update. If you changed the structure, update the matching doc in `docs/` in the same change.
