# QA checklist

Run this before calling any change done. Paste the command output into your summary. Report failures as failures.

## 1. Automated

```bash
bun run typecheck                   # expect: no output, exit 0
bun run build                       # expect: "○ /" listed as (Static)
bun run start &                     # serve on :3001
bun run shots                       # expect: "OK — no runtime errors, no horizontal overflow"
```

- `bun run shots` writes JPEGs to `.shots/` (`desktop-NN.jpg` at 1288×900, `mobile-NN.jpg` at 390×844, `dark-desktop-NN.jpg` / `dark-mobile-NN.jpg` with the dark colour scheme, `reduced-00.jpg` with reduced motion on) and exits 1 on any page error, console error (hydration mismatches included) or horizontal overflow. The reduced-motion pass exists because that path renders a different tree and once hid a hydration error.
- On a new machine, run `bunx playwright install chromium` once first. Playwright is pinned to 1.57.0 in devDependencies.
- To check a deployed URL instead: `BASE_URL=https://… bun run shots`.

If the build fails with "blocking-prerender-current-time", something reads the clock during render. See AGENTS.md, "Gotchas".

## 2. Look at the screenshots

Open the shots for the sections you touched, at **both** sizes. Check:

**Global**
- [ ] One continuous `paper` background, with no section borders or colour bands
- [ ] **Dark** (`dark-*` shots): text is white on `#111111`; mockups switch to the dark app palette while PDF paper stays white (no white text on paper, no dark text on dark surfaces); context-card chips and code are readable; the featured pricing CTA is light with dark text
- [ ] **Theme hotkey:** pressing D flips the scheme instantly, a reload keeps it, and Cmd+D still bookmarks (not intercepted). No hydration warning in the console
- [ ] Every headline ends with a period
- [ ] Captions follow the pattern: ink medium-weight lead, then grey regular-weight text
- [ ] Type is stepped: hero headline 96px at 1288 wide and 48px at 390 (DESIGN.md has the full scale)
- [ ] Nothing touches the screen edge on mobile (16px gutter)
- [ ] The fixed header never hides content you need to read at the top of a section

**Hero** (`desktop-00…05`, `mobile-00…05`)
- [ ] 00: three tilted chrome frames showing their screens below the header, with the headline, subtitle, both CTAs and the "works with" line
- [ ] 01: headline nearly gone, frames starting to drop
- [ ] 02: frames lower in the stage with no large empty band below them, DRAFT / SEND / PROVE labels visible
- [ ] 03: frames converging and fading, merged window appearing
- [ ] 04–05: one merged window, centred, with no leftover frames visible

**Chapters**
- [ ] Main mockups are legible at desktop width
- [ ] Demo panels are evenly rounded, mockups don't overflow, and captions align with the panel edge
- [ ] Six metal icons in the draft chapter, three per row on desktop

**Lower page**
- [ ] Context cards show moving content with faded edges (take a second shot a few seconds later to confirm it moves)
- [ ] Process numerals staggered on desktop, stacked 1–4 on mobile
- [ ] Trust bento has no holes at desktop
- [ ] Pricing: four plans in a 2×2 grid, limits match `packages/core/src/workspace/billing.ts`, CTAs aligned

**MDX pages** (`{,dark-}{desktop,mobile}-{security,privacy,terms}.jpg`)
- [ ] Header, one reading column, footer; headings, lists and links styled by `src/mdx-components.tsx`
- [ ] Privacy and terms show the "Draft, under legal review" panel until reviewed text replaces them
- [ ] Pricing CTAs sit at the same height
- [ ] FAQ hairlines visible, plus icons right-aligned

## 3. Manual, in a real browser

These can't be read off a screenshot:

- [ ] **Smooth scrolling through the hero** with DevTools → Performance → CPU 4× slowdown. There should be no long frames from layout or paint while scrolling. The original site froze here; this must not.
- [ ] **Hero buttons:** clickable at the top of the page; once the headline has faded, clicking where they were does nothing.
- [ ] **Reduced motion** (DevTools → Rendering → "prefers-reduced-motion: reduce", then reload): static hero stack, sections fade in without moving, marquees are still.
- [ ] **Keyboard:** Tab reaches the header links, both hero CTAs, the pricing CTAs and every FAQ item in order, with a visible focus ring. Enter or Space toggles FAQ items.
- [ ] **Anchors:** "Download" in the nav scrolls to `#pricing`.
- [ ] **Zoom 200%:** no overlapping text or horizontal scroll.

## 4. Docs

- [ ] If you changed a section, mockup, token or the hero timing, update the matching file in `docs/` in the same change.
- [ ] If you added a script, command or env var, update AGENTS.md and README.md.
