import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { clientIpFor, coarseKeyFor } from "./coarse-key";

describe("coarse keys", () => {
  it("hashes the IPv4 prefix so a coarse network shares one budget", () => {
    const a = coarseKeyFor("invite_landing", { kind: "ip", ip: "203.0.113.7" });
    const b = coarseKeyFor("invite_landing", {
      kind: "ip",
      ip: "203.0.113.99",
    });
    const c = coarseKeyFor("invite_landing", {
      kind: "ip",
      ip: "198.51.100.7",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    // The raw address is never in the key.
    expect(a).not.toContain("203.0.113");
  });

  it("hashes the IPv6 prefix", () => {
    const a = coarseKeyFor("otp_send", { kind: "ip", ip: "2001:db8:1:2::3" });
    const b = coarseKeyFor("otp_send", {
      kind: "ip",
      ip: "2001:db8:1:2::ffff",
    });
    const c = coarseKeyFor("otp_send", { kind: "ip", ip: "2601:646:1:2::3" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("2001:db8");
  });

  it("bounds the key length and includes the route family", () => {
    const key = coarseKeyFor("extraction", { kind: "ip", ip: "203.0.113.7" });
    expect(key.startsWith("extraction:")).toBe(true);
    expect(key.length).toBeLessThanOrEqual(128);
  });

  it("uses the internal user id for authenticated traffic", () => {
    const key = coarseKeyFor("extraction", {
      kind: "user",
      userId: "11111111-1111-4111-8111-111111111111",
    });
    expect(key).toBe("extraction:u:11111111-1111-4111-8111-111111111111");
  });

  it("picks the first forwarded hop as the client address", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18",
    });
    expect(clientIpFor(headers)).toBe("203.0.113.7");
    expect(clientIpFor(new Headers())).toBeNull();
  });
});
