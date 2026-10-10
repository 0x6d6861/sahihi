import { describe, expect, test } from "bun:test"
import { applyVariableUpdates, findStarter } from "@sahihi/core"
import { systemPrompt } from "./prompt"

const nda = () => {
  const data = findStarter("mutual-nda")?.build()
  if (!data) throw new Error("missing starter")
  return data
}

const base = {
  versionId: "v1",
  selectedSectionId: null,
  organizationName: "HERI&CO",
  today: "2026-10-09",
}

describe("systemPrompt", () => {
  test("states the rules and lists every blank with its state", () => {
    const data = applyVariableUpdates(
      nda(),
      [
        { key: "governing_law", value: "Kenya" },
        { key: "purpose", value: null },
      ],
      "answer",
    )
    const prompt = systemPrompt({ ...base, data })
    expect(prompt).toContain("Never invent facts")
    expect(prompt).toContain("at most 3 questions")
    expect(prompt).toContain('- governing_law (jurisdiction) "Governing law"')
    expect(prompt).toContain('[filled: "Kenya"]')
    expect(prompt).toMatch(/- purpose .*\[skipped\]/)
    expect(prompt).toMatch(/- term .*\[empty\]/)
    expect(prompt).toContain("continues for {{term}}")
    expect(prompt).not.toContain("# Selected section")
  })

  test("adds the selected section when it exists, and ignores unknown ids", () => {
    const withSection = systemPrompt({ ...base, data: nda(), selectedSectionId: "term" })
    expect(withSection).toContain("# Selected section")
    expect(withSection.split("# Selected section")[1]).toContain("7. Term [id=term]")
    const unknown = systemPrompt({ ...base, data: nda(), selectedSectionId: "nope" })
    expect(unknown).not.toContain("# Selected section")
  })
})
