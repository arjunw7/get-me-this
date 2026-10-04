import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const flowId = "0f0a0b0c-1111-4222-8333-444455556666";
const secret = "A".repeat(43);
vi.stubEnv("INVITATION_CONTINUATION_COOKIE_SECRET", secret);
vi.mock("./flow-session", () => ({
  readFlowCookie: vi.fn().mockResolvedValue({
    flowId: "0f0a0b0c-1111-4222-8333-444455556666",
    browserSecret: "A".repeat(43),
    email: "fixture@example.invalid",
    joinRequested: true,
  }),
}));
vi.mock("./link-carry", () => ({
  sealInviteLinkCarry: vi.fn().mockResolvedValue("synthetic-parked-link"),
}));
import { GET } from "@/app/auth/confirm/invite/[flowId]/route";
import { flowCookieName, parseFlowCookie } from "./continuation-cookie";

it("magic-link parking preserves the original Join decision in the sealed flow", async () => {
  const request = new NextRequest(
    `http://127.0.0.1:3100/auth/confirm/invite/${flowId}?token_hash=synthetic-hash&type=email`,
    { headers: { host: "127.0.0.1:3100" } },
  );
  const response = await GET(request, { params: Promise.resolve({ flowId }) });
  expect(response.status).toBe(302);
  expect(
    await parseFlowCookie(
      response.cookies.get(flowCookieName(flowId))?.value,
      flowId,
      Date.now(),
      secret,
    ),
  ).toMatchObject({ joinRequested: true });
  expect(response.headers.get("location")).toBe(
    `http://127.0.0.1:3100/auth/link/invite/${flowId}`,
  );
});
