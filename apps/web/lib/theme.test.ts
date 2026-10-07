import { describe, expect, test } from "bun:test"
import {
  parseThemePreference,
  resolveTheme,
  serverThemeAttributes,
  THEME_COOKIE,
  themeCookie,
} from "./theme"

describe("theme preference", () => {
  test("unknown or missing cookie values fall back to system", () => {
    expect(parseThemePreference(undefined)).toBe("system")
    expect(parseThemePreference("")).toBe("system")
    expect(parseThemePreference("purple")).toBe("system")
    expect(parseThemePreference("dark")).toBe("dark")
    expect(parseThemePreference("light")).toBe("light")
  })

  test("system follows the OS, explicit choices win", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("dark", false)).toBe("dark")
  })

  test("dark sets both the coss class and the Arc attribute", () => {
    expect(serverThemeAttributes("dark")).toEqual({ className: "dark", "data-theme": "dark" })
    expect(serverThemeAttributes("light")).toEqual({ "data-theme": "light" })
    expect(serverThemeAttributes("system")).toEqual({})
  })

  test("cookie is site-wide and long-lived", () => {
    expect(themeCookie("dark")).toStartWith(`${THEME_COOKIE}=dark; Path=/;`)
  })
})
