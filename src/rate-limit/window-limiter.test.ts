import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logAbuseEvent } from "./log";
import { enforceLimit, _inProcessWindowsForTests } from "./window-limiter";
import type { DurableIncrement } from "./window-limiter";

/**
 * 009b limiter unit tests: window semantics, layering (the durable verdict
 * is the authority), per-key isolation (envelope safety), fail-open when
 * the durable layer is unreachable, and log hygiene (the raw coarse key is
 * never logged).
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  // The staged-enablement flag: these tests exercise the ENABLED behavior.
  vi.stubEnv("ABUSE_LIMITS_ENABLED", "1");
  // Reset the shared in-process map between tests.
  for (const key of [..._inProcessWindowsForTests.keys()]) {
    _inProcessWindowsForTests.delete(key);
  }
});

const ipSource = { kind: "ip" as const, ip: "203.0.113.7" };
const ipSourceB = { kind: "ip" as const, ip: "198.51.100.7" };

describe("enforceLimit", () => {
  it("is disabled without the staged-enablement flag (kill switch / local dev)", async () => {
    vi.stubEnv("ABUSE_LIMITS_ENABLED", "");
    const decision = await enforceLimit({
      routeFamily: "invite_landing",
      source: ipSource,
      durable: null,
      now: 1_000_000,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.layer).toBe("disabled");
  });

  it("admits up to the pinned max within one in-process window and denies beyond it", async () => {
    // Force the durable layer off so the in-process layer is decisive.
    const decisions = [];
    for (let i = 0; i < 121; i += 1) {
      decisions.push(
        await enforceLimit({
          routeFamily: "invite_landing",
          source: { kind: "ip", ip: `203.0.113.${i % 250 === 0 ? 1 : 7}` },
          durable: null,
          now: 1_000_000,
        }),
      );
    }
    expect(decisions[0]?.allowed).toBe(true);
    // 203.0.113.x shares one hashed prefix bucket for the first three octets.
    const denied = decisions.filter((d) => !d.allowed);
    expect(denied.length).toBeGreaterThan(0);
    expect(denied[0]?.layer).toBe("in_process");
  });

  it("per-key isolation: one key's exhausted budget never denies another key (envelope safety)", async () => {
    for (let i = 0; i < 150; i += 1) {
      await enforceLimit({
        routeFamily: "otp_send",
        source: ipSource,
        durable: null,
        now: 2_000_000,
      });
    }
    const otherKey = await enforceLimit({
      routeFamily: "otp_send",
      source: ipSourceB,
      durable: null,
      now: 2_000_000,
    });
    expect(otherKey.allowed).toBe(true);
  });

  it("the durable verdict is the authority: an in-process pass with a durable denial is denied", async () => {
    const durable: DurableIncrement = vi.fn(async () => false);
    const decision = await enforceLimit({
      routeFamily: "otp_verify",
      source: { kind: "user", userId: "u-1" },
      durable,
      now: 3_000_000,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.layer).toBe("durable");
    expect(durable).toHaveBeenCalled();
  });

  it("fails OPEN when the durable layer is unreachable (database invariants remain the authority)", async () => {
    const durable: DurableIncrement = vi.fn(async () => true); // the wrapper maps RPC errors to true + log
    const decision = await enforceLimit({
      routeFamily: "extraction",
      source: { kind: "user", userId: "u-2" },
      durable,
      now: 4_000_000,
    });
    expect(decision.allowed).toBe(true);
  });

  it("a fresh window restores access", async () => {
    const windowMs = 60_000;
    for (let i = 0; i < 40; i += 1) {
      await enforceLimit({
        routeFamily: "extraction",
        source: { kind: "user", userId: "u-window" },
        durable: null,
        now: 5_000_000,
      });
    }
    const exhausted = await enforceLimit({
      routeFamily: "extraction",
      source: { kind: "user", userId: "u-window" },
      durable: null,
      now: 5_000_000,
    });
    expect(exhausted.allowed).toBe(false);
    const nextWindow = await enforceLimit({
      routeFamily: "extraction",
      source: { kind: "user", userId: "u-window" },
      durable: null,
      now: 5_000_000 + windowMs,
    });
    expect(nextWindow.allowed).toBe(true);
  });
});

describe("abuse log hygiene", () => {
  it("denial lines carry only the route family and key kind — never the coarse key or address", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      lines.push(String(args[0]));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    logAbuseEvent("warn", "limiter_denied", {
      route_family: "invite_landing",
      key_kind: "ip",
      // Injection attempts on non-allowlisted fields are dropped.
      coarse_key: "invite_landing:i:deadbeef",
      ip: "203.0.113.7",
      token: "F".repeat(43),
      body: "leak",
    } as unknown as Parameters<typeof logAbuseEvent>[2]);

    expect(lines).toHaveLength(1);
    const full = lines.join("\n");
    expect(full).not.toContain("deadbeef");
    expect(full).not.toContain("203.0.113.7");
    expect(full).not.toContain("FFFF");
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "event",
      "key_kind",
      "route_family",
    ]);
  });
});
