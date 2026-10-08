import { describe, expect, test } from "bun:test"
import { stagger } from "./motion"

const step = (index: number) => (stagger(index) as Record<string, unknown>)["--i"]

describe("stagger", () => {
  test("sets the step index as --i", () => {
    expect(step(0)).toBe(0)
    expect(step(3)).toBe(3)
  })

  test("caps long lists so the cascade stays short", () => {
    expect(step(8)).toBe(8)
    expect(step(40)).toBe(8)
  })

  test("never goes negative", () => {
    expect(step(-2)).toBe(0)
  })
})
