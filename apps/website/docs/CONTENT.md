# Content guide

All landing-page copy lives in `src/content/site.ts`; components contain no marketing text. Long-form pages (security, privacy, terms) are Markdown in `src/app/(legal)/*/page.mdx`. Screenshot alt text is `site.shots`; the coded demos read their example data from `sample` in the same file.

## Voice

- **Short, confident, a little warm.** Write the way a careful maker talks about their tool.
- **Headlines end with a period** ("Pricing." too). Two-line headlines are stored as `[line1, line2]` and broken by hand.
- **No exclamation marks, no buzzwords** ("revolutionary", "seamless", "supercharge", "AI-powered"), and no emoji.
- **Captions follow the pattern "Lead phrase. Supporting sentence."** The lead is 1–3 words and ends with a period. The supporting sentence is under about 15 words.
- **Numbers and specifics beat adjectives.** "6× AI credits" beats "loads more credits".
- **Use British or American spelling, but only one.** The copy is British ("colour", "finalise", "organisation"), as Kenyan English is.

## Schema: `site`

| Key | Shape | Used by |
|---|---|---|
| `name` | string | Header wordmark, footer, metadata, social card |
| `url` | string | This site's origin: `metadataBase`, sitemap, robots. **Placeholder until launch** |
| `appUrl` | string | The web app's origin; every sign-up, log-in and verify link is built from it. **Placeholder until launch** |
| `contact` | `mailto:` string | "Talk to us" CTAs |
| `title`, `description` | string | `<title>`, meta description, Open Graph (`layout.tsx`) |
| `nav` | `{label, href}[]` | Header links. Use absolute paths (`/#pricing`, `/security`) so they work from the MDX pages |
| `cta.primary`, `cta.secondary` | `{label, href}` | Hero (both), pillar intro (primary) |
| `hero.headline` | `[string, string]` | Hero h1, two lines; also the social card |
| `hero.subtitle` | `[string, string]` | Hero subtitle, two lines (joined on mobile) |
| `hero.worksWith` | string | Small line under the hero CTAs |
| `pillars` | `string[3]` | Hero frame labels, pillar intro stack, social card. **Order must match the hero `frames`** |
| `pillarIntro` | string | Paragraph under the pillar stack |
| `chapters[]` | see below | Feature chapters, in order |
| `context` | `{headline, cards: {lead, text}[4], csv: string[]}` | Integrations row. Card order maps to API, webhooks, bulk send, embedded signing |
| `process` | `{headline: [2], steps: {title, lines[3]}[4]}` | Process |
| `trust` | `{headline, facts: {text}[≤5]}` | Trust bento. Every fact must be true today; shortest facts first and last (narrow slots) |
| `pricing` | `{headline, plans: {name, price, unit, features[], cta, href, featured}[4], footnote}` | Pricing. `price` holds envelopes per month; limits mirror `packages/core/src/workspace/billing.ts` |
| `faq` | `{headline, items: {q, a}[]}` | FAQ |
| `shots` | `{[shot]: string}` | Alt text of each app screenshot |
| `footer` | `{year: number, links: {label, href}[]}` | Footer. `year` is a constant (see AGENTS.md gotchas) |

### `chapters[]`

```ts
{
  id: "draft" | "send" | "prove",       // anchor id + selects the main screenshot in FeatureChapters
  eyebrow: string,
  headline: [string, string],          // keep each line short: text-headline is 88px in an 860px column
  body: string,
  demos: { kind: DemoKind, lead: string, text: string, wide?: boolean }[],
  features?: { icon: "quill"|"brackets"|"tray"|"stack"|"padlock"|"clip", lead: string, text: string }[], // draft chapter
}
```

The `DemoKind` values are listed in PAGE_SPEC.md §4. A new `id` also needs an entry in `mainShot` in `FeatureChapters.tsx`.

## Schema: `sample`

The demos' data: the same fictional workspace as the screenshots (Tana Freight Ltd, Kilima Agro, the offer to Juma Ochieng). Keys: `workspace`, `nda`, `ndaFile`, `completed`, `question {index, text, fills, options}`, `proposal {section, why, title, before, removed, kept, inserted, after}`, `signer`, `offer`, `otp`, `routing[]`, `signers[]` (masked emails, as the verify page shows them), `originalSha256`, `signedSha256`, `activity[]` (newest first, `kind` picks the icon). Keep it consistent with the screenshots and the seed.

## Screenshot data

The app screenshots show the showcase workspace (apps/e2e/showcase/seed.ts): Tana Freight Ltd and the people it deals with, all fictional. To change what the screenshots show (names, blanks, messages), edit the seed and re-run the showcase (SCREENSHOTS.md). Keep it believable and consistent: Kenyan names and companies, real-looking addresses, plausible amounts and dates around the capture date.

## Claims

The site sells a product people rely on for evidence, so every claim must be true of the product **today**:

- Check product facts against `docs/` at the repo root (security, certificates, signing flow, billing, data retention) before writing them.
- Say "on the way" for roadmap items (the CA-backed PAdES signature), never present tense.
- Legal statements (validity of electronic signatures, data-protection duties) need legal review before launch. The FAQ answer on legal validity and the privacy and terms pages are drafts.
- No invented testimonials, customer logos or numbers.

## Before launch

1. Set `site.url`, `site.appUrl` and `site.contact` to the real domains and inbox.
2. Replace the privacy and terms drafts with reviewed text and remove the "Draft" notice.
3. Have the FAQ legal answer reviewed.
4. Run QA_CHECKLIST.md.
