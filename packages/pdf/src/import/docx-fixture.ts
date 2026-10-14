import { strToU8, zipSync } from "fflate"

/** Test helper: a minimal Word file, the body plus styles and numbering when given. */
export function docx(
  body: string,
  extra: { styles?: string; numbering?: string } = {},
): Uint8Array {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${w}><w:body>${body}</w:body></w:document>`,
    ),
    ...(extra.styles
      ? { "word/styles.xml": strToU8(`<w:styles ${w}>${extra.styles}</w:styles>`) }
      : {}),
    ...(extra.numbering
      ? { "word/numbering.xml": strToU8(`<w:numbering ${w}>${extra.numbering}</w:numbering>`) }
      : {}),
  })
}
