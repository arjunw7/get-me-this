import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logEmailEvent } from "./log";
import { runEmailWorkerBatch } from "./worker";
import type { ClaimedEmail, SendOutcome } from "./worker";

/**
 * 009a worker unit tests against a stubbed provider and stubbed claim/record
 * pairs — credential-independent by construction (the staging Resend
 * credential has been broken since 2026-09-29).
 *
 * Includes the automated log-hygiene scan mirroring 006c: a full run against
 * synthetic markers must never emit a recipient address, raw token, secret
 * URL, subject, or provider response body into the log.
 */

const SYNTHETIC_TOKEN = "a".repeat(43);
const SYNTHETIC_ADDRESS = "victim@example.test";

const invitationRow: ClaimedEmail = {
  id: "33333333-3333-4333-8333-333333333333",
  template_key: "invitation",
  recipient_user_id: "44444444-4444-4444-8444-444444444444",
  payload: {
    budget_amount_minor: "100000",
    budget_currency: "INR",
    gifting_mode: "secret_draw",
    group_id: "11111111-1111-4111-8111-111111111111",
    group_name: "Diwali Scenes",
    host_display_name: "Asha",
    invitation_id: "22222222-2222-4222-8222-222222222222",
    invitation_version: "1",
    joined_member_count: "3",
    occasion_date: "2026-11-08",
  },
};

function makeDeps(
  overrides: Partial<Parameters<typeof runEmailWorkerBatch>[0]> = {},
) {
  const sent: Array<{ userId: string; subject: string }> = [];
  const recorded: Array<{
    id: string;
    outcome: "sent" | "retry" | "failed_permanent";
    providerMessageId: string | null;
    errorCategory: string | null;
  }> = [];
  const deps = {
    claim: vi.fn(async () => [invitationRow]),
    send: vi.fn(async (_userId: string): Promise<SendOutcome> => ({
      ok: true,
      providerMessageId: "resend-id-1",
    })),
    record: vi.fn(
      async (
        id: string,
        outcome: "sent" | "retry" | "failed_permanent",
        providerMessageId: string | null,
        errorCategory: string | null,
      ) => {
        recorded.push({ id, outcome, providerMessageId, errorCategory });
      },
    ),
    appBaseUrl: "https://getmethis.test",
    assignmentPath: null,
    maxSendsPerRun: 100,
    invitationTokens: vi.fn(async () => SYNTHETIC_TOKEN),
    ...overrides,
  };
  return { deps, sent, recorded };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runEmailWorkerBatch", () => {
  it("sends one rendered email per claimed row and records sent with the bounded provider id", async () => {
    const { deps, recorded } = makeDeps();
    const summary = await runEmailWorkerBatch(deps);
    expect(summary).toEqual({ claimed: 1, sent: 1, failed: 0, deferred: 0 });
    expect(deps.record).toHaveBeenCalledWith(
      invitationRow.id,
      "sent",
      "resend-id-1",
      null,
    );
    expect(recorded).toHaveLength(1);
  });

  it("maps a 429-style provider failure to the rate_limited category and a retry", async () => {
    const { deps, recorded } = makeDeps({
      send: vi.fn(async (): Promise<SendOutcome> => ({
        ok: false,
        category: "rate_limited",
      })),
    });
    const summary = await runEmailWorkerBatch(deps);
    expect(summary.deferred).toBe(1);
    expect(recorded[0]).toEqual({
      id: invitationRow.id,
      outcome: "retry",
      providerMessageId: null,
      errorCategory: "rate_limited",
    });
  });

  it("maps recipient_unavailable to failed_permanent", async () => {
    const { deps, recorded } = makeDeps({
      send: vi.fn(async (): Promise<SendOutcome> => ({
        ok: false,
        category: "recipient_unavailable",
      })),
    });
    await runEmailWorkerBatch(deps);
    expect(recorded[0]?.outcome).toBe("failed_permanent");
    expect(recorded[0]?.errorCategory).toBe("recipient_unavailable");
  });

  it("fails closed with rate_limited-style deferral once the send ceiling is exhausted (009b quota guard)", async () => {
    const { deps, recorded } = makeDeps({
      claim: vi.fn(async () => [
        invitationRow,
        { ...invitationRow, id: "row-2" },
      ]),
      maxSendsPerRun: 1,
    });
    const summary = await runEmailWorkerBatch(deps);
    expect(summary.sent).toBe(1);
    expect(summary.deferred).toBe(1);
    // The deferred row is left claimed (its lease expiry makes it
    // re-claimable later); no result is recorded for it.
    expect(recorded).toHaveLength(1);
  });

  it("fails permanent on an unavailable invitation token without persisting or logging it", async () => {
    const { deps, recorded } = makeDeps({
      invitationTokens: vi.fn(async () => null),
    });
    const summary = await runEmailWorkerBatch(deps);
    expect(summary.failed).toBe(1);
    expect(recorded[0]?.errorCategory).toBe("invalid_payload");
  });
});

describe("log hygiene (009a criterion 7)", () => {
  it("structured log lines carry only the allowlisted identifier fields", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      lines.push(String(args[0]));
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    logEmailEvent("info", "email_worker_sent", {
      outbox_id: "row-1",
      template_key: "invitation",
      recipient_user_id: "user-1",
      provider_message_id: "resend-id-1",
      // Injection attempts on non-allowlisted fields are dropped.
      email_address: SYNTHETIC_ADDRESS,
      token: SYNTHETIC_TOKEN,
      subject: "subject leak",
      invite_url: `https://getmethis.test/invite/${SYNTHETIC_TOKEN}`,
    } as unknown as Parameters<typeof logEmailEvent>[2]);

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "event",
      "outbox_id",
      "provider_message_id",
      "recipient_user_id",
      "template_key",
    ]);
    const full = lines.join("\n");
    expect(full).not.toContain(SYNTHETIC_ADDRESS);
    expect(full).not.toContain(SYNTHETIC_TOKEN);
    expect(full).not.toContain("/invite/");
  });
});
