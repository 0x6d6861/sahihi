/**
 * Where server-side code reaches the Hono API (Server Components, the proxy, Next rewrites).
 * The browser never uses it: it calls /api/* on the web origin. One of the few env vars the web
 * reads itself (AGENTS.md rule 14).
 */
export const API_URL = process.env.API_URL ?? "http://localhost:4000"
