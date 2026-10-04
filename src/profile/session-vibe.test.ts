import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.client,
}));
import { getOwnProfile } from "./session";

describe("owner profile Vibe projection", () => {
  beforeEach(() => {
    mocks.client.mockResolvedValue({ from: mocks.from });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ single: mocks.single });
  });
  it("reads the saved color with the owner-scoped profile", async () => {
    mocks.single.mockResolvedValue({
      data: { display_name: "Aanya", taste_line: null, vibe: "electric" },
    });
    expect(await getOwnProfile("owner-id")).toEqual({
      displayName: "Aanya",
      tasteLine: null,
      vibe: "electric",
    });
    expect(mocks.select).toHaveBeenCalledWith("display_name, taste_line, vibe");
    expect(mocks.eq).toHaveBeenCalledWith("id", "owner-id");
  });
  it("keeps legacy profiles readable with the approved default", async () => {
    mocks.single.mockResolvedValue({
      data: { display_name: "Aanya", taste_line: null },
    });
    expect((await getOwnProfile("owner-id"))?.vibe).toBe("marigold");
  });
  it("does not fabricate a profile when RLS returns no row", async () => {
    mocks.single.mockResolvedValue({ data: null });
    expect(await getOwnProfile("other-id")).toBeNull();
  });
});
