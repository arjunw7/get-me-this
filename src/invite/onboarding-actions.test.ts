import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  flow: vi.fn(),
  client: vi.fn(),
  user: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  profile: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("./flow-session", () => ({ readFlowCookie: mocks.flow }));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.client,
}));
vi.mock("@/src/profile/session", () => ({ getOwnProfile: mocks.profile }));
import { completeOnboardingForInvitationAction } from "./onboarding-actions";
const flowId = "f431c043-c7dc-4bce-81ac-682af38f1a35";
function form(vibe?: string) {
  const data = new FormData();
  data.set("flowId", flowId);
  data.set("displayName", "Ada");
  data.set("userId", "someone-else");
  if (vibe !== undefined) data.set("vibe", vibe);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.flow.mockResolvedValue({ flowId });
  mocks.client.mockResolvedValue({
    auth: { getUser: mocks.user },
    from: mocks.from,
  });
  mocks.user.mockResolvedValue({ data: { user: { id: "owner" } } });
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.profile.mockResolvedValue({ displayName: "Ada" });
});
describe("invitation onboarding Vibe", () => {
  it.each(["tomato", "marigold", "electric", "acid_lime"])(
    "saves %s to the verified owner and preserves invitation continuation",
    async (vibe) => {
      await expect(
        completeOnboardingForInvitationAction({ status: "idle" }, form(vibe)),
      ).rejects.toThrow(`redirect:/invite/continue/${flowId}`);
      expect(mocks.update).toHaveBeenCalledWith({
        display_name: "Ada",
        taste_line: null,
        vibe,
      });
      expect(mocks.eq).toHaveBeenCalledWith("id", "owner");
    },
  );
  it("rejects an invalid Vibe before the profile write", async () => {
    expect(
      await completeOnboardingForInvitationAction(
        { status: "idle" },
        form("pink"),
      ),
    ).toEqual({ status: "error", errors: { vibe: "invalid" } });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("keeps a saved Vibe unchanged for legacy forms", async () => {
    await expect(
      completeOnboardingForInvitationAction({ status: "idle" }, form()),
    ).rejects.toThrow(`redirect:/invite/continue/${flowId}`);
    expect(mocks.update).toHaveBeenCalledWith({
      display_name: "Ada",
      taste_line: null,
    });
  });
  it("cannot write without the verified session", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    await expect(
      completeOnboardingForInvitationAction(
        { status: "idle" },
        form("electric"),
      ),
    ).rejects.toThrow(`redirect:/auth/invite/${flowId}`);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("cannot write when the invitation continuation is unavailable", async () => {
    mocks.flow.mockResolvedValue(null);
    await expect(
      completeOnboardingForInvitationAction(
        { status: "idle" },
        form("electric"),
      ),
    ).rejects.toThrow("redirect:/invite/unavailable");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
