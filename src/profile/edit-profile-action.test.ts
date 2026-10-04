import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.client,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { editProfileAction } from "./edit-profile-action";
function data(name = "Aanya", line = "New taste") {
  const form = new FormData();
  form.set("displayName", name);
  form.set("tasteLine", line);
  form.set("userId", "another-user");
  return form;
}
describe("owner profile edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "owner" } },
      error: null,
    });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { id: "owner" }, error: null });
  });
  it("uses only the verified actor and allowed columns, then refreshes shared displays", async () => {
    expect(await editProfileAction(data())).toEqual({ status: "saved" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "owner");
    expect(mocks.update).toHaveBeenCalledWith({
      display_name: "Aanya",
      taste_line: "New taste",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/home");
    expect(mocks.revalidate).toHaveBeenCalledWith("/wishlist", "layout");
    expect(mocks.revalidate).toHaveBeenCalledWith("/groups", "layout");
  });
  it.each(["tomato", "marigold", "electric", "acid_lime"])(
    "saves the allowed %s Vibe only to the authenticated owner",
    async (vibe) => {
      const form = data();
      form.set("vibe", vibe);
      expect(await editProfileAction(form)).toEqual({ status: "saved" });
      expect(mocks.update).toHaveBeenCalledWith({
        display_name: "Aanya",
        taste_line: "New taste",
        vibe,
      });
      expect(mocks.eq).toHaveBeenCalledWith("id", "owner");
    },
  );
  it.each(["", "coral", "lime", "Electric", "electric ", "pink"])(
    "rejects invalid Vibe %s without writing",
    async (vibe) => {
      const form = data();
      form.set("vibe", vibe);
      expect(await editProfileAction(form)).toEqual({
        status: "error",
        errors: { vibe: "invalid" },
      });
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );
  it("rejects a posted file instead of coercing it to a Vibe", async () => {
    const form = data();
    form.set("vibe", new Blob(["electric"]), "vibe.txt");
    expect(await editProfileAction(form)).toEqual({
      status: "error",
      errors: { vibe: "invalid" },
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("refuses unauthenticated requests without writing", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await editProfileAction(data())).toEqual({
      status: "error",
      failure: "unauthenticated",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects blank or too-long names and lines before any write", async () => {
    expect(await editProfileAction(data(" \u2003"))).toEqual({
      status: "error",
      errors: { displayName: "required" },
    });
    expect(await editProfileAction(data("x".repeat(41)))).toEqual({
      status: "error",
      errors: { displayName: "too-long" },
    });
    expect(await editProfileAction(data("Aanya", "x".repeat(61)))).toEqual({
      status: "error",
      errors: { tasteLine: "too-long" },
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("normalizes a cleared personality line without truncating the name", async () => {
    await editProfileAction(data("  Aanya  ", "  "));
    expect(mocks.update).toHaveBeenCalledWith({
      display_name: "  Aanya  ",
      taste_line: null,
    });
  });
  it("does not claim success after a denied or absent row", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: "private details" },
    });
    expect(await editProfileAction(data())).toEqual({
      status: "error",
      failure: "update-failed",
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
