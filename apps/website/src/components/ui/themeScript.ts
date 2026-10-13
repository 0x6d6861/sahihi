export const THEME_KEY = "theme"

/**
 * Runs in <head> before first paint, so the page never flashes the wrong
 * scheme. A saved choice wins; otherwise the system setting decides.
 * A string, not a component: it must run before React loads. Lives outside
 * ThemeHotkey.tsx because exports of a "use client" file reach server
 * components as client references, not values.
 */
export const themeScript = `(()=>{let t;try{t=localStorage.getItem("${THEME_KEY}")}catch{}document.documentElement.dataset.theme=t==="dark"||t==="light"?t:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"})()`
