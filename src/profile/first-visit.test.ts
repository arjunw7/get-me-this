import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  single: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.client,
}));
import { getOwnProfile } from "./session";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
    rpc: mocks.rpc,
  });
});
it("creates the caller's app records on first profile access and re-reads under RLS", async () => {
  mocks.single.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({
    data: { display_name: null, taste_line: null, vibe: "marigold" },
  });
  mocks.rpc.mockResolvedValue({ error: null });
  expect(await getOwnProfile("verified-owner")).toEqual({
    displayName: null,
    tasteLine: null,
    vibe: "marigold",
  });
  expect(mocks.rpc).toHaveBeenCalledWith("ensure_get_me_this_account");
  expect(mocks.single).toHaveBeenCalledTimes(2);
});
it("leaves an existing profile untouched", async () => {
  mocks.single.mockResolvedValue({
    data: { display_name: "Aanya", vibe: "electric" },
  });
  expect((await getOwnProfile("verified-owner"))?.displayName).toBe("Aanya");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("fails closed when provisioning is unavailable", async () => {
  mocks.single.mockResolvedValue({ data: null });
  mocks.rpc.mockResolvedValue({
    error: { message: "private provider detail" },
  });
  await expect(getOwnProfile("verified-owner")).rejects.toThrow(
    "Could not open your Get Me This account.",
  );
});
it("does not treat a failed profile read as incomplete onboarding", async () => {
  mocks.single.mockResolvedValue({ data: null, error: { code: "08006" } });
  await expect(getOwnProfile("verified-owner")).rejects.toThrow(
    "Could not open your Get Me This account.",
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not treat a failed read after provisioning as an empty profile", async () => {
  mocks.single
    .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
    .mockResolvedValueOnce({ data: null, error: { code: "08006" } });
  mocks.rpc.mockResolvedValue({ error: null });
  await expect(getOwnProfile("verified-owner")).rejects.toThrow(
    "Could not open your Get Me This account.",
  );
});
