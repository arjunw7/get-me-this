import { describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/src/supabase/server";
import { loadGroupCopiedItemIds } from "./copied-items-read";
vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
it("uses only the authorized projection and filters to the rendered destination IDs", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ item_id: "copy" }, { item_id: "foreign" }, null],
    error: null,
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
  expect(await loadGroupCopiedItemIds("group", "copier", ["copy"])).toEqual(
    new Set(["copy"]),
  );
  expect(rpc).toHaveBeenCalledWith("group_copied_item_ids", {
    p_group_id: "group",
    p_member_id: "copier",
  });
});
describe("unavailable badge data", () => {
  it.each([
    null,
    { rpc: vi.fn().mockResolvedValue({ data: null, error: {} }) },
  ])("shows no copied badge when unavailable", async (client) => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    expect(await loadGroupCopiedItemIds("group", "copier", ["copy"])).toEqual(
      new Set(),
    );
  });
});
