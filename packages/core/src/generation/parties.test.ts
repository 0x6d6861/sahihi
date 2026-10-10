import { describe, expect, test } from "bun:test"
import type { GeneratedDocumentData } from "./model"
import { documentParties, partyRoleLabel, rolePartyKeys } from "./parties"
import { findStarter } from "./starters"

const starter = (id: string): GeneratedDocumentData => {
  const data = findStarter(id)?.build()
  if (!data) throw new Error("missing starter")
  return data
}

describe("documentParties", () => {
  test("links each party blank to the signer whose block names it", () => {
    const data = starter("mutual-nda")
    const a = data.variables.find((v) => v.key === "party_a_name")
    if (a) a.value = "Acme Ltd"
    expect(documentParties(data)).toEqual([
      {
        variableKey: "party_a_name",
        label: "First party's name",
        value: "Acme Ltd",
        roleKey: "party_a",
        roleLabel: "First party",
      },
      {
        variableKey: "party_b_name",
        label: "Second party's name",
        value: null,
        roleKey: "party_b",
        roleLabel: "Second party",
      },
    ])
  })

  test("a flagged party no block names has no signer", () => {
    const data = starter("mutual-nda")
    data.variables.push({
      key: "party_c_name",
      label: "Third party's name",
      type: "text",
      value: null,
      status: "unresolved",
      party: true,
    })
    expect(documentParties(data).find((p) => p.variableKey === "party_c_name")?.roleKey).toBeNull()
  })

  test("without the flag, a blank named in a caption still counts (older documents)", () => {
    const data = starter("mutual-nda")
    for (const v of data.variables) delete v.party
    expect(documentParties(data).map((p) => p.variableKey)).toEqual([
      "party_a_name",
      "party_b_name",
    ])
    expect(rolePartyKeys(data)).toEqual({ party_a: "party_a_name", party_b: "party_b_name" })
  })

  test("a caption with no blank links nothing (the policy's employee)", () => {
    expect(rolePartyKeys(starter("acceptable-use-policy"))).toEqual({
      approver: "organisation_name",
    })
  })
})

test("partyRoleLabel drops a trailing name", () => {
  expect(partyRoleLabel({ label: "Third party's name" })).toBe("Third party")
  expect(partyRoleLabel({ label: "Client name" })).toBe("Client")
  expect(partyRoleLabel({ label: "Name" })).toBe("Name")
  expect(partyRoleLabel({ label: "Landlord" })).toBe("Landlord")
})
