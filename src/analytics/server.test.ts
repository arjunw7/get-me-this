/**
 * Server lane tests. posthog-node and server-only are fully mocked, so no
 * test can make a network request. Covers:
 * - true no-op adapter when unconfigured (no construction, no retention);
 * - configured capture/flush ordering and concurrent captures;
 * - validation failures never reaching the SDK;
 * - delivery failure behaviour;
 * - idempotent explicit shutdown (no signal listeners);
 * - the per-configuration client cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callOrder: string[] = [];
const posthogNodeInstance = vi.hoisted(() => ({
  capture: vi.fn(() => {
    callOrder.push("capture");
  }),
  flush: vi.fn(async () => {
    callOrder.push("flush");
  }),
  shutdown: vi.fn(async () => {
    callOrder.push("shutdown");
  }),
}));
// A mockable constructor: a regular function (not an arrow) so `new` works.
const PostHogConstructor = vi.hoisted(() =>
  vi.fn(function PostHog() {
    return posthogNodeInstance;
  }),
);

const consentStore = vi.hoisted(() => ({
  value: "granted" as string | undefined,
  fail: false,
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    if (consentStore.fail) throw new Error("no request");
    return {
      get: () =>
        consentStore.value === undefined
          ? undefined
          : { value: consentStore.value },
    };
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("posthog-node", () => ({ PostHog: PostHogConstructor }));

const VALID_PAYLOAD = { method: "email", is_new_user: true } as const;
const DISTINCT_ID = "00000000-0000-4000-8000-000000000000";
const GROUP_ID = "11111111-1111-4111-8111-111111111111";
// Runtime negative test payload: deliberately invalid for the runtime
// validator, so it is cast past the compile-time boundary.
const MISSING_IS_NEW_USER = { method: "email" } as never;
const UNKNOWN_EVENT = "group_deleted" as never;

const ENV_KEYS = [
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "NEXT_PUBLIC_POSTHOG_HOST",
] as const;

async function importServer() {
  const serverModule = await import("./server");
  return serverModule;
}

describe("server analytics lane", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    consentStore.value = "granted";
    consentStore.fail = false;
    vi.resetModules();
    callOrder.length = 0;
    posthogNodeInstance.capture.mockClear();
    posthogNodeInstance.flush.mockClear();
    posthogNodeInstance.shutdown.mockClear();
    posthogNodeInstance.capture.mockImplementation(() => {
      callOrder.push("capture");
    });
    posthogNodeInstance.flush.mockImplementation(async () => {
      callOrder.push("flush");
    });
    PostHogConstructor.mockClear();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe("unconfigured: true no-op adapter", () => {
    it("treats token-only configuration as unconfigured and constructs no client", async () => {
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc-test-token";
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      const result = await analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
      });
      expect(result).toEqual({ ok: true, delivered: false });
      expect(PostHogConstructor).not.toHaveBeenCalled();
      expect(posthogNodeInstance.capture).not.toHaveBeenCalled();
      expect(posthogNodeInstance.flush).not.toHaveBeenCalled();
    });

    it("treats host-only configuration as unconfigured and constructs no client", async () => {
      process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.test";
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      const result = await analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
      });
      expect(result).toEqual({ ok: true, delivered: false });
      expect(PostHogConstructor).not.toHaveBeenCalled();
    });

    it("constructs no posthog-node client and makes no network request with neither variable", async () => {
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();
      expect(PostHogConstructor).not.toHaveBeenCalled();

      const result = await analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
      });
      expect(result).toEqual({ ok: true, delivered: false });
      expect(PostHogConstructor).not.toHaveBeenCalled();
      expect(posthogNodeInstance.capture).not.toHaveBeenCalled();
      expect(posthogNodeInstance.flush).not.toHaveBeenCalled();
    });

    it("still rejects invalid payloads so the boundary is identical in every mode", async () => {
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      // Runtime invalidation proof for a name the compile-time boundary
      // would already reject.
      const unknownEvent = await analytics.capture(
        UNKNOWN_EVENT,
        {},
        {
          distinctId: DISTINCT_ID,
        },
      );
      expect(unknownEvent).toMatchObject({ ok: false, code: "unknown-event" });

      const missingKey = await analytics.capture(
        "auth_completed",
        MISSING_IS_NEW_USER,
        {
          distinctId: DISTINCT_ID,
        },
      );
      expect(missingKey).toMatchObject({ ok: false, code: "missing-key" });
      expect(PostHogConstructor).not.toHaveBeenCalled();
    });

    it("shuts down inertly", async () => {
      const { getServerAnalytics } = await importServer();
      await expect(getServerAnalytics().shutdown()).resolves.toBeUndefined();
      expect(posthogNodeInstance.shutdown).not.toHaveBeenCalled();
    });

    it("rejects invalid identity context in every mode", async () => {
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      for (const invalidId of ["user@example.com", "Arjun Wadhwa", ""]) {
        const result = await analytics.capture(
          "auth_completed",
          VALID_PAYLOAD,
          { distinctId: invalidId },
        );
        expect(result).toMatchObject({ ok: false, code: "invalid-context" });
        if (invalidId.length > 0) {
          // The rejected identifier value never appears in the failure.
          expect(JSON.stringify(result)).not.toContain(invalidId);
        }
      }
    });
  });

  describe("configured: posthog-node adapter", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc-test-token";
      process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.test";
    });

    it("constructs one client with the public configuration", async () => {
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();
      analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
      });
      await analytics.shutdown();

      expect(PostHogConstructor).toHaveBeenCalledTimes(1);
      expect(PostHogConstructor).toHaveBeenCalledWith("phc-test-token", {
        host: "https://eu.i.posthog.test",
        requestTimeout: 2000,
        fetchRetryCount: 0,
      });
    });

    it.each([undefined, "denied", "invalid"])(
      "captures nothing without granted consent (%s)",
      async (value) => {
        const analytics = (await importServer()).getServerAnalytics();
        consentStore.value = value;
        expect(
          await analytics.capture("auth_completed", VALID_PAYLOAD, {
            distinctId: DISTINCT_ID,
          }),
        ).toEqual({ ok: true, delivered: false });
        expect(posthogNodeInstance.capture).not.toHaveBeenCalled();
        expect(posthogNodeInstance.flush).not.toHaveBeenCalled();
      },
    );

    it("rechecks consent per request with a shared adapter and fails closed outside a request", async () => {
      const analytics = (await importServer()).getServerAnalytics();
      await analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
      });
      consentStore.value = "denied";
      await analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
      });
      consentStore.value = "granted";
      consentStore.fail = true;
      await analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
      });
      expect(posthogNodeInstance.capture).toHaveBeenCalledTimes(1);
    });

    it("captures the validated payload and awaits flush after every capture", async () => {
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      const result = await analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
        group: { id: GROUP_ID },
      });

      expect(result).toEqual({ ok: true, delivered: true });
      expect(posthogNodeInstance.capture).toHaveBeenCalledTimes(1);
      expect(posthogNodeInstance.capture).toHaveBeenCalledWith({
        distinctId: DISTINCT_ID,
        event: "auth_completed",
        properties: { ...VALID_PAYLOAD, $ip: null, $geoip_disable: true },
        groups: { group: GROUP_ID },
      });
      expect(posthogNodeInstance.flush).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["capture", "flush"]);
    });

    it("rejects invalid identity context before anything reaches PostHog", async () => {
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      for (const invalidId of ["user@example.com", "Arjun Wadhwa", ""]) {
        const result = await analytics.capture(
          "auth_completed",
          VALID_PAYLOAD,
          { distinctId: invalidId },
        );
        expect(result).toMatchObject({ ok: false, code: "invalid-context" });
        if (invalidId.length > 0) {
          expect(JSON.stringify(result)).not.toContain(invalidId);
        }
      }

      const invalidGroup = await analytics.capture(
        "auth_completed",
        VALID_PAYLOAD,
        {
          distinctId: DISTINCT_ID,
          group: { id: "not-a-uuid" },
        },
      );
      expect(invalidGroup).toMatchObject({
        ok: false,
        code: "invalid-context",
      });

      expect(posthogNodeInstance.capture).not.toHaveBeenCalled();
      expect(posthogNodeInstance.flush).not.toHaveBeenCalled();
    });

    it("awaits flush before resolving each concurrent capture", async () => {
      let releaseFlushes!: () => void;
      const flushGate = new Promise<void>((resolve) => {
        releaseFlushes = resolve;
      });
      posthogNodeInstance.flush.mockImplementation(() => {
        callOrder.push("flush");
        return flushGate;
      });
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      const pending = [
        analytics.capture("auth_completed", VALID_PAYLOAD, {
          distinctId: DISTINCT_ID,
        }),
        analytics.capture(
          "invite_accepted",
          { was_authenticated: true },
          { distinctId: DISTINCT_ID },
        ),
        analytics.capture(
          "wishlist_item_added",
          { entry_method: "manual", has_price: true, has_image: false },
          { distinctId: DISTINCT_ID },
        ),
      ];

      // While flush is outstanding, no capture may resolve: every capture
      // awaits its own flush first.
      const sentinel = await Promise.race([
        pending[0],
        Promise.resolve("unresolved"),
      ]);
      expect(sentinel).toBe("unresolved");

      releaseFlushes();
      const results = await Promise.all(pending);
      expect(results).toEqual([
        { ok: true, delivered: true },
        { ok: true, delivered: true },
        { ok: true, delivered: true },
      ]);

      expect(posthogNodeInstance.capture).toHaveBeenCalledTimes(3);
      expect(posthogNodeInstance.flush).toHaveBeenCalledTimes(3);
      // Each capture is immediately followed by its own flush call.
      expect(callOrder).toEqual([
        "capture",
        "flush",
        "capture",
        "flush",
        "capture",
        "flush",
      ]);
    });

    it("never reaches the SDK with a rejected payload", async () => {
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      // Runtime negative test: an incomplete payload is deliberately cast
      // past the compile-time boundary to prove the runtime validator.
      const result = await analytics.capture(
        "group_created",
        { occasion_type: "secret_party" } as never,
        {
          distinctId: DISTINCT_ID,
        },
      );

      expect(result).toMatchObject({ ok: false, code: "missing-key" });
      expect(posthogNodeInstance.capture).not.toHaveBeenCalled();
      expect(posthogNodeInstance.flush).not.toHaveBeenCalled();
    });

    it("reports a delivery failure without throwing and without payload values", async () => {
      posthogNodeInstance.flush.mockRejectedValueOnce(
        new Error("network down with SECRETTOKEN"),
      );
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      const result = await analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
      });

      expect(result).toMatchObject({ ok: false, code: "send-failed" });
      expect(JSON.stringify(result)).not.toContain("SECRETTOKEN");
    });

    it("shutdown is explicit and idempotent", async () => {
      const { getServerAnalytics } = await importServer();
      const analytics = getServerAnalytics();

      const first = analytics.shutdown();
      const second = analytics.shutdown();
      await Promise.all([first, second]);

      expect(posthogNodeInstance.shutdown).toHaveBeenCalledTimes(1);
    });

    it("reuses the same managed client while configuration is unchanged", async () => {
      const { getServerAnalytics } = await importServer();
      getServerAnalytics();
      getServerAnalytics();
      expect(PostHogConstructor).toHaveBeenCalledTimes(1);
    });

    it("falls back to the no-op adapter when the configuration disappears", async () => {
      const { getServerAnalytics } = await importServer();
      getServerAnalytics();
      delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
      const analytics = getServerAnalytics();
      const result = await analytics.capture("auth_completed", VALID_PAYLOAD, {
        distinctId: DISTINCT_ID,
      });
      expect(result).toEqual({ ok: true, delivered: false });
      expect(PostHogConstructor).toHaveBeenCalledTimes(1);
    });
  });
});
