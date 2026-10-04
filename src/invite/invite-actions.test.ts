import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

// The envelope-sealing secret is server configuration; the tests set a
// fixed synthetic local value so the reseal and cleanup branches run.
process.env.INVITATION_CONTINUATION_COOKIE_SECRET = "A".repeat(42) + "E";

/**
 * The invitation Server Action contract (brief 006c): session-derived
 * authority, bind-before-send, provider-response/reconciliation separation,
 * mismatched-session preservation, confirmed-logout authoritative-inventory
 * cleanup with no false success, and the typed single-attempt
 * `invite_accepted` analytics (only `accepted_now`, only was_authenticated).
 */

const mocks = vi.hoisted(() => ({
  readFlowCookie: vi.fn(),
  readCoordinatorCookie: vi.fn(),
  readAllFlowCookies: vi.fn(),
  acceptFlow: vi.fn(),
  loadFlowState: vi.fn(),
  bindFlowEmail: vi.fn(),
  previewFlow: vi.fn(),
  verifyFlow: vi.fn(),
  discardFlow: vi.fn(),
  invalidateFlowsForLogout: vi.fn(),
  acquireAuthLease: vi.fn(),
  markDeliveryPending: vi.fn(),
  recoverAuthLease: vi.fn(),
  acknowledgeDelivery: vi.fn(),
  capture: vi.fn(),
  getSessionUser: vi.fn(),
  getOwnProfile: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  cookieSet: vi.fn(),
  cookieGet: vi.fn(),
  cookieGetAll: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    getAll: mocks.cookieGetAll,
  }),
  headers: () => ({
    get: (name: string) =>
      name === "host"
        ? "localhost:3000"
        : name === "x-forwarded-proto"
          ? "http"
          : null,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock("./flow-session", () => ({
  readFlowCookie: mocks.readFlowCookie,
  readMutationDelivery: vi.fn().mockResolvedValue(null),
  readCoordinatorCookie: mocks.readCoordinatorCookie,
  readAllFlowCookies: mocks.readAllFlowCookies,
}));

vi.mock("./invite-write", () => ({
  acceptFlow: mocks.acceptFlow,
  loadFlowState: mocks.loadFlowState,
  bindFlowEmail: mocks.bindFlowEmail,
  discardFlow: mocks.discardFlow,
  invalidateFlowsForLogout: mocks.invalidateFlowsForLogout,
  previewFlow: mocks.previewFlow,
  verifyFlow: mocks.verifyFlow,
  acquireAuthLease: mocks.acquireAuthLease,
  markDeliveryPending: mocks.markDeliveryPending,
  recoverAuthLease: mocks.recoverAuthLease,
  acknowledgeDelivery: mocks.acknowledgeDelivery,
}));

vi.mock("@/src/analytics/server", () => ({
  getServerAnalytics: () => ({ capture: mocks.capture }),
}));

vi.mock("@/src/profile/session", () => ({
  getSessionUser: mocks.getSessionUser,
  getOwnProfile: mocks.getOwnProfile,
}));

vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseRequestOnlyClient: vi.fn().mockResolvedValue(null),
}));

import {
  joinGroupInvitationAction,
  requestInvitationEmailAction,
  signOutWithInvitationCleanupAction,
  verifyInvitationCodeAction,
  reconcileInvitationAction,
} from "./invite-actions";

const FLOW_ID = "0f0a0b0c-1111-4222-8333-444455556666";
const USER_ID = "0e0a0b0c-1111-4222-8333-444455556666";
const GROUP_ID = "0d0a0b0c-1111-4222-8333-444455556666";
const BROWSER_SECRET = "A".repeat(42) + "E";
const EMAIL = "person@example.invalid";

const FLOW = { flowId: FLOW_ID, browserSecret: BROWSER_SECRET, email: EMAIL };

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

