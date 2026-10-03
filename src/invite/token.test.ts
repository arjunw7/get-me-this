import { describe, expect, it } from "vitest";

import {
  generateCanonicalSecret,
  isCanonicalOpaqueToken,
  isCanonicalSecret,
  isFlowId,
  normalizeEmail,
} from "./token";

describe("canonical opaque token validation", () => {
  it("accepts the exact 43-character canonical base64url shape", () => {
    expect(isCanonicalOpaqueToken("A".repeat(42) + "E")).toBe(true);
    expect(isCanonicalOpaqueToken("a".repeat(42) + "8")).toBe(true);
    expect(isCanonicalOpaqueToken("a".repeat(42) + "w")).toBe(true);
  });

  it("rejects wrong lengths, padding, and non-canonical tails", () => {
    expect(isCanonicalOpaqueToken("A".repeat(42))).toBe(false);
    expect(isCanonicalOpaqueToken("A".repeat(42) + "F")).toBe(false);
    expect(isCanonicalOpaqueToken("A".repeat(42) + "E=")).toBe(false);
    expect(isCanonicalOpaqueToken("")).toBe(false);
    expect(isCanonicalOpaqueToken(undefined)).toBe(false);
    expect(isCanonicalOpaqueToken(null)).toBe(false);
    // A non-canonical tail alphabet character (the 65th value bit pattern).
    expect(isCanonicalOpaqueToken("A".repeat(42) + "1")).toBe(false);
  });

  it("shares the shape with browser and coordinator secrets", () => {
    expect(isCanonicalSecret("B".repeat(42) + "c")).toBe(true);
    expect(isCanonicalSecret("B".repeat(42) + "B")).toBe(false);
  });
});

describe("generateCanonicalSecret", () => {
  it("generates 43-character canonical base64url secrets", () => {
    for (let index = 0; index < 32; index += 1) {
      const secret = generateCanonicalSecret();
      expect(secret).toHaveLength(43);
      expect(isCanonicalSecret(secret)).toBe(true);
    }
  });

  it("generates distinct secrets across calls", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 16; index += 1) {
      seen.add(generateCanonicalSecret());
    }
    expect(seen.size).toBe(16);
  });
});

describe("flow id and email normalization", () => {
  it("accepts canonical UUIDs and rejects everything else", () => {
    expect(isFlowId("0f0a0b0c-1111-4222-8333-444455556666")).toBe(true);
    expect(isFlowId("not-a-uuid")).toBe(false);
    expect(isFlowId("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("normalizes the requested email the way the database binding does", () => {
    expect(normalizeEmail("  Person@Example.com ")).toBe("person@example.com");
  });
});
