import { describe, expect, test } from "bun:test"
import {
  bulkColumns,
  bulkCsvTemplate,
  parseCsv,
  renderBulkTitle,
  rowsFromCsv,
  validateBulkRows,
} from "./bulk-send"
import type { TemplateForUse } from "./templates"

const role = (over: Partial<TemplateForUse["roles"][number]>): TemplateForUse["roles"][number] => ({
  id: "r",
  label: "Tenant",
  role: "SIGNER",
  order: 1,
  verification: "LINK",
  colorIndex: 0,
  name: null,
  email: null,
  phone: null,
  ...over,
})

const lease: TemplateForUse = {
  signingOrder: "SEQUENTIAL",
  roles: [
    role({ id: "tenant", label: "Tenant", verification: "SMS_OTP" }),
    role({ id: "guarantor", label: "Guarantor", order: 2 }),
    role({
      id: "landlord",
      label: "Landlord",
      order: 3,
      name: "Wanjiru Kamau",
      email: "wanjiru@example.test",
    }),
  ],
  fields: [],
}
const single: TemplateForUse = {
  signingOrder: "PARALLEL",
  roles: [role({ id: "only", label: "Employee" })],
  fields: [],
}

describe("parseCsv", () => {
  test("quotes, escaped quotes, embedded commas/newlines, CRLF, BOM, blank lines", () => {
    const csv =
      '﻿name,email,note\r\n"Doe, Jane",jane@x.co,"said ""hi""\nthen left"\r\n\r\nOtieno,o@x.co,\n'
    expect(parseCsv(csv)).toEqual([
      ["name", "email", "note"],
      ["Doe, Jane", "jane@x.co", 'said "hi"\nthen left'],
      ["Otieno", "o@x.co", ""],
    ])
  })

  test("semicolon-separated files (Excel in many locales)", () => {
    expect(parseCsv("name;email\nAmina;a@x.co")).toEqual([
      ["name", "email"],
      ["Amina", "a@x.co"],
    ])
  })
})

describe("columns", () => {
  test("per open role; phone only for SMS roles; fixed contacts need nothing", () => {
    expect(bulkColumns(lease.roles).map((c) => c.header)).toEqual([
      "Tenant name",
      "Tenant email",
      "Tenant phone",
      "Guarantor name",
      "Guarantor email",
    ])
    expect(bulkCsvTemplate(single.roles)).toBe(
      "Employee name,Employee email\r\nJane Doe,jane@example.com\r\n",
    )
  })
})

describe("rowsFromCsv", () => {
  test("maps columns (case/space-insensitive) and validates every row like a single send", () => {
    const csv = [
      "tenant NAME,Tenant email,Tenant phone,Guarantor name,Guarantor email",
      "Amina Hassan,AMINA@example.test,+254712345678,Otieno,otieno@example.test",
      "Kiprono,not-an-email,+254700000000,Ann,ann@example.test",
      "Baraka,baraka@example.test,,Ann,ann@example.test",
      "Zawadi,zawadi@example.test,+254711111111,Zawadi again,zawadi@example.test",
    ].join("\n")
    const { rows, issues } = rowsFromCsv(lease, csv)
    expect(rows).toEqual([
      {
        recipients: [
          {
            roleId: "tenant",
            name: "Amina Hassan",
            email: "AMINA@example.test",
            phone: "+254712345678",
          },
          { roleId: "guarantor", name: "Otieno", email: "otieno@example.test" },
        ],
      },
    ])
    expect(issues).toEqual([
      { row: 2, message: "Tenant: Enter a valid email address" },
      { row: 3, message: "Tenant: SMS verification needs a phone number" },
      { row: 4, message: expect.stringContaining("Guarantor: Already used for Tenant") },
    ])
  })

  test("missing columns, empty files and single-role plain headers", () => {
    expect(rowsFromCsv(lease, "Tenant name,Tenant email\nA,a@x.co").issues).toEqual([
      { row: 0, message: "Missing columns: Guarantor name, Guarantor email" },
    ])
    expect(rowsFromCsv(lease, "").issues[0]?.message).toBe("The file is empty")
    expect(rowsFromCsv(single, "name,email\nJane,jane@x.co").rows).toHaveLength(1)
  })

  test("row limit", () => {
    const csv = ["name,email", ...Array.from({ length: 501 }, (_, i) => `P${i},p${i}@x.co`)].join(
      "\n",
    )
    expect(rowsFromCsv(single, csv).issues[0]?.message).toBe("Up to 500 rows per bulk send")
  })

  test("JSON rows get the same validation", () => {
    expect(
      validateBulkRows(single, [{ recipients: [{ roleId: "only", name: "", email: "x" }] }]),
    ).toEqual([
      { row: 1, message: "Employee: Enter their name" },
      { row: 1, message: "Employee: Enter a valid email address" },
    ])
  })
})

describe("renderBulkTitle", () => {
  test("fills role placeholders, including fixed contacts; leaves unknown ones", () => {
    const row = {
      recipients: [
        { roleId: "tenant", name: "Amina Hassan", email: "a@x.co" },
        { roleId: "guarantor", name: "O", email: "o@x.co" },
      ],
    }
    expect(
      renderBulkTitle("Lease – {{Tenant name}} / {{ landlord NAME }} {{unknown}}", lease, row),
    ).toBe("Lease – Amina Hassan / Wanjiru Kamau {{unknown}}")
  })
})
