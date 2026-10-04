import { describe, expect, it } from "vitest";

import { ExtractionLimiter } from "./limiter";

describe("single-process extraction admission", () => {
  it("enforces five attempts per user in a rolling minute", () => {
    const limiter = new ExtractionLimiter();
    for (let index = 0; index < 5; index += 1) {
      const result = limiter.acquire("user", index);
      expect(result.ok).toBe(true);
      if (result.ok) result.permit.release();
    }
    expect(limiter.acquire("user", 5)).toEqual({ ok: false, reason: "rate" });
    expect(limiter.acquire("user", 60_001).ok).toBe(true);
  });

  it("enforces sixty attempts across the process", () => {
    const limiter = new ExtractionLimiter();
    for (let index = 0; index < 60; index += 1) {
      const result = limiter.acquire(`user-${index}`, 0);
      expect(result.ok).toBe(true);
      if (result.ok) result.permit.release();
    }
    expect(limiter.acquire("last", 1)).toEqual({ ok: false, reason: "rate" });
  });

  it("enforces two concurrent attempts per user and releases idempotently", () => {
    const limiter = new ExtractionLimiter();
    const first = limiter.acquire("user", 0);
    const second = limiter.acquire("user", 0);
    expect(limiter.acquire("user", 0)).toEqual({
      ok: false,
      reason: "concurrency",
    });
    if (first.ok) {
      first.permit.release();
      first.permit.release();
    }
    expect(limiter.acquire("user", 0).ok).toBe(true);
    if (second.ok) second.permit.release();
  });

  it("enforces sixteen concurrent attempts for the process", () => {
    const limiter = new ExtractionLimiter();
    const permits = Array.from({ length: 16 }, (_, index) =>
      limiter.acquire(`user-${index}`, 0),
    );
    expect(limiter.acquire("overflow", 0)).toEqual({
      ok: false,
      reason: "concurrency",
    });
    permits.forEach((result) => result.ok && result.permit.release());
    expect(limiter.acquire("recovered", 0).ok).toBe(true);
  });
});

it("keeps production admission within the initial Firecrawl free-plan rate and concurrency", async () => {
  const { extractionLimiter } = await import("./limiter");
  const first = extractionLimiter.acquire("firecrawl-1", 100);
  const second = extractionLimiter.acquire("firecrawl-2", 100);
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  expect(extractionLimiter.acquire("firecrawl-3", 100)).toEqual({
    ok: false,
    reason: "concurrency",
  });
  if (first.ok) first.permit.release();
  if (second.ok) second.permit.release();
  for (let i = 0; i < 8; i++) {
    const admission = extractionLimiter.acquire(`firecrawl-rate-${i}`, 100);
    expect(admission.ok).toBe(true);
    if (admission.ok) admission.permit.release();
  }
  expect(extractionLimiter.acquire("firecrawl-over-budget", 100)).toEqual({
    ok: false,
    reason: "rate",
  });
});
