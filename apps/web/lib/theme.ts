/**
 * Light / dark appearance (ADR 0023). The choice lives in a cookie so the server can render the right
 * theme for an explicit choice; "system" follows `prefers-color-scheme` through a small inline script
 * in the root layout. Dark mode sets both `.dark` (coss, Tailwind `dark:`) and `data-theme="dark"` (Arc).
 */

export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const THEME_COOKIE = "sahihi-theme"
/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function parseThemePreference(value: string | undefined | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system"
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light"
  return preference
}

/** Attributes for <html> when the server already knows the theme (explicit choice only). */
export function serverThemeAttributes(preference: ThemePreference): {
  className?: string
  "data-theme"?: ResolvedTheme
} {
  if (preference === "system") return {}
  return preference === "dark"
    ? { className: "dark", "data-theme": "dark" }
    : { "data-theme": "light" }
}

export function themeCookie(preference: ThemePreference): string {
  return `${THEME_COOKIE}=${preference}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`
}

/**
 * Inline script for <head>: applies the system theme before first paint and follows OS changes while
 * the preference is "system". Kept tiny and static; the layout adds the CSP nonce.
 */
export const SYSTEM_THEME_SCRIPT = `(function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){if(d.dataset.themePreference!=="system")return;var k=m.matches;d.classList.toggle("dark",k);d.dataset.theme=k?"dark":"light";}a();m.addEventListener("change",a);})();`