/** Captures the NEXT_REDIRECT target thrown by a redirect() call. */
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      return error.message.slice("NEXT_REDIRECT:".length);
    }
    throw error;
  }
  return "<no-redirect>";
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readFlowCookie.mockResolvedValue(FLOW);
  mocks.readCoordinatorCookie.mockResolvedValue({
    secret: BROWSER_SECRET,
    epoch: 0,
  });
  mocks.readAllFlowCookies.mockResolvedValue([]);
  mocks.acquireAuthLease.mockResolvedValue({
    outcome: "acquired",
    sessionEpoch: 0,
  });
  mocks.markDeliveryPending.mockResolvedValue({
    outcome: "pending",
    sessionEpoch: 0,
  });
  mocks.recoverAuthLease.mockResolvedValue({
    outcome: "abandoned",
    sessionEpoch: 0,
  });
  mocks.getSessionUser.mockResolvedValue({ id: USER_ID, email: EMAIL });
  mocks.getOwnProfile.mockResolvedValue({
    displayName: "Ada",
    tasteLine: null,
  });
  mocks.loadFlowState.mockResolvedValue({
    state: "accepted",
    groupId: GROUP_ID,
    beganAuthenticated: false,
  });
  const supabase = {
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
  };
  mocks.createSupabaseServerClient.mockResolvedValue(supabase);
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.signOut.mockResolvedValue({});
});

