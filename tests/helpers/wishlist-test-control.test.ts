import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installWishlistTestFetch } from "@/instrumentation";

import { createWishlistTestControlServer } from "./wishlist-test-control.mjs";

const token = "synthetic-arj28-control-token";
let control: ReturnType<typeof createWishlistTestControlServer> | undefined;
let controlUrl = "";
const activeCases: string[] = [];

async function startController() {
  control = createWishlistTestControlServer({ token });
  const address = await control.listen();
  if (!address || typeof address === "string")
    throw new Error("no controller address");
  controlUrl = `http://127.0.0.1:${address.port}`;
}

async function request(path: string, body?: Record<string, unknown>) {
  return fetch(new URL(path, controlUrl), {
    method: body ? "POST" : "GET",
    headers: {
      "x-arj28-control-token": token,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function registerCase(caseId: string) {
  activeCases.push(caseId);
  const response = await request("/case", { caseId });
  expect(response.status).toBe(200);
}

afterEach(async () => {
  if (originalGlobalFetch) {
    globalThis.fetch = originalGlobalFetch;
    originalGlobalFetch = undefined;
  }
  if (control) {
    for (const caseId of activeCases.splice(0)) {
      await request("/clear", { caseId }).catch(() => undefined);
    }
    await control.close();
    control = undefined;
  }
  delete process.env.E2E_LOCAL_SUPABASE;
  delete process.env.E2E_WISHLIST_CONTROL_URL;
  delete process.env.E2E_WISHLIST_CONTROL_TOKEN;
});

let originalGlobalFetch: typeof fetch | undefined;

describe("ARJ-28 local transport controller", () => {
  it("holds two independent case arrivals until named release and keeps events isolated", async () => {
    await startController();
    const a = randomUUID();
    const b = randomUUID();
    await registerCase(a);
    await registerCase(b);
    const stage = "after-max-before-insert";
    await request("/arm", { caseId: a, stage, arrivals: 1 });
    const participant = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("./wishlist-test-participant.mjs", import.meta.url),
        ),
      ],
      {
        env: {
          NODE_ENV: "test",
          ARJ28_CONTROL_URL: controlUrl,
          ARJ28_CONTROL_TOKEN: token,
          ARJ28_CASE: a,
          ARJ28_STAGE: stage,
          ARJ28_PARTICIPANT: "first",
        },
        stdio: "ignore",
      },
    );
    const waitResponse = await request(`/wait?caseId=${a}&stage=${stage}`);
    expect(waitResponse.status).toBe(200);
    const beforeRelease = await request(`/events?caseId=${a}`);
    expect((await beforeRelease.json()).arrivals).toHaveLength(1);
    const exit = once(participant, "exit");
    const released = await request("/release", {
      caseId: a,
      stage,
      participant: "first",
    });
    expect(released.status).toBe(200);
    expect((await exit)[0]).toBe(0);
    const isolated = await request(`/events?caseId=${b}`);
    expect((await isolated.json()).observations).toEqual([]);
  });

  it("rejects malformed stages, duplicate arms, invalid targets, and non-loopback binds", async () => {
    expect(() =>
      createWishlistTestControlServer({ token, host: "0.0.0.0" }),
    ).toThrow("loopback");
    await startController();
    const caseId = randomUUID();
    await registerCase(caseId);
    expect(
      (await request("/arm", { caseId, stage: "unknown", arrivals: 1 })).status,
    ).toBe(400);
    const stage = "postgrest-reconcile-read-failure";
    expect(
      (
        await request("/arm", {
          caseId,
          stage,
          arrivals: 1,
          targetId: "not-uuid",
          oneShot: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/arm", {
          caseId,
          stage,
          arrivals: 1,
          targetId: randomUUID(),
          oneShot: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/arm", {
          caseId,
          stage,
          arrivals: 1,
          targetId: randomUUID(),
          oneShot: true,
        })
      ).status,
    ).toBe(409);
    const unauthorized = await fetch(`${controlUrl}/events?caseId=${caseId}`);
    expect(unauthorized.status).toBe(401);
  });

  it("isolates a consumed one-shot target and records only sanitized observations", async () => {
    await startController();
    process.env.E2E_LOCAL_SUPABASE = "1";
    process.env.E2E_WISHLIST_CONTROL_URL = controlUrl;
    process.env.E2E_WISHLIST_CONTROL_TOKEN = token;
    const caseId = randomUUID();
    const itemId = randomUUID();
    await registerCase(caseId);
    const stage = "postgrest-reconcile-read-failure";
    await request("/arm", {
      caseId,
      stage,
      arrivals: 1,
      targetId: itemId,
      oneShot: true,
    });
    const arm = await request("/arrive", {
      caseId,
      stage,
      participant: "first",
      probeId: randomUUID(),
      targetId: randomUUID(),
    });
    expect(arm.status).toBe(200);
    expect(await arm.json()).toMatchObject({
      decision: "noop",
      reason: "target-mismatch",
    });
    const held = fetch(`${controlUrl}/arrive`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-arj28-control-token": token,
      },
      body: JSON.stringify({
        caseId,
        stage,
        participant: "first",
        probeId: randomUUID(),
        targetId: itemId,
      }),
    });
    await request(`/wait?caseId=${caseId}&stage=${stage}`);
    const contender = await request("/arrive", {
      caseId,
      stage,
      participant: "second",
      probeId: randomUUID(),
      targetId: itemId,
    });
    expect(await contender.json()).toMatchObject({
      decision: "noop",
      reason: "consumed",
    });
    await request("/release", { caseId, stage });
    expect(await (await held).json()).toMatchObject({
      decision: "released",
      effect: "owner-read-abort",
    });
    await request("/observe", {
      caseId,
      participant: "first",
      kind: "local-rest",
      phase: "attempt",
      targetId: itemId,
    });
    const events = await request(`/events?caseId=${caseId}`);
    const eventData = await events.json();
    expect(eventData).toMatchObject({
      failed: false,
      observations: [
        { kind: "local-rest", phase: "attempt", targetId: itemId },
      ],
    });
    expect(
      eventData.probes.map((probe: { reason?: string }) => probe.reason),
    ).toEqual(["target-mismatch", undefined, "consumed"]);
  });

  it("clears only its own held requests and leaves a tombstone", async () => {
    await startController();
    const a = randomUUID();
    const b = randomUUID();
    await registerCase(a);
    await registerCase(b);
    const stage = "after-max-before-insert";
    await request("/arm", { caseId: a, stage, arrivals: 1 });
    await request("/arm", { caseId: b, stage, arrivals: 1 });
    const held = (caseId: string) =>
      request("/arrive", {
        caseId,
        stage,
        participant: "first",
        probeId: randomUUID(),
      });
    const pendingA = held(a);
    const pendingB = held(b);
    await request(`/wait?caseId=${a}&stage=${stage}`);
    await request(`/wait?caseId=${b}&stage=${stage}`);
    expect((await request("/clear", { caseId: a })).status).toBe(200);
    expect((await pendingA).status).toBe(410);
    expect((await request("/case", { caseId: a })).status).toBe(410);
    await request("/release", { caseId: b, stage });
    expect(await (await pendingB).json()).toMatchObject({
      decision: "released",
    });
    expect((await request(`/events?caseId=${b}`)).status).toBe(200);
  });

  it("pins the installed PostgREST client's non-retried AbortError result", async () => {
    const ownerId = randomUUID();
    const savedId = randomUUID();
    const transport = vi.fn(async () => {
      throw new DOMException("Injected owner read failure", "AbortError");
    });
    const client = createClient(
      "http://127.0.0.1:54321",
      "synthetic-test-key",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: transport as typeof fetch },
      },
    );
    const result = await client
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("id", savedId)
      .maybeSingle();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(0);
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });

  it("records a rejected external fetch without leaking URL or payload and does not recurse", async () => {
    await startController();
    process.env.E2E_LOCAL_SUPABASE = "1";
    process.env.E2E_WISHLIST_CONTROL_URL = controlUrl;
    process.env.E2E_WISHLIST_CONTROL_TOKEN = token;
    const caseId = randomUUID();
    await registerCase(caseId);
    originalGlobalFetch = globalThis.fetch;
    const nativeFetch = globalThis.fetch.bind(globalThis);
    const fakeUnderlying = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (url.origin === controlUrl) return nativeFetch(input, init);
        throw new Error("synthetic transport failure");
      },
    );
    installWishlistTestFetch(fakeUnderlying as typeof fetch, async () => ({
      caseId,
      participant: "first",
    }));
    await expect(
      globalThis.fetch("https://arj28-test.invalid/sentinel?private=yes"),
    ).rejects.toThrow("synthetic transport failure");
    const events = await request(`/events?caseId=${caseId}`);
    const result = await events.json();
    expect(result.observations).toEqual([
      expect.objectContaining({
        kind: "external-host-digest",
        phase: "attempt",
        outcome: null,
      }),
      expect.objectContaining({
        kind: "external-host-digest",
        phase: "settled",
        outcome: "network-error",
        injected: false,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("arj28-test.invalid");
    expect(JSON.stringify(result)).not.toContain("private=yes");
    expect(fakeUnderlying).toHaveBeenCalledTimes(4);
    expect(
      fakeUnderlying.mock.calls.filter(
        ([input]) =>
          new URL(input instanceof Request ? input.url : String(input))
            .origin === controlUrl,
      ),
    ).toHaveLength(3);
    expect(result.failed).toBe(false);
  });
});
