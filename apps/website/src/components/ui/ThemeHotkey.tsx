"use client"

import { useEffect } from "react"
import { THEME_KEY as KEY } from "./themeScript"

function apply(theme: "light" | "dark") {
  const root = document.documentElement
  // Keyboard-triggered, so it switches instantly: no colour transitions for this one frame.
  root.setAttribute("data-theme-switching", "")
  root.dataset.theme = theme
  requestAnimationFrame(() => root.removeAttribute("data-theme-switching"))
}

/** Press D to toggle light/dark. The choice is saved; until then the page follows the system. */
export function ThemeHotkey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "d" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.isContentEditable || el.closest("input, textarea, select")) return
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"
      apply(next)
      try {
        localStorage.setItem(KEY, next)
      } catch {}
    }
    const onSystem = (e: MediaQueryListEvent) => {
      let saved: string | null = null
      try {
        saved = localStorage.getItem(KEY)
      } catch {}
      if (!saved) apply(e.matches ? "dark" : "light")
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    window.addEventListener("keydown", onKey)
    mq.addEventListener("change", onSystem)
    return () => {
      window.removeEventListener("keydown", onKey)
      mq.removeEventListener("change", onSystem)
    }
  }, [])
  return null
}
