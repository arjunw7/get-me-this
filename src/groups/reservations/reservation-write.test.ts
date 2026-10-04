import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/src/supabase/server";

import {
  getMyGroupReservations,
  releaseGroupReservation,
  reserveGroupItem,
} from "./reservation-write";

vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

const groupId = "00000000-0000-4000-8000-0000000000a1";
const itemId = "00000000-0000-4000-8000-000000000001";
const reservationId = "00000000-0000-4000-8000-0000000000b1";

describe("reserveGroupItem", () => {
  it("maps the authoritative reserved verdict", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ result: "reserved", reservation_id: reservationId }],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(reserveGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "confirmed",
      result: "reserved",
    });
    expect(rpc).toHaveBeenCalledWith("reserve_group_item", {
      p_group_id: groupId,
      p_item_id: itemId,
    });
  });

  it("surfaces the friendly conflict verdict unchanged", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ result: "conflict", reservation_id: null }],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(reserveGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "confirmed",
      result: "conflict",
    });
  });

  it("maps a signed-out caller to the generic unavailable outcome", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(null as never);

    await expect(reserveGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("maps a database error to the retry outcome", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: {} });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(reserveGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "retry",
    });
  });

  it("maps an unexpected result vocabulary to unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ result: "exploded", reservation_id: null }],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(reserveGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "unavailable",
    });
  });
});

describe("releaseGroupReservation", () => {
  it("maps the authoritative released verdict", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ result: "released" }],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(
      releaseGroupReservation(groupId, reservationId),
    ).resolves.toEqual({ kind: "confirmed", result: "released" });
    expect(rpc).toHaveBeenCalledWith("release_group_reservation", {
      p_group_id: groupId,
      p_reservation_id: reservationId,
    });
  });

  it("maps a database error to the retry outcome", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: {} });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(
      releaseGroupReservation(groupId, reservationId),
    ).resolves.toEqual({ kind: "retry" });
  });

  it("maps a signed-out caller to the generic unavailable outcome", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(null as never);

    await expect(
      releaseGroupReservation(groupId, reservationId),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});

describe("getMyGroupReservations", () => {
  it("maps the caller's own reservation rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          reservation_id: reservationId,
          item_id: itemId,
          item_title_snapshot: "Fixture Mechanical Keyboard",
        },
      ],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(getMyGroupReservations(groupId)).resolves.toEqual([
      {
        reservationId,
        itemId,
        itemTitleSnapshot: "Fixture Mechanical Keyboard",
      },
    ]);
  });

  it("returns zero rows for every denial class", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(null as never);
    await expect(getMyGroupReservations(groupId)).resolves.toEqual([]);

    const rpc = vi.fn().mockResolvedValue({ data: null, error: {} });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
    await expect(getMyGroupReservations(groupId)).resolves.toEqual([]);
  });
});
