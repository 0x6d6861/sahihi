/**
 * The client IP from `X-Forwarded-For`, trusting only what our own proxies appended
 * (docs/security.md → Rate limiting).
 *
 * Each proxy appends the address it received the request from, so the leftmost entries are
 * whatever the client sent and can be forged. With `trustedHops` proxies in front of the API,
 * the real client is the entry `trustedHops` from the right. Anything else (no header, too few
 * entries, not an IP, `trustedHops` 0) gives null: callers then share one "unknown" bucket and
 * record no IP, rather than trusting a forgeable value.
 */
export function clientIpFromForwarded(
  forwardedFor: string | null | undefined,
  trustedHops: number,
): string | null {
  if (!forwardedFor || trustedHops < 1) return null
  const hops = forwardedFor
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
  const candidate = hops[hops.length - trustedHops]
  if (!candidate) return null
  const ip = stripPort(candidate)
  return isIpAddress(ip) ? ip : null
}

/** "1.2.3.4:5678" → "1.2.3.4", "[::1]:443" → "::1"; bare IPv6 stays as is. */
function stripPort(host: string): string {
  const bracketed = host.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (bracketed?.[1]) return bracketed[1]
  const v4 = host.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  return v4?.[1] ?? host
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
// Hex groups and colons (at most one "::"), optionally ending in an IPv4 address.
const IPV6 =
  /^(?=.*:)[0-9a-f:]{2,39}(?:(?<=:)(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})?$/i

/** Syntactic IPv4/IPv6 check (pure: `@sahihi/core` also runs in the browser, so no node:net). */
export function isIpAddress(value: string): boolean {
  if (IPV4.test(value)) return true
  if (!IPV6.test(value) || (value.match(/::/g)?.length ?? 0) > 1) return false
  const groups = value.split(":")
  return (
    groups.length <= 8 &&
    groups.every((g) => g === "" || /^[0-9a-f]{1,4}$/i.test(g) || IPV4.test(g))
  )
}