describe("joinGroupInvitationAction", () => {
  it("sends a missing flow cookie to the one generic unavailable state", async () => {
    mocks.readFlowCookie.mockResolvedValue(null);
    const redirect = await redirectOf(() =>
      joinGroupInvitationAction(formData({ flowId: FLOW_ID })),
    );
    expect(redirect).toBe("/invite/unavailable");
    expect(mocks.acceptFlow).not.toHaveBeenCalled();
  });

  it("routes a signed-out visitor to the dedicated invitation email screen", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const redirect = await redirectOf(() =>
      joinGroupInvitationAction(formData({ flowId: FLOW_ID })),
    );
    expect(redirect).toBe(`/auth/invite/${FLOW_ID}`);
    expect(mocks.acceptFlow).not.toHaveBeenCalled();
  });

  it("routes an incomplete profile to invitation onboarding without accepting", async () => {
    mocks.getOwnProfile.mockResolvedValue({
      displayName: null,
      tasteLine: null,
    });
    const redirect = await redirectOf(() =>
      joinGroupInvitationAction(formData({ flowId: FLOW_ID })),
    );
    expect(redirect).toBe(`/onboarding/invite/${FLOW_ID}`);
    expect(mocks.acceptFlow).not.toHaveBeenCalled();
  });

  it("lands on Home after acceptance and emits the typed event once", async () => {
    mocks.acceptFlow.mockResolvedValue({
      kind: "accepted",
      result: "joined",
      groupId: GROUP_ID,
      acceptedNow: true,
    });
    const redirect = await redirectOf(() =>
      joinGroupInvitationAction(formData({ flowId: FLOW_ID })),
    );
    expect(redirect).toBe("/home");
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(
      "invite_accepted",
      { was_authenticated: false },
      { distinctId: USER_ID, group: { id: GROUP_ID } },
    );
  });

  it("emits nothing for a replay or already_joined result", async () => {
    mocks.acceptFlow.mockResolvedValue({
      kind: "accepted",
      result: "replayed",
      groupId: GROUP_ID,
      acceptedNow: false,
    });
    const redirect = await redirectOf(() =>
      joinGroupInvitationAction(formData({ flowId: FLOW_ID })),
    );
    expect(redirect).toBe("/home");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("never claims a committed join failed when the database is unavailable", async () => {
    mocks.acceptFlow.mockResolvedValue({ kind: "unavailable" });
    const redirect = await redirectOf(() =>
      joinGroupInvitationAction(formData({ flowId: FLOW_ID })),
    );
    expect(redirect).toBe("/invite/unavailable");
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

describe("requestInvitationEmailAction", () => {
  it("binds before sending and reseals the cookie only after the send", async () => {
    mocks.previewFlow.mockResolvedValue({
      hostDisplayName: "Ada",
      groupName: "Secret Santa",
      occasionAt: "2026-12-18T00:00:00Z",
      budgetAmountMinor: null,
      budgetCurrency: null,
      mode: "wishlist_only",
      joinedMemberCount: 2,
    });
    mocks.bindFlowEmail.mockResolvedValue("bound");
    const redirect = await redirectOf(() =>
      requestInvitationEmailAction(
        { status: "idle" },
        formData({ flowId: FLOW_ID, email: EMAIL }),
      ),
    );
    // A successful send continues on the dedicated verify screen, with the
    // requested email travelling only inside the resealed flow cookie.
    expect(redirect).toBe(`/auth/invite/${FLOW_ID}/verify`);
    expect(mocks.bindFlowEmail).toHaveBeenCalledWith(
      FLOW_ID,
      BROWSER_SECRET,
      EMAIL,
    );
    // The provider send happened after the binding.
    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1);
    const redirectTo = mocks.signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    expect(redirectTo.options.emailRedirectTo).toBe(
      `http://localhost:3000/auth/confirm/invite/${FLOW_ID}`,
    );
    expect(mocks.cookieSet).toHaveBeenCalled();
  });

  it("preserves the binding for a same-email retry and never overwrites for a different email", async () => {
    mocks.previewFlow.mockResolvedValue({
      hostDisplayName: "Ada",
      groupName: "Secret Santa",
      occasionAt: "2026-12-18T00:00:00Z",
      budgetAmountMinor: null,
      budgetCurrency: null,
      mode: "wishlist_only",
      joinedMemberCount: 2,
    });
    mocks.bindFlowEmail.mockResolvedValue("restart");
    const state = await requestInvitationEmailAction(
      { status: "idle" },
      formData({ flowId: FLOW_ID, email: "someone-else@example.invalid" }),
    );
    expect(state).toEqual({ status: "restart" });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("sends nothing when the flow no longer previews", async () => {
    mocks.previewFlow.mockResolvedValue(null);
    const state = await requestInvitationEmailAction(
      { status: "idle" },
      formData({ flowId: FLOW_ID, email: EMAIL }),
    );
    expect(state).toEqual({ status: "unavailable" });
    expect(mocks.bindFlowEmail).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("verifyInvitationCodeAction", () => {
  it("reconciles a matching existing session without re-verifying", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: EMAIL } },
    });
    mocks.verifyFlow.mockResolvedValue("verified");
    await redirectOf(() =>
      verifyInvitationCodeAction(
        { status: "idle" },
        formData({ flowId: FLOW_ID, code: "123456" }),
      ),
    );
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.verifyFlow).toHaveBeenCalledWith(FLOW_ID, BROWSER_SECRET);
  });

  it("preserves a mismatched existing session and blocks the provider call", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "other@example.invalid" } },
    });
    const state = await verifyInvitationCodeAction(
      { status: "idle" },
      formData({ flowId: FLOW_ID, code: "123456" }),
    );
    expect(state).toEqual({ status: "mismatch" });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.verifyFlow).not.toHaveBeenCalled();
  });

  it("delivers the session without binding when no session exists", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const redirect = await redirectOf(() =>
      verifyInvitationCodeAction(
        { status: "idle" },
        formData({ flowId: FLOW_ID, code: "123456" }),
      ),
    );
    expect(redirect).toBe(`/auth/invite/${FLOW_ID}/reconcile`);
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyFlow).not.toHaveBeenCalled();
  });

  it("refuses a malformed code before any provider call", async () => {
    const state = await verifyInvitationCodeAction(
      { status: "idle" },
      formData({ flowId: FLOW_ID, code: "12a456" }),
    );
    expect(state).toEqual({ status: "invalid-code" });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("signOutWithInvitationCleanupAction", () => {
  it("does not clear the session or claim success when invalidation fails", async () => {
    mocks.readAllFlowCookies.mockResolvedValue([
      { flowId: FLOW_ID, cookie: FLOW },
    ]);
    mocks.invalidateFlowsForLogout.mockResolvedValue("unavailable");
    const redirect = await redirectOf(() =>
      signOutWithInvitationCleanupAction(),
    );
    expect(redirect).toBe("/home?logoutFailed=1");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("signs out, holds the delivery, and clears the flow cookies", async () => {
    mocks.invalidateFlowsForLogout.mockResolvedValue("invalidated");
    mocks.readAllFlowCookies.mockResolvedValue([
      { flowId: FLOW_ID, cookie: FLOW },
    ]);
    mocks.cookieGetAll.mockReturnValue([
      { name: `__Host-gmt-invite-${FLOW_ID}`, value: "sealed" },
      { name: "__Host-gmt-invite-coordinator", value: "sealed" },
      { name: "unrelated-cookie", value: "keep" },
    ]);
    const redirect = await redirectOf(() =>
      signOutWithInvitationCleanupAction(),
    );
    expect(redirect).toBe("/?loggedOut=1");
    expect(mocks.acquireAuthLease).toHaveBeenCalledWith(
      BROWSER_SECRET,
      0,
      "logout",
    );
    expect(mocks.invalidateFlowsForLogout).toHaveBeenCalledWith(
      [FLOW_ID],
      [BROWSER_SECRET],
      BROWSER_SECRET,
    );
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    // The cleared-session delivery is held in delivery_pending behind the
    // one-use nonce cookie; the coordinator cookie survives until the
    // acknowledgement or recovery clears it.
    expect(mocks.markDeliveryPending).toHaveBeenCalledTimes(1);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      `__Host-gmt-invite-${FLOW_ID}`,
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "__Host-gmt-invite-mutation",
      expect.any(String),
      expect.objectContaining({ maxAge: 120 }),
    );
    expect(mocks.cookieSet).not.toHaveBeenCalledWith(
      "__Host-gmt-invite-coordinator",
      "",
      expect.anything(),
    );
    expect(mocks.cookieSet).not.toHaveBeenCalledWith(
      "unrelated-cookie",
      "",
      expect.anything(),
    );
  });

  it("redirects to the honest blocked state when the lease is held elsewhere", async () => {
    mocks.acquireAuthLease.mockResolvedValue({
      outcome: "blocked",
      sessionEpoch: null,
    });
    const redirect = await redirectOf(() =>
      signOutWithInvitationCleanupAction(),
    );
    expect(redirect).toBe("/home?logoutBlocked=1");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.invalidateFlowsForLogout).not.toHaveBeenCalled();
  });

  it("releases the lease and reports the failure when sign-out errors", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("provider down") });
    const redirect = await redirectOf(() =>
      signOutWithInvitationCleanupAction(),
    );
    expect(redirect).toBe("/home?logoutFailed=1");
    expect(mocks.recoverAuthLease).toHaveBeenCalledWith(BROWSER_SECRET, null);
    expect(mocks.markDeliveryPending).not.toHaveBeenCalled();
  });

  it("signs out directly when this browser has no coordinator", async () => {
    mocks.readCoordinatorCookie.mockResolvedValue(null);
    const redirect = await redirectOf(() =>
      signOutWithInvitationCleanupAction(),
    );
    expect(redirect).toBe("/?loggedOut=1");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.acquireAuthLease).not.toHaveBeenCalled();
  });
});

