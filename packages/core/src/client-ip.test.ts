import { describe, expect, test } from "bun:test"
import { clientIpFromForwarded, isIpAddress } from "./client-ip"

describe("clientIpFromForwarded", () => {
  test("takes the entry our proxies appended, not the client-controlled left side", () => {
    // Client forged "6.6.6.6"; Railway's edge appended the real address.
    expect(clientIpFromForwarded("6.6.6.6, 41.90.1.2", 1)).toBe("41.90.1.2")
    expect(clientIpFromForwarded("41.90.1.2", 1)).toBe("41.90.1.2")
    // Two trusted hops (e.g. the web calls the API through a second public proxy).
    expect(clientIpFromForwarded("6.6.6.6, 41.90.1.2, 10.0.0.5", 2)).toBe("41.90.1.2")
  })

  test("no header, too few entries, 0 hops or garbage give null", () => {
    expect(clientIpFromForwarded(undefined, 1)).toBeNull()
    expect(clientIpFromForwarded("", 1)).toBeNull()
    expect(clientIpFromForwarded("41.90.1.2", 2)).toBeNull()
    expect(clientIpFromForwarded("41.90.1.2", 0)).toBeNull()
    expect(clientIpFromForwarded("6.6.6.6, not-an-ip", 1)).toBeNull()
    expect(clientIpFromForwarded("6.6.6.6, 41.90.1.2<script>", 1)).toBeNull()
  })

  test("IPv6 and ports", () => {
    expect(clientIpFromForwarded("2001:db8::1", 1)).toBe("2001:db8::1")
    expect(clientIpFromForwarded("[2001:db8::1]:443", 1)).toBe("2001:db8::1")
    expect(clientIpFromForwarded("41.90.1.2:51234", 1)).toBe("41.90.1.2")
  })
})

describe("isIpAddress", () => {
  test("accepts IPv4 and IPv6, rejects the rest", () => {
    for (const ip of [
      "41.90.1.2",
      "0.0.0.0",
      "::1",
      "2001:db8::1",
      "fe80::1:2:3:4",
      "::ffff:10.0.0.1",
    ])
      expect({ ip, ok: isIpAddress(ip) }).toEqual({ ip, ok: true })
    for (const ip of [
      "256.1.1.1",
      "1.2.3",
      "a.b.c.d",
      "2001::db8::1",
      "12345::",
      "1:2:3:4:5:6:7:8:9",
      "unknown",
      "",
    ])
      expect({ ip, ok: isIpAddress(ip) }).toEqual({ ip, ok: false })
  })
})
