import { describe, expect, test } from "bun:test"
import { documentFields, structureIssues } from "./document"
import { GeneratedDocumentDataSchema } from "./model"
import { generationPreflight } from "./preflight"
import { applyProposal, buildProposal, isProposalStale, proposalTexts } from "./proposals"
import { applySigners, currentSigners, SignersError, signersText } from "./signers"
import { findStarter } from "./starters"

const nda = () => {
  const data = findStarter("mutual-nda")?.build()
  if (!data) throw new Error("missing starter")
  return data
}
let n = 0
const newId = () => `id_${++n}`

describe("currentSigners", () => {
  test("reads roles and each role's fields from the signature blocks", () => {
    const def = currentSigners(nda())
    expect(def.roles.map((r) => r.key)).toEqual(["party_a", "party_b"])
    expect(def.fields.party_a?.map((f) => f.fieldType)).toEqual([
      "SIGNATURE",
      "NAME",
      "DATE_SIGNED",
    ])
    expect(def.fields.party_a?.[0]?.id).toBe("party_a_signature")
  })

  test("reads the party each signer signs for from its block's caption", () => {
    expect(currentSigners(nda()).parties).toEqual({
      party_a: "party_a_name",
      party_b: "party_b_name",
    })
  })

  test("applying the current definition changes nothing", () => {
    const data = nda()
    expect(applySigners(data, currentSigners(data), newId)).toEqual(data)
  })
})

describe("applySigners", () => {
  test("changes a role's fields in place, keeping its caption and existing field ids", () => {
    const def = currentSigners(nda())
    def.fields.party_a = [
      { id: "party_a_signature", fieldType: "SIGNATURE", required: true },
      { fieldType: "CHECKBOX", label: "I agree to the terms", required: true },
      { fieldType: "TEXT", label: "Job title", required: false },
    ]
    const next = applySigners(nda(), def, newId)
    const a = documentFields(next.content).filter((f) => f.roleKey === "party_a")
    expect(a.map((f) => [f.field.fieldType, f.field.label ?? null])).toEqual([
      ["SIGNATURE", null],
      ["CHECKBOX", "I agree to the terms"],
      ["TEXT", "Job title"],
    ])
    expect(a[0]?.field.id).toBe("party_a_signature")
    const block = next.content.content
      .flatMap((s) => s.content)
      .find((b) => b.type === "signatureBlock" && b.attrs.roleKey === "party_a")
    expect(block?.type === "signatureBlock" && block.content[0]?.type).toBe("paragraph")
    expect(structureIssues(next)).toEqual([])
  })

  test("a new signer gets a block in the signatures section; a removed one loses its block", () => {
    const def = currentSigners(nda())
    def.roles = [
      def.roles[0] as (typeof def.roles)[number],
      {
        key: "witness",
        label: "Witness",
        recipientRole: "SIGNER",
        name: null,
        email: null,
        initialsOnEveryPage: true,
      },
      {
        key: "legal",
        label: "Legal team",
        recipientRole: "VIEWER",
        name: null,
        email: null,
        initialsOnEveryPage: false,
      },
    ]
    def.fields = {
      party_a: def.fields.party_a ?? [],
      witness: [{ fieldType: "SIGNATURE", required: true }],
    }
    const next = GeneratedDocumentDataSchema.parse(applySigners(nda(), def, newId))
    const signatures = next.content.content.find((s) => s.attrs.id === "signatures")
    const blocks = signatures?.content.filter((b) => b.type === "signatureBlock") ?? []
    expect(blocks.map((b) => b.type === "signatureBlock" && b.attrs.roleKey)).toEqual([
      "party_a",
      "witness",
    ])
    expect(next.roles.find((r) => r.key === "witness")?.initialsOnEveryPage).toBe(true)
    expect(structureIssues(next)).toEqual([])
    // The NDA's text still names the second party: removing a role doesn't touch wording.
    expect(generationPreflight(next).some((i) => i.code === "missing_signature_field")).toBe(false)
  })

  test("without any signature section, new blocks go to a new Signatures section", () => {
    const data = nda()
    data.content.content = data.content.content.filter((s) => s.attrs.id !== "signatures")
    const def = currentSigners(data)
    def.fields.party_a = [{ fieldType: "SIGNATURE", required: true }]
    const next = applySigners(data, def, newId)
    expect(next.content.content.at(-1)?.attrs.title).toBe("Signatures")
  })

  test("refuses fields for viewers or unknown roles, and duplicate keys", () => {
    const def = currentSigners(nda())
    const viewer = structuredClone(def)
    const first = viewer.roles[0]
    if (first) first.recipientRole = "VIEWER"
    expect(() => applySigners(nda(), viewer, newId)).toThrow(SignersError)

    const unknown = structuredClone(def)
    unknown.fields.ghost = [{ fieldType: "SIGNATURE", required: true }]
    expect(() => applySigners(nda(), unknown, newId)).toThrow("unknown signer")

    const dup = structuredClone(def)
    dup.roles.push({ ...(dup.roles[0] as (typeof dup.roles)[number]) })
    expect(() => applySigners(nda(), dup, newId)).toThrow("Two signers")
  })

  test("initials on every page are for signers only", () => {
    const def = currentSigners(nda())
    def.roles = def.roles.map((r) => ({ ...r, recipientRole: "VIEWER", initialsOnEveryPage: true }))
    def.fields = {}
    const next = applySigners(nda(), def, newId)
    expect(next.roles.every((r) => !r.initialsOnEveryPage)).toBe(true)
  })

  test("signersText summarises who signs what", () => {
    const def = currentSigners(nda())
    expect(signersText(def)).toBe(
      'First party (signs): signature "Signature", full name "Name", date signed "Date"\n' +
        'Second party (signs): signature "Signature", full name "Name", date signed "Date"',
    )
  })
})

