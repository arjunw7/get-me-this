import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/src/supabase/server";

import {
  classifyReplay,
  deleteOwnItem,
  loadOwnItemForEdit,
  reconcileOwnItem,
  saveReviewedItem,
} from "./item-write";
import type { ValidatedEdit, ValidItem } from "./item-input";

vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const ownerId = "00000000-0000-4000-8000-000000000001";
const savedId = "00000000-0000-4000-8000-000000000002";
const submissionId = "00000000-0000-4000-8000-000000000003";
const itemId = "00000000-0000-4000-8000-000000000004";
const item: ValidItem = {
  title: "Lamp",
  source_url: null,
  retailer: null,
  note: null,
  desire_level: "would_love",
  original_amount_minor: "9007199254740993",
  original_currency: "INR",
};
const wishlist = { id: "00000000-0000-4000-8000-000000000005" };
const currentEdit = {
  id: itemId,
  wishlist_id: wishlist.id,
  owner_id: ownerId,
  ...item,
  converted_amount_minor: "555",
  converted_currency: "USD",
  conversion_rate_source: "fixture",
  conversion_rate_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-09-30T00:00:00Z",
};
const editValue: ValidatedEdit = {
  item: {
    title: "Lamp edited",
    source_url: null,
    retailer: null,
    note: null,
    desire_level: "would_love",
  },
  price: {
    kind: "preserve",
    expected: {
      original_amount_minor: "9007199254740993",
      original_currency: "INR",
    },
  },
};