describe("one-click invitation continuation", () => {
  it("remembers the explicit Join click before sending a signed-out recipient to auth", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    expect(
      await redirectOf(() =>
        joinGroupInvitationAction(formData({ flowId: FLOW_ID })),
      ),
    ).toBe(`/auth/invite/${FLOW_ID}`);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.stringContaining(FLOW_ID),
      expect.any(String),
      expect.any(Object),
    );
    expect(mocks.acceptFlow).not.toHaveBeenCalled();
  });
  it("joins automatically after reconciliation when the original Join consent is present", async () => {
    mocks.readFlowCookie.mockResolvedValue({ ...FLOW, joinRequested: true });
    mocks.verifyFlow.mockResolvedValue("verified");
    mocks.acceptFlow.mockResolvedValue({
      kind: "accepted",
      groupId: GROUP_ID,
      acceptedNow: true,
    });
    expect(
      await redirectOf(() =>
        reconcileInvitationAction(
          { status: "idle" },
          formData({ flowId: FLOW_ID }),
        ),
      ),
    ).toBe("/home");
    expect(mocks.acceptFlow).toHaveBeenCalledWith(FLOW_ID, BROWSER_SECRET);
  });
  it("takes a new recipient directly to profile setup after reconciliation", async () => {
    mocks.readFlowCookie.mockResolvedValue({ ...FLOW, joinRequested: true });
    mocks.verifyFlow.mockResolvedValue("verified");
    mocks.getOwnProfile.mockResolvedValue({ displayName: null });
    expect(
      await redirectOf(() =>
        reconcileInvitationAction(
          { status: "idle" },
          formData({ flowId: FLOW_ID }),
        ),
      ),
    ).toBe(`/onboarding/invite/${FLOW_ID}`);
    expect(mocks.acceptFlow).not.toHaveBeenCalled();
  });
  it("does not accept without the original click or with an invalid session binding", async () => {
    mocks.verifyFlow.mockResolvedValue("verified");
    expect(
      await redirectOf(() =>
        reconcileInvitationAction(
          { status: "idle" },
          formData({ flowId: FLOW_ID }),
        ),
      ),
    ).toBe(`/invite/continue/${FLOW_ID}`);
    expect(mocks.acceptFlow).not.toHaveBeenCalled();
    mocks.readFlowCookie.mockResolvedValue({ ...FLOW, joinRequested: true });
    mocks.verifyFlow.mockResolvedValue("unavailable");
    expect(
      await reconcileInvitationAction(
        { status: "idle" },
        formData({ flowId: FLOW_ID }),
      ),
    ).toEqual({ status: "restart" });
    expect(mocks.acceptFlow).not.toHaveBeenCalled();
  });
});
