// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
  bindDraftToDigest,
  clearDraft,
  loadDraftBinding,
  loadOrCreateDraftKey,
  rotateDraftKey,
} from "./draft-key";

/**
 * The browser-side idempotency guard (brief 006b): one UUIDv4 draft key,
 * bound to the attempted payload digest only on submission, kept in session
 * storage, and blocking-safe when storage is unavailable.
 */

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadOrCreateDraftKey", () => {
  it("creates a cryptographically random UUIDv4 key", () => {
    const outcome = loadOrCreateDraftKey();
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.key).toMatch(UUID_V4);
  });

  it("retains the same key across calls and reloads in the tab", () => {
    const first = loadOrCreateDraftKey();
    const second = loadOrCreateDraftKey();
    expect(first).toEqual(second);
  });

  it("refuses to submit when session storage is unavailable", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    const outcome = loadOrCreateDraftKey();
    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects a forged non-UUIDv4 stored key", () => {
    window.sessionStorage.setItem("gmt.groups.create.request-key", "not-a-key");
    expect(loadOrCreateDraftKey()).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("binding", () => {
  it("starts unbound", () => {
    loadOrCreateDraftKey();
    expect(loadDraftBinding()).toBeNull();
  });

  it("binds the attempted digest and keeps it on every later read", () => {
    const outcome = loadOrCreateDraftKey();
    if (!outcome.ok) throw new Error("no key");
    expect(bindDraftToDigest(outcome.key, "abc123")).toBe(true);
    expect(loadDraftBinding()).toEqual({ digest: "abc123" });
    // An edit does not rotate or silently rebind the key or binding.
    expect(loadOrCreateDraftKey()).toEqual(outcome);
    expect(loadDraftBinding()).toEqual({ digest: "abc123" });
  });

  it("cannot bind when storage is unavailable (submission must block)", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(bindDraftToDigest("00000000-0000-4000-8000-00000000000a", "d")).toBe(
      false,
    );
  });
});

describe("rotateDraftKey and clearDraft", () => {
  it("rotates only on the explicit confirmation path", () => {
    const first = loadOrCreateDraftKey();
    if (!first.ok) throw new Error("no key");
    bindDraftToDigest(first.key, "d1");
    const rotated = rotateDraftKey();
    expect(rotated.ok).toBe(true);
    if (rotated.ok) expect(rotated.key).not.toBe(first.key);
    expect(loadDraftBinding()).toBeNull();
  });

  it("clears the submitted key/digest pair on success", () => {
    const first = loadOrCreateDraftKey();
    if (!first.ok) throw new Error("no key");
    bindDraftToDigest(first.key, "d1");
    clearDraft();
    expect(loadDraftBinding()).toBeNull();
    const fresh = loadOrCreateDraftKey();
    expect(fresh.ok).toBe(true);
    if (fresh.ok) expect(fresh.key).not.toBe(first.key);
  });
});
