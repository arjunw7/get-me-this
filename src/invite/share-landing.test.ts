import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  pending: vi.fn(),
  begin: vi.fn(),
  coordinator: vi.fn(),
  allowed: vi.fn(),
}));
vi.mock("./share-preview-response", async (original) => ({
  ...(await original<typeof import("./share-preview-response")>()),
  invitationShareResponse: mocks.preview,
}));
vi.mock("./invite-write", () => ({
  createPendingStart: mocks.pending,
  beginFlowFromToken: mocks.begin,
}));
vi.mock("./flow-session", () => ({ readCoordinatorCookie: mocks.coordinator }));
vi.mock("./landing-guard", () => ({
  enforceInviteLandingLimit: mocks.allowed,
}));
import { GET } from "../../app/invite/[opaqueToken]/route";
import { proxy } from "../../proxy";

const token = "A".repeat(43);
const context = { params: Promise.resolve({ opaqueToken: token }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INVITATION_CONTINUATION_COOKIE_SECRET", "B".repeat(42) + "A");
  mocks.allowed.mockResolvedValue(true);
  mocks.coordinator.mockResolvedValue(null);
  mocks.preview.mockResolvedValue(new Response("preview"));
  mocks.pending.mockResolvedValue({
    startId: "d63c417e-6349-4d62-b32a-6c3150cf2b22",
    expiresAt: "2026-11-01T00:00:00Z",
  });
});

it("crawlers cannot start a continuation, create membership or set session cookies", async () => {
  const request = new NextRequest(`https://getmethis.fun/invite/${token}`, {
    headers: { "user-agent": "WhatsApp/2.24" },
  });
  const response = await GET(request, context);
  expect(await response.text()).toBe("preview");
  expect(mocks.pending).not.toHaveBeenCalled();
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(mocks.coordinator).not.toHaveBeenCalled();
  const proxyResponse = await proxy(request);
  expect(proxyResponse.headers.get("set-cookie")).toBeNull();
  expect(proxyResponse.headers.get("x-robots-tag")).toContain("noindex");
});

it("ordinary browser navigation keeps the sealed-cookie, token-free redirect", async () => {
  const response = await GET(
    new NextRequest(`https://getmethis.fun/invite/${token}`, {
      headers: {
        host: "getmethis.fun",
        "x-forwarded-proto": "https",
        "user-agent": "Mozilla/5.0",
      },
    }),
    context,
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://getmethis.fun/invite/start/d63c417e-6349-4d62-b32a-6c3150cf2b22",
  );
  expect(response.headers.get("set-cookie")).not.toContain(token);
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.pending).toHaveBeenCalledWith(token, expect.any(String));
});

it("rate-limited crawler requests receive only a generic preview", async () => {
  mocks.allowed.mockResolvedValue(false);
  await GET(
    new NextRequest(`https://getmethis.fun/invite/${token}`, {
      headers: { "user-agent": "facebookexternalhit/1.1" },
    }),
    context,
  );
  expect(mocks.preview).toHaveBeenCalledWith("");
  expect(mocks.pending).not.toHaveBeenCalled();
});
