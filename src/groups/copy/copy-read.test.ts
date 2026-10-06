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
  const getUser = vi.fn().mockResolvedValue({ data: { user } });
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser },
    from,
  } as never);
  return { from, query, getUser };
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
  it("batches unique authorized IDs into bounded requests and authenticates once", async () => {
    const ids = Array.from(
      { length: 101 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const { query, getUser } = client({ id: "viewer" });
    query.in
      .mockResolvedValueOnce({
        data: [{ copied_from_item_id: ids[0] }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ copied_from_item_id: ids[100] }],
        error: null,
      });
    expect(await loadOwnCopiedItemIds([...ids, ...ids])).toEqual(
      new Set([ids[0], ids[100]]),
    );
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(query.in).toHaveBeenCalledTimes(2);
    expect(query.in).toHaveBeenNthCalledWith(
      1,
      "copied_from_item_id",
      ids.slice(0, 100),
    );
    expect(query.in).toHaveBeenNthCalledWith(2, "copied_from_item_id", [
      ids[100],
    ]);
    expect(query.eq).toHaveBeenNthCalledWith(1, "owner_id", "viewer");
    expect(query.eq).toHaveBeenNthCalledWith(2, "owner_id", "viewer");
  });
  it("preserves confirmed batches on a partial failure and filters against each batch", async () => {
    const ids = Array.from(
      { length: 201 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const { query } = client({ id: "viewer" });
    query.in
      .mockResolvedValueOnce({
        data: [
          { copied_from_item_id: ids[0] },
          { copied_from_item_id: ids[100] },
          { copied_from_item_id: foreign },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
      .mockResolvedValueOnce({
        data: [{ copied_from_item_id: ids[200] }],
        error: null,
      });
    expect(await loadOwnCopiedItemIds(ids)).toEqual(
      new Set([ids[0], ids[200]]),
    );
    expect(query.in).toHaveBeenCalledTimes(3);
  });
});
