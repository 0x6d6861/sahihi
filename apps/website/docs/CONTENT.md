# Content guide

All copy lives in `src/content/site.ts`. Components contain no marketing text. To rebrand the page for a real product, you edit this one file, plus `sampleApp` if the mockups should show a different example app.

## Voice

- **Short, confident, a little warm.** Write the way a careful maker talks about their tool.
- **Headlines end with a period** ("Pricing." too). Two-line headlines are stored as `[line1, line2]` and broken by hand.
- **No exclamation marks, no buzzwords** ("revolutionary", "seamless", "supercharge", "AI-powered"), and no emoji.
- **Captions follow the pattern "Lead phrase. Supporting sentence."** The lead is 1–3 words and ends with a period. The supporting sentence is under about 15 words.
- **Numbers and specifics beat adjectives.** "6× AI credits" beats "loads more credits".
- **Use British or American spelling, but only one.** The placeholder copy is British ("colour", "behaviour").

## Schema: `site`

| Key | Shape | Used by |
|---|---|---|
| `name` | string | Header wordmark, footer, metadata |
| `title`, `description` | string | `<title>` and meta description (`layout.tsx`) |
| `nav` | `{label, href}[]` | Header links |
| `cta.primary`, `cta.secondary` | `{label, href}` | Hero (both), pillar intro (primary) |
| `hero.headline` | `[string, string]` | Hero h1, two lines |
| `hero.subtitle` | `[string, string]` | Hero subtitle, two lines (joined on mobile) |
| `hero.worksWith` | string | Small line under the hero CTAs |
| `pillars` | `string[3]` | Hero frame labels, pillar intro stack. **Order must match the hero `frames`** |
| `pillarIntro` | string | Paragraph under the pillar stack |
| `chapters[]` | see below | Feature chapters, in order |
| `context` | `{headline, cards: {lead, text}[4]}` | Context row. Card order maps to selection, designs, browser, codebase |
| `process` | `{headline: [2], steps: {title, lines[3]}[4]}` | Process |
| `testimonials` | `{headline, quotes: {text}[≤5]}` | Testimonials. Placement comes from `layout` in the component |
| `pricing` | `{headline, plans: {name, price, unit, features[], cta, featured}[2], footnote}` | Pricing |
| `faq` | `{headline, items: {q, a}[]}` | FAQ |
| `footer` | `{year: number, links: {label, href}[]}` | Footer. `year` is a constant (see AGENTS.md gotchas) |

### `chapters[]`

```ts
{
  id: "canvas" | "browser" | "agent",   // anchor id + selects the main mockup in FeatureChapters
  eyebrow: string,
  headline: [string, string],
  body: string,
  demos: { kind: DemoKind, lead: string, text: string, wide?: boolean }[],
  features?: { icon: "compass"|"ruler"|"knob"|"puck"|"loupe"|"slider", lead: string, text: string }[], // canvas chapter
}
```

The `DemoKind` values are listed in PAGE_SPEC.md §4. A new `id` also needs an entry in `mainMockup` in `FeatureChapters.tsx`.

## Schema: `sampleApp`

```ts
{
  name: "Larder",                 // app name in the mockups' logo
  heading: "Cooked.",             // big page heading in the mockups
  meta: "38 recipes · 12 cooks",
  categories: { name, color }[3], // dot colours + filter chips
  items: { title, category, date, photo: [plate, rim, table] }[6],
}
```

- `item.category` must match a `categories[].name`.
- `photo` is three hex colours drawn as a plate on a table. Pick a saturated plate, a contrasting rim and a darker table. Vary the tables between items so a row of cards doesn't look flat.
- Titles follow the caption voice: "Thing. Two sensory details."
- To change the domain (say, a furniture catalogue instead of recipes), replace `sampleApp` wholesale. Nothing else needs to change, apart from a few mockup strings that mention recipes (`grep -n "recipe" src/components/mockups`).

## Rebranding checklist

1. In `site.ts`, rewrite every string. Search for "Atelier" and placeholder names ("Mara", "Theo").
2. Update `pillars` (and the hero `frames` screens if the three pillars change meaning).
3. Update `sampleApp` if the example app should change.
4. Replace the favicon at `src/app/favicon.ico`.
5. Point CTA hrefs at real URLs. `#pricing` is the only in-page anchor they use today.
6. Make the testimonial quotes real, or remove the section from `page.tsx`. **Do not ship invented quotes as if they were real customers.**
7. Run QA_CHECKLIST.md.
