import { type DocContent, numberSections, type Section } from "@sahihi/core"

/** "3. Confidential Information": how a section is named in the chip and the document. */
export function sectionLabel(content: DocContent, section: Section): string {
  const n = numberSections(content).get(section.attrs.id)
  return `${n ? `${n}. ` : ""}${section.attrs.title}`
}
