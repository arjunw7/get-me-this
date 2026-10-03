import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

// The envelope-sealing secret is server configuration; the tests set a
// fixed synthetic local value so the reseal branch runs.
process.env.INVITATION_CONTINUATION_COOKIE_SECRET = "A".repeat(42) + "E";

/**
 * The server side of the auth-mutation broker: lease acquisition and the
 * self-healing delivery settlement. The settlement's contract (criterion
 * 12): a lingering one-use nonce is presented to the lease and the
 * DATABASE decides — a proven or already-settled delivery continues,
 * an unprovable one blocks honestly, and nothing grants permission to a
 * competing mutation.
 */

const mocks = vi.hoisted(() => ({
  readMutationDelivery: vi.fn(),
  readCoordinatorCookie: vi.fn(),
  recoverAuthLease: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: vi.fn(),
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
    getAll: vi.fn(() => []),
  }),
}));

vi.mock("./flow-session", () => ({
  readCoordinatorCookie: mocks.readCoordinatorCookie,
  readMutationDelivery: mocks.readMutationDelivery,
}));

vi.mock("./invite-write", () => ({
  acquireAuthLease: vi.fn(),
  markDeliveryPending: vi.fn(),
  recoverAuthLease: mocks.recoverAuthLease,
}));

import { acquireMutationLease, settlePendingDelivery } from "./lease-session";

const SECRET = "C".repeat(42) + "E";
const NONCE = "N".repeat(43) + "A";
const COORDINATOR = { secret: SECRET, epoch: 3 };

function deliveredCookie(kind: "deliver" | "clear") {
  return { nonce: NONCE, kind, userId: "0e0a0b0c-1111-4222-8333-444455556666" };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settlePendingDelivery", () => {
  it("reports absent with no cookie writes when no delivery nonce lingers", async () => {
    mocks.readMutationDelivery.mockResolvedValue(null);

    await expect(settlePendingDelivery()).resolves.toBe("absent");
    expect(mocks.recoverAuthLease).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
  });

  it("clears a stale nonce and reports absent when the coordinator is gone", async () => {
    mocks.readMutationDelivery.mockResolvedValue(deliveredCookie("deliver"));
    mocks.readCoordinatorCookie.mockResolvedValue(null);

    await expect(settlePendingDelivery()).resolves.toBe("absent");
    expect(mocks.cookieDelete).toHaveBeenCalledWith(
      "__Host-gmt-invite-mutation",
    );
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("treats an already-idle lease as settled and reseals with the current epoch", async () => {
    // The acknowledgement raced the navigation and its cookie effects were
    // lost: the lease is idle again while the nonce cookie still lingers.
    mocks.readMutationDelivery.mockResolvedValue(deliveredCookie("deliver"));
    mocks.readCoordinatorCookie.mockResolvedValue(COORDINATOR);
    mocks.recoverAuthLease.mockResolvedValue({
      outcome: "idle",
      sessionEpoch: 4,
    });

    await expect(settlePendingDelivery()).resolves.toBe("acknowledged");
    expect(mocks.cookieDelete).toHaveBeenCalledWith(
      "__Host-gmt-invite-mutation",
    );
    const reseal = mocks.cookieSet.mock.calls.find(
      ([name]) => name === "__Host-gmt-invite-coordinator",
    );
    expect(reseal).toBeDefined();
  });

  it("acknowledges a proven delivery and reseals with the advanced epoch", async () => {
    mocks.readMutationDelivery.mockResolvedValue(deliveredCookie("deliver"));
    mocks.readCoordinatorCookie.mockResolvedValue(COORDINATOR);
    mocks.recoverAuthLease.mockResolvedValue({
      outcome: "acknowledged",
      sessionEpoch: 4,
    });

    await expect(settlePendingDelivery()).resolves.toBe("acknowledged");
    expect(mocks.recoverAuthLease).toHaveBeenCalledWith(SECRET, NONCE);
    const reseal = mocks.cookieSet.mock.calls.find(
      ([name]) => name === "__Host-gmt-invite-coordinator",
    );
    expect(reseal).toBeDefined();
  });

  it("clears the coordinator when a proven cleared-session delivery settles", async () => {
    mocks.readMutationDelivery.mockResolvedValue(deliveredCookie("clear"));
    mocks.readCoordinatorCookie.mockResolvedValue(COORDINATOR);
    mocks.recoverAuthLease.mockResolvedValue({
      outcome: "acknowledged",
      sessionEpoch: 4,
    });

    await expect(settlePendingDelivery()).resolves.toBe("acknowledged");
    const clear = mocks.cookieSet.mock.calls.find(
      ([name]) => name === "__Host-gmt-invite-coordinator",
    );
    expect(clear).toBeDefined();
  });

  it("blocks honestly when the nonce proves nothing and the lease abandoned", async () => {
    mocks.readMutationDelivery.mockResolvedValue(deliveredCookie("deliver"));
    mocks.readCoordinatorCookie.mockResolvedValue(COORDINATOR);
    mocks.recoverAuthLease.mockResolvedValue({
      outcome: "abandoned",
      sessionEpoch: 3,
    });

    await expect(settlePendingDelivery()).resolves.toBe("unproven");
    expect(mocks.cookieDelete).toHaveBeenCalledWith(
      "__Host-gmt-invite-mutation",
    );
    // The coordinator is untouched: no epoch was proven.
    expect(
      mocks.cookieSet.mock.calls.find(
        ([name]) => name === "__Host-gmt-invite-coordinator",
      ),
    ).toBeUndefined();
  });

  it("keeps the nonce and reports unavailable while another mutation holds the lease", async () => {
    mocks.readMutationDelivery.mockResolvedValue(deliveredCookie("deliver"));
    mocks.readCoordinatorCookie.mockResolvedValue(COORDINATOR);
    mocks.recoverAuthLease.mockResolvedValue({
      outcome: "unavailable",
      sessionEpoch: null,
    });

    await expect(settlePendingDelivery()).resolves.toBe("unavailable");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

describe("acquireMutationLease", () => {
  it("reports absent without touching the lease when no coordinator exists", async () => {
    mocks.readCoordinatorCookie.mockResolvedValue(null);

    await expect(acquireMutationLease("logout")).resolves.toEqual({
      outcome: "absent",
    });
  });
});