describe("define_signers proposals", () => {
  const input = {
    tool: "define_signers" as const,
    roles: [
      {
        key: "party_a",
        label: "Discloser",
        recipientRole: "SIGNER" as const,
        initialsOnEveryPage: true,
      },
      {
        key: "party_b",
        label: "Recipient",
        recipientRole: "SIGNER" as const,
        initialsOnEveryPage: false,
      },
    ],
    fields: {
      party_a: [{ fieldType: "SIGNATURE" as const, required: true }],
      party_b: [
        { fieldType: "SIGNATURE" as const, required: true },
        { fieldType: "DATE_SIGNED" as const, required: true },
      ],
    },
    rationale: "Clearer labels",
  }

  test("keeps existing contacts when none are given; applies as a definition", () => {
    const data = nda()
    data.roles = data.roles.map((r) => ({ ...r, name: "Amina", email: "amina@example.com" }))
    const result = buildProposal(input, data, [], newId)
    if (!result.ok) throw new Error(result.error)
    const next = applyProposal(data, result.payload, newId)
    expect(next.roles.map((r) => [r.label, r.name, r.initialsOnEveryPage])).toEqual([
      ["Discloser", "Amina", true],
      ["Recipient", "Amina", false],
    ])
    expect(proposalTexts(result.payload, data).after).toContain(
      "Discloser (signs, initials every page)",
    )
  })

  test("refuses contacts the person never gave", () => {
    const result = buildProposal(
      {
        ...input,
        roles: [
          { ...input.roles[0], name: "Peter Kamau", email: "heri@powwater.com" },
          input.roles[1],
        ],
      } as typeof input,
      nda(),
      ["The other party is Peter Kamau"],
      newId,
    )
    expect(result.ok ? "" : result.error).toContain('"heri@powwater.com"')
    expect(result.ok ? "" : result.error).not.toContain("Peter Kamau")
  })

  test("a party's answered name may be a signer's name", () => {
    const data = nda()
    const b = data.variables.find((v) => v.key === "party_b_name")
    if (b) b.value = "Jane Doe"
    const result = buildProposal(
      {
        ...input,
        roles: [input.roles[0], { ...input.roles[1], name: "Jane Doe" }],
      } as typeof input,
      data,
      [],
      newId,
    )
    if (!result.ok) throw new Error(result.error)
    expect(applyProposal(data, result.payload, newId).roles[1]?.name).toBe("Jane Doe")
  })

  test("a new signer can sign for a party; existing links are kept", () => {
    const data = nda()
    data.variables.push({
      key: "party_c_name",
      label: "Third party's name",
      type: "text",
      value: null,
      status: "unresolved",
      party: true,
    })
    const result = buildProposal(
      {
        ...input,
        roles: [
          ...input.roles,
          {
            key: "party_c",
            label: "Third party",
            recipientRole: "SIGNER" as const,
            initialsOnEveryPage: false,
            party: "party_c_name",
          },
        ],
        fields: { ...input.fields, party_c: [{ fieldType: "SIGNATURE" as const, required: true }] },
      },
      data,
      [],
      newId,
    )
    if (!result.ok) throw new Error(result.error)
    expect(currentSigners(applyProposal(data, result.payload, newId)).parties).toEqual({
      party_a: "party_a_name",
      party_b: "party_b_name",
      party_c: "party_c_name",
    })
  })

  test("refuses an unknown party blank", () => {
    const result = buildProposal(
      {
        ...input,
        roles: [{ ...input.roles[0], party: "nope" }, input.roles[1]],
      } as typeof input,
      nda(),
      [],
      newId,
    )
    expect(result.ok ? "" : result.error).toContain("nope")
  })

  test("refuses fields for a viewer", () => {
    const result = buildProposal(
      {
        ...input,
        roles: [{ ...input.roles[0], recipientRole: "VIEWER" }, input.roles[1]],
      } as typeof input,
      nda(),
      [],
      newId,
    )
    expect(result.ok).toBe(false)
  })

  test("out of date when the signers changed since", () => {
    const result = buildProposal(input, nda(), [], newId)
    if (!result.ok) throw new Error(result.error)
    const changed = nda()
    const role = changed.roles[0]
    if (role) role.label = "Someone else"
    expect(isProposalStale(result.payload.change, nda(), changed)).toBe(true)
    expect(isProposalStale(result.payload.change, nda(), nda())).toBe(false)
  })
})

describe("applySigners with parties", () => {
  const thirdParty = () => {
    const data = nda()
    data.variables.push({
      key: "party_c_name",
      label: "Third party's name",
      type: "text",
      value: null,
      status: "unresolved",
      party: true,
    })
    const def = currentSigners(data)
    def.roles.push({
      key: "party_c",
      label: "Third party",
      recipientRole: "SIGNER",
      name: null,
      email: null,
      initialsOnEveryPage: false,
    })
    def.fields.party_c = [{ fieldType: "SIGNATURE", required: true }]
    return { data, def }
  }

  test("a new signer's block names its party, so the link survives", () => {
    const { data, def } = thirdParty()
    def.parties.party_c = "party_c_name"
    const next = applySigners(data, def, newId)
    expect(currentSigners(next).parties.party_c).toBe("party_c_name")
    expect(structureIssues(next)).toEqual([])
  })

  test("without a party the block is captioned with the role", () => {
    const { data, def } = thirdParty()
    const next = applySigners(data, def, newId)
    expect(currentSigners(next).parties.party_c).toBeUndefined()
  })

  test("an unknown party blank is refused", () => {
    const { data, def } = thirdParty()
    def.parties.party_c = "nope"
    expect(() => applySigners(data, def, newId)).toThrow(SignersError)
  })
})
