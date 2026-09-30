# 0009: Unicode fonts via Noto Sans, without text shaping

- **Status:** accepted
- **Date:** 2026-09-28

## Context
Stamped text fields and certificates used pdf-lib's Helvetica, which only encodes WinAnsi. Names
like "Ngũgĩ", "Łukasz" or "Анна" became "?". Signers and senders in our market type Latin with
diacritics, and sometimes Greek, Cyrillic, Arabic or Indic scripts.

pdf-lib can embed TrueType fonts through `@pdf-lib/fontkit`, but it draws glyphs one by one. It does
no shaping (contextual Arabic forms, Indic conjuncts and reordering) and no bidi layout. Embedding a
full font per PDF costs about 600 KB, so subsetting is needed, and fontkit's subsetter corrupts fonts
whose glyphs aren't padded to even offsets. Noto's static TTFs are such fonts.

## Decision
- Embed **Noto Sans** Regular and Bold (OFL), subset, for stamping and certificates. It covers
  Latin with all extensions, Greek and Cyrillic.
- Replace with "?" any character that has no glyph, or whose script needs shaping or RTL layout
  (`needsShaping`). A visibly replaced character is better than a mis-shaped word in a signed
  legal document. The exact value stays in `Field.value` and the audit trail.
- Fix the fonts at load time with `padGlyphs`, rather than committing pre-processed TTFs. It keeps
  the upstream files byte-identical and works for any font we add later.

## Consequences
- Stamped PDFs grow by a few KB, and the text is searchable (ToUnicode).
- Arabic, Hebrew, Indic, Thai and CJK text still stamps as "?". Supporting them needs a shaping
  engine (harfbuzz, via WASM) plus per-script Noto fonts. That's a separate roadmap item, and it
  would replace `needsShaping` with real shaping.
- `ttf.test.ts` inspects the embedded subset's glyph outlines. Any font swap or fontkit upgrade that
  breaks subsetting fails the tests, instead of producing blank text.
