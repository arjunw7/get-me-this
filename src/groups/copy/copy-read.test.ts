import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/src/supabase/server";
import { loadOwnCopiedItemIds } from "./copy-read";
vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
const source = "00000000-0000-4000-8000-0000000000a1";
const foreign = "00000000-0000-4000-8000-0000000000b1";
beforeEach(() => vi.clearAllMocks());
function client(
  user: { id: string } | null,
  data: unknown = [],
  error: unknown = null,
) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  } as never);
  return { from, query };
}
describe("loadOwnCopiedItemIds", () => {
  it("reads only the authenticated owner's copies of already-authorized source items", async () => {
    const { query } = client({ id: "viewer" }, [
      { copied_from_item_id: source },
      { copied_from_item_id: foreign },
    ]);
    expect(await loadOwnCopiedItemIds([source])).toEqual(new Set([source]));
    expect(query.eq).toHaveBeenCalledWith("owner_id", "viewer");
    expect(query.select).toHaveBeenCalledWith("copied_from_item_id");
    expect(query.in).toHaveBeenCalledWith("copied_from_item_id", [source]);
  });
  it("does not read data without a session", async () => {
    const { from } = client(null);
    expect(await loadOwnCopiedItemIds([source])).toEqual(new Set());
    expect(from).not.toHaveBeenCalled();
  });
  it("keeps the write path available if the read fails", async () => {
    client({ id: "viewer" }, null, { message: "unavailable" });
    expect(await loadOwnCopiedItemIds([source])).toEqual(new Set());
  });
  it("does not read for an empty list", async () => {
    const { from } = client({ id: "viewer" });
    expect(await loadOwnCopiedItemIds([])).toEqual(new Set());
    expect(from).not.toHaveBeenCalled();
  });
});
