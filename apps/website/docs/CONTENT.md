# Content guide

All landing-page copy lives in `src/content/site.ts`; components contain no marketing text. Long-form pages (security, privacy, terms) are Markdown in `src/app/(legal)/*/page.mdx`. The mockups' example data is `sample` in the same `site.ts`.

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
| `context` | `{headline, cards: {lead, text}[4]}` | Integrations row. Card order maps to API, webhooks, bulk send, embedded signing |
| `process` | `{headline: [2], steps: {title, lines[3]}[4]}` | Process |
| `trust` | `{headline, facts: {text}[≤5]}` | Trust bento. Every fact must be true today; shortest facts first and last (narrow slots) |
| `pricing` | `{headline, plans: {name, price, unit, features[], cta, href, featured}[4], footnote}` | Pricing. `price` holds envelopes per month; limits mirror `packages/core/src/workspace/billing.ts` |
| `faq` | `{headline, items: {q, a}[]}` | FAQ |
| `footer` | `{year: number, links: {label, href}[]}` | Footer. `year` is a constant (see AGENTS.md gotchas) |

### `chapters[]`

```ts
{
  id: "draft" | "send" | "prove",       // anchor id + selects the main mockup in FeatureChapters
  eyebrow: string,
  headline: [string, string],          // keep each line short: text-headline is 88px in an 860px column
  body: string,
  demos: { kind: DemoKind, lead: string, text: string, wide?: boolean }[],
  features?: { icon: "quill"|"brackets"|"tray"|"stack"|"padlock"|"clip", lead: string, text: string }[], // draft chapter
}
```

The `DemoKind` values are listed in PAGE_SPEC.md §4. A new `id` also needs an entry in `mainMockup` in `FeatureChapters.tsx`.

## Schema: `sample`

The fictional envelope every mockup shows (fictional people and companies):

```ts
{
  workspace, title, file, pages,
  parties: [string, string],            // the two companies in the NDA
  recipients: { name, email, role, status, tone, verify, signedAt, ip }[3], // tone = recipient colour 0–2
  sections: string[5],                  // numbered section titles of the drafted NDA
  blanks: { effectiveDate, term, purpose, law },
  code,                                 // certificate code, unambiguous alphabet
  originalSha256, signedSha256, chainHead,
  events: { time, event, actor }[],     // audit trail, oldest first
}
```

Keep it consistent with the product: a "Gets a copy" recipient never signs, a completed envelope has every signer `Signed`, codes avoid 0/O/1/I.

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