function setup(
  responses: Record<string, { data?: unknown; error?: unknown }[]>,
) {
  const calls: Array<{
    table: string;
    op: string;
    select?: string;
    filters: Array<[string, string, unknown]>;
    payload?: unknown;
    orders: string[];
  }> = [];
  const client = {
    from(table: string) {
      let operation = "select";
      const call = {
        table,
        op: operation,
        filters: [] as Array<[string, string, unknown]>,
        orders: [] as string[],
        payload: undefined as unknown,
        select: undefined as string | undefined,
      };
      calls.push(call);
      const result = () => {
        call.op = operation;
        const result = responses[`${table}:${operation}`]?.shift() ?? {
          data: null,
          error: null,
        };
        return { data: result.data ?? null, error: result.error ?? null };
      };
      const q: Record<string, unknown> = {
        select(columns: string) {
          call.select = columns;
          return q;
        },
        eq(field: string, value: unknown) {
          call.filters.push(["eq", field, value]);
          return q;
        },
        is(field: string, value: unknown) {
          call.filters.push(["is", field, value]);
          return q;
        },
        order(field: string, options: { ascending: boolean }) {
          call.orders.push(`${field}:${options.ascending}`);
          return q;
        },
        limit() {
          return q;
        },
        maybeSingle: async () => result(),
        single: async () => result(),
        insert(payload: unknown) {
          operation = "insert";
          call.op = operation;
          call.payload = payload;
          return q;
        },
        update(payload: unknown) {
          operation = "update";
          call.op = operation;
          call.payload = payload;
          return q;
        },
        delete() {
          operation = "delete";
          call.op = operation;
          return q;
        },
        then(
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(result()).then(resolve, reject);
        },
      };
      return q;
    },
  };
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe("wishlist item persistence", () => {
  it("classifies replay by the complete normalized payload and exact money pair", () => {
    expect(classifyReplay(item, item)).toBe("match");
    expect(classifyReplay(item, { ...item, title: "corrected" })).toBe(
      "conflict",
    );
    expect(
      classifyReplay(item, {
        ...item,
        original_amount_minor: "9007199254740994",
      }),
    ).toBe("conflict");
  });

  it("loads only an explicitly selected owner item for editing", async () => {
    const row = {
      id: itemId,
      ...item,
      image_url: null,
      image_snapshot_path: null,
      converted_amount_minor: null,
      converted_currency: null,
      conversion_rate_source: null,
      conversion_rate_at: null,
      updated_at: "2026-09-30T00:00:00Z",
    };
    const calls = setup({ "wishlist_items:select": [{ data: row }] });
    expect(await loadOwnItemForEdit(ownerId, itemId)).toEqual(row);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "wishlist_items",
      select: expect.stringContaining("original_amount_minor::text"),
      filters: [
        ["eq", "owner_id", ownerId],
        ["eq", "id", itemId],
      ],
    });
    expect(calls[0].select).not.toContain("*");
  });

  it("checks a live submission key before asking for sort position and inserts only reviewed fields", async () => {
    const calls = setup({
      "wishlists:select": [{ data: wishlist }],
      "wishlist_items:select": [{ data: null }, { data: null }],
      "wishlist_items:insert": [{ data: { id: savedId } }],
    });
    const result = await saveReviewedItem(
      ownerId,
      { kind: "create", submissionId },
      item,
    );
    expect(result).toEqual({ kind: "saved", itemId: savedId, replayed: false });
    expect(calls.map((call) => call.op)).toEqual([
      "select",
      "select",
      "select",
      "insert",
    ]);
    expect(calls[0].filters).toEqual([
      ["eq", "owner_id", ownerId],
      ["eq", "client_submission_id", submissionId],
    ]);
    expect(calls[2].filters).toEqual([
      ["eq", "owner_id", ownerId],
      ["eq", "wishlist_id", wishlist.id],
    ]);
    expect(calls[2].orders).toContain("sort_position:false");
    expect(calls[3].payload).toMatchObject({
      owner_id: ownerId,
      wishlist_id: wishlist.id,
      client_submission_id: submissionId,
      ...item,
      extraction_status: "manual",
      image_url: null,
      image_snapshot_path: null,
    });
  });

  it("returns matching live-key replays and rejects a changed payload without reading sort position", async () => {
    setup({ "wishlist_items:select": [{ data: { id: savedId, ...item } }] });
    expect(
      await saveReviewedItem(ownerId, { kind: "create", submissionId }, item),
    ).toEqual({ kind: "saved", itemId: savedId, replayed: true });
    setup({ "wishlist_items:select": [{ data: { id: savedId, ...item } }] });
    expect(
      await saveReviewedItem(
        ownerId,
        { kind: "create", submissionId },
        { ...item, title: "Other" },
      ),
    ).toEqual({ kind: "submission-conflict", savedItemId: savedId });
  });

  it("atomically predicates edit on the original pair and preserves conversion data when unchanged", async () => {
    const calls = setup({
      "wishlist_items:select": [{ data: currentEdit }],
      "wishlist_items:update": [{ data: [{ id: itemId }] }],
    });
    expect(
      await saveReviewedItem(ownerId, { kind: "edit", itemId }, editValue),
    ).toEqual({ kind: "saved", itemId, replayed: false });
    const update = calls[1];
    expect(update).toMatchObject({
      op: "update",
      filters: [
        ["eq", "owner_id", ownerId],
        ["eq", "id", itemId],
        ["eq", "original_amount_minor", "9007199254740993"],
        ["eq", "original_currency", "INR"],
      ],
    });
    expect(update.payload).not.toHaveProperty("original_amount_minor");
    expect(update.payload).not.toHaveProperty("converted_amount_minor");
  });

  it("checks stale edits before writing and clears the complete conversion tuple only for a changed price", async () => {
    const stale = {
      ...editValue,
      price: {
        kind: "preserve" as const,
        expected: { original_amount_minor: "1", original_currency: "INR" },
      },
    };
    const staleCalls = setup({
      "wishlist_items:select": [{ data: currentEdit }],
    });
    expect(
      await saveReviewedItem(ownerId, { kind: "edit", itemId }, stale),
    ).toEqual({ kind: "retry" });
    expect(staleCalls).toHaveLength(1);

    const replace: ValidatedEdit = {
      ...editValue,
      price: {
        kind: "replace",
        original_amount_minor: "9223372036854775807",
        original_currency: "KWD",
      },
    };
    const calls = setup({
      "wishlist_items:select": [{ data: currentEdit }],
      "wishlist_items:update": [{ data: [{ id: itemId }] }],
    });
    expect(
      await saveReviewedItem(ownerId, { kind: "edit", itemId }, replace),
    ).toEqual({ kind: "saved", itemId, replayed: false });
    expect(calls[1].payload).toMatchObject({
      original_amount_minor: "9223372036854775807",
      original_currency: "KWD",
      converted_amount_minor: null,
      converted_currency: null,
      conversion_rate_source: null,
      conversion_rate_at: null,
    });
  });

  it("returns unavailable after a delete affecting no owner row and reconciles with a fresh owner read", async () => {
    const calls = setup({
      "wishlist_items:delete": [{ data: [] }],
      "wishlist_items:select": [{ data: null }],
    });
    expect(await deleteOwnItem(ownerId, itemId)).toEqual({
      kind: "unavailable",
    });
    expect(await reconcileOwnItem(ownerId, itemId)).toEqual({ kind: "absent" });
    expect(calls[0]).toMatchObject({
      op: "delete",
      filters: [
        ["eq", "owner_id", ownerId],
        ["eq", "id", itemId],
      ],
      select: "id",
    });
    expect(calls[1]).toMatchObject({
      op: "select",
      filters: [
        ["eq", "owner_id", ownerId],
        ["eq", "id", itemId],
      ],
    });
  });

  it("does not infer deletion from ambiguous transport failure", async () => {
    setup({
      "wishlist_items:delete": [
        { data: null, error: { code: "FETCH_ERROR", status: 0 } },
      ],
    });
    expect(await deleteOwnItem(ownerId, itemId)).toEqual({ kind: "uncertain" });
  });

  it("classifies a proved database rejection separately from a committed delete", async () => {
    setup({
      "wishlist_items:delete": [
        { data: null, error: { code: "23503", status: 409 } },
      ],
    });
    expect(await deleteOwnItem(ownerId, itemId)).toEqual({
      kind: "definite-rejection",
    });
    setup({ "wishlist_items:delete": [{ data: [{ id: itemId }] }] });
    expect(await deleteOwnItem(ownerId, itemId)).toEqual({ kind: "deleted" });
  });
});
