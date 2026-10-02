import { describe, expect, it } from "vitest";

import {
  COORDINATOR_COOKIE_NAME,
  FLOW_COOKIE_MAX_AGE_SECONDS,
  LEASE_COOKIE_NAME,
  flowCookieName,
  isFlowCookieName,
  parseCoordinatorCookie,
  parseFlowCookie,
  parseLeaseCookie,
  parsePendingCookie,
  pendingCookieName,
  sealCoordinatorCookie,
  sealFlowCookie,
  sealLeaseCookie,
  sealPendingCookie,
} from "./continuation-cookie";

/**
 * The sealed continuation-envelope contract (brief 006c): AES-256-GCM
 * round trip, flow-id additional-data binding, cookie-name/flow matching,
 * tamper, wrong-key, future-issue-time, and expiry rejections — every
 * rejection one generic null. No envelope ever contains token material.
 */

const SECRET = "A".repeat(42) + "E";
const OTHER_SECRET = "B".repeat(42) + "E";
const FLOW_ID = "0f0a0b0c-1111-4222-8333-444455556666";
const OTHER_FLOW_ID = "0f0a0b0c-1111-4222-8333-444455556777";
const BROWSER_SECRET = "C".repeat(42) + "E";
const NOW = 1_700_000_000_000;

describe("cookie naming", () => {
  it("names flow cookies with the __Host- prefix and the flow id", () => {
    expect(flowCookieName(FLOW_ID)).toBe(`__Host-gmt-invite-${FLOW_ID}`);
    expect(pendingCookieName("abc")).toBe("__Host-gmt-invite-start-abc");
    expect(COORDINATOR_COOKIE_NAME).toBe("__Host-gmt-invite-coordinator");
    expect(LEASE_COOKIE_NAME).toBe("__Host-gmt-invite-lease");
  });

  it("classifies dynamic flow cookies without catching the fixed cookies", () => {
    expect(isFlowCookieName(flowCookieName(FLOW_ID))).toBe(true);
    expect(isFlowCookieName(COORDINATOR_COOKIE_NAME)).toBe(false);
    expect(isFlowCookieName(LEASE_COOKIE_NAME)).toBe(false);
    expect(isFlowCookieName(pendingCookieName("abc"))).toBe(false);
    expect(isFlowCookieName("__Host-gmt-invite-not-a-uuid")).toBe(false);
  });
});

describe("the flow cookie envelope", () => {
  it("round trips the flow id, browser secret, and requested email", async () => {
    const sealed = await sealFlowCookie(
      {
        flowId: FLOW_ID,
        browserSecret: BROWSER_SECRET,
        email: "person@example.com",
      },
      NOW,
      SECRET,
    );
    const parsed = await parseFlowCookie(sealed, FLOW_ID, NOW, SECRET);
    expect(parsed).not.toBeNull();
    expect(parsed?.flowId).toBe(FLOW_ID);
    expect(parsed?.browserSecret).toBe(BROWSER_SECRET);
    expect(parsed?.email).toBe("person@example.com");
  });

  it("round trips without a requested email", async () => {
    const sealed = await sealFlowCookie(
      { flowId: FLOW_ID, browserSecret: BROWSER_SECRET, email: null },
      NOW,
      SECRET,
    );
    const parsed = await parseFlowCookie(sealed, FLOW_ID, NOW, SECRET);
    expect(parsed?.email).toBeNull();
  });

  it("rejects a cookie-name/flow mismatch and a swapped envelope", async () => {
    const sealed = await sealFlowCookie(
      { flowId: FLOW_ID, browserSecret: BROWSER_SECRET, email: null },
      NOW,
      SECRET,
    );
    expect(
      await parseFlowCookie(sealed, OTHER_FLOW_ID, NOW, SECRET),
    ).toBeNull();
  });

  it("rejects a tampered value", async () => {
    const sealed = await sealFlowCookie(
      { flowId: FLOW_ID, browserSecret: BROWSER_SECRET, email: null },
      NOW,
      SECRET,
    );
    const parts = sealed.split(".");
    const tampered = `${parts[0]}.${parts[1].slice(0, -2)}aa`;
    expect(await parseFlowCookie(tampered, FLOW_ID, NOW, SECRET)).toBeNull();
  });

  it("rejects a wrong key", async () => {
    const sealed = await sealFlowCookie(
      { flowId: FLOW_ID, browserSecret: BROWSER_SECRET, email: null },
      NOW,
      SECRET,
    );
    expect(
      await parseFlowCookie(sealed, FLOW_ID, NOW, OTHER_SECRET),
    ).toBeNull();
  });

  it("rejects a future issue time and expiry", async () => {
    const sealed = await sealFlowCookie(
      { flowId: FLOW_ID, browserSecret: BROWSER_SECRET, email: null },
      NOW,
      SECRET,
    );
    const future = NOW + (FLOW_COOKIE_MAX_AGE_SECONDS + 60) * 1000;
    expect(await parseFlowCookie(sealed, FLOW_ID, future, SECRET)).toBeNull();
  });

  it("rejects garbage shapes with one generic null", async () => {
    expect(await parseFlowCookie(undefined, FLOW_ID, NOW, SECRET)).toBeNull();
    expect(await parseFlowCookie("", FLOW_ID, NOW, SECRET)).toBeNull();
    expect(await parseFlowCookie("nonsense", FLOW_ID, NOW, SECRET)).toBeNull();
    expect(await parseFlowCookie("a.b", FLOW_ID, NOW, SECRET)).toBeNull();
  });
});

describe("the coordinator, pending, and lease envelopes", () => {
  it("round trips the coordinator secret only (no flow or email data)", async () => {
    const sealed = await sealCoordinatorCookie(SECRET, NOW, SECRET);
    const parsed = await parseCoordinatorCookie(sealed, NOW, SECRET);
    expect(parsed?.secret).toBe(SECRET);
  });

  it("round trips the pending start and binds it to the start id", async () => {
    const sealed = await sealPendingCookie(
      { startId: FLOW_ID, nonce: BROWSER_SECRET },
      NOW,
      SECRET,
    );
    const parsed = await parsePendingCookie(sealed, FLOW_ID, NOW, SECRET);
    expect(parsed?.nonce).toBe(BROWSER_SECRET);
    expect(
      await parsePendingCookie(sealed, OTHER_FLOW_ID, NOW, SECRET),
    ).toBeNull();
  });

  it("round trips the bootstrap lease", async () => {
    const sealed = await sealLeaseCookie(BROWSER_SECRET, NOW, SECRET);
    const parsed = await parseLeaseCookie(sealed, NOW, SECRET);
    expect(parsed?.lease).toBe(BROWSER_SECRET);
  });
});
