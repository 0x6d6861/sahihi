/**
 * Just enough XML to read a Word file's parts: a flat stream of open tags, close tags and text, in
 * order. OOXML is machine-written and well formed; there's no DTD, CDATA or processing to support
 * beyond skipping declarations and comments.
 */

export type XmlEvent =
  | { kind: "open"; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { kind: "close"; name: string }
  | { kind: "text"; text: string }

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export function* xmlEvents(xml: string): Generator<XmlEvent> {
  for (const m of xml.matchAll(TOKEN)) {
    const [, cdata, closing, name, attrText, selfClosing, text] = m
    if (cdata !== undefined) yield { kind: "text", text: cdata }
    else if (name) {
      if (closing) yield { kind: "close", name }
      else {
        const attrs: Record<string, string> = {}
        for (const a of (attrText ?? "").matchAll(ATTR)) {
          attrs[a[1] as string] = decode(a[2] ?? a[3] ?? "")
        }
        yield { kind: "open", name, attrs, selfClosing: selfClosing === "/" }
        if (selfClosing === "/") yield { kind: "close", name }
      }
    } else if (text !== undefined) yield { kind: "text", text: decode(text) }
  }
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }

export function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code =
        ref[1] === "x" || ref[1] === "X" ? Number.parseInt(ref.slice(2), 16) : Number(ref.slice(1))
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""
    }
    return ENTITIES[ref.toLowerCase()] ?? whole
  })
}
