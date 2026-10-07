"use client"

import { resolveTheme, type ThemePreference, themeCookie } from "@/lib/theme"

/** Reads the preference the root layout put on <html>. */
export function currentThemePreference(): ThemePreference {
  const value = document.documentElement.dataset.themePreference
  return value === "light" || value === "dark" ? value : "system"
}

/** Applies a theme choice to <html> right away and remembers it in the cookie. */
export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement
  const dark =
    resolveTheme(preference, window.matchMedia("(prefers-color-scheme: dark)").matches) === "dark"
  root.dataset.themePreference = preference
  root.classList.toggle("dark", dark)
  root.dataset.theme = dark ? "dark" : "light"
  // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie, read by the root layout
  document.cookie = themeCookie(preference)
}
